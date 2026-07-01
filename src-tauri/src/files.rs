//! Repo file access for the universal file viewer (#40/#44) and the Kanban editor
//! (#141): list a repo's viewable (text-ish) files, read a text file, and — the
//! app's first arbitrary file write — write a text file (`write_text_file`), all
//! with strict path validation (reject `..`/symlink escapes out of the repo).
//! Read content is returned verbatim and treated as untrusted by the frontend
//! (markdown rendered sanitized with no raw HTML; code highlighted from escaped
//! source).
//!
//! **Deliberate writes (path-validated).** Beyond `write_text_file` (#141, the first
//! arbitrary write) and `move_into_repo` (#253, the second), the file-tree context
//! menu (#267) adds the **third and fourth**: `create_dir` makes one new directory
//! level (new-path validation: the *parent* must canonicalize inside the repo, no
//! clobber), and `delete_path` removes a file or directory tree. `delete_path` is the
//! genuinely destructive one, so it keeps hard safety rails: the target must
//! canonicalize **strictly inside** the repo, it **refuses the repo root itself**, and
//! it **never follows a symlink** (a symlinked leaf is rejected, so a delete can't
//! reach the link's target outside the repo). The folder/file **Rename** (#291) adds
//! the **fifth**: `rename_path` renames an in-repo file/dir — the *source* must
//! canonicalize inside the repo (and not be the root), the *destination*'s parent must
//! canonicalize inside the repo, and it refuses to clobber an existing item. All
//! reject `..`/symlink/out-of-repo targets and use only `std::fs` (no shell-out), so
//! they behave identically on macOS/Windows.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Directory names skipped while listing/searching (heavy build/dependency dirs, plus
/// the `.git` VCS-internals dir). `.git` is skipped — narrowing #179, which had listed
/// *all* dot-folders: a `.git` dir holds hundreds–thousands of objects/refs/logs that
/// are not user files, so it both floods the tree and (under the old count cap) crowded
/// real files out of the list. Other dot-folders (`.claude`, `.github`, `.vscode`, …)
/// are still listed.
const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    "out",
    ".next",
];
/// File extensions skipped while listing — binary / non-text formats the viewer
/// can't render (#44). Everything else (incl. extensionless files like `LICENSE`,
/// `Dockerfile`) is listed and shown as text/code.
const SKIP_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "icns", "tiff", "pdf", "woff", "woff2",
    "ttf", "otf", "eot", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "mp4", "mov", "avi",
    "webm", "mkv", "mp3", "wav", "ogg", "flac", "exe", "dll", "so", "dylib", "bin", "wasm", "node",
    "class", "o", "a", "lib", "obj", "dmg", "iso", "jar",
];
/// Safety backstop on recursion depth for the flat `search_files` walk — **not** a
/// feature cap (the lazy `list_dir` tree has no depth limit; the user expands as deep
/// as they like). It only stops a symlink-looped tree from recursing without end, so
/// it's set far beyond any real source nesting.
const MAX_SEARCH_DEPTH: usize = 64;
/// Default cap on the number of `search_files` *results* (not on tree coverage): the
/// picker shows the top matches and the user narrows by typing. This keeps the IPC
/// payload and the rendered list bounded on arbitrarily large repos, while the lazy
/// tree (`list_dir`) imposes no count limit at all.
pub const SEARCH_RESULT_CAP: usize = 500;
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Files larger than this are **skipped** by the content search (#202) — reading +
/// scanning a multi-MB file per keystroke would stall the bounded live walk. Smaller
/// than `MAX_FILE_BYTES` (the viewer's read cap) on purpose: search is a hot path.
const MAX_CONTENT_SEARCH_BYTES: u64 = 2 * 1024 * 1024;
/// At most this many matching lines are returned **per file** by the content search
/// (#202), so one match-dense file can't flood the results; hitting it flags the
/// result `truncated` (no silent cap, mirroring #179).
const MAX_MATCHES_PER_FILE: usize = 3;
/// A content-search snippet is clamped to this many characters; a longer matching
/// line is windowed around the match (with `…` markers) so the hit stays visible.
const SNIPPET_MAX_CHARS: usize = 200;
/// Characters of leading context kept before the match when a long line is windowed.
const SNIPPET_CONTEXT_CHARS: usize = 40;

/// One content-search hit (#202): a matching line inside a file. `path` is
/// repo-relative (POSIX `/`), `line` is 1-based, and `snippet` is the matching line
/// trimmed + clamped to `SNIPPET_MAX_CHARS` (windowed around the match for long
/// lines) — the frontend re-finds + highlights the (case-insensitive) match in it.
#[derive(Debug, Clone, Serialize)]
pub struct ContentMatch {
    pub path: String,
    pub line: usize,
    pub snippet: String,
}

/// The result of `search_file_contents` (#202): the bounded list of matches plus a
/// `truncated` flag set when the global result cap **or** any file's per-file cap was
/// hit, so the UI can surface "more matches not shown" rather than silently dropping
/// them (#179's no-silent-truncation rule).
#[derive(Debug, Clone, Serialize, Default)]
pub struct ContentSearchResult {
    pub matches: Vec<ContentMatch>,
    pub truncated: bool,
}

/// One immediate child of a directory, returned by `list_dir` to drive the **lazy**
/// file tree (#167): the tree fetches a single directory level at a time as folders
/// are expanded, so it supports arbitrarily deep structures and very large repos
/// without ever walking the whole tree. `path` is repo-relative (POSIX `/`); `name`
/// is the last segment (the row label); `is_dir` distinguishes an expandable folder
/// from a viewable file.
#[derive(Debug, Clone, Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

/// Resolve `rel` against `repo`, confining the result inside the repo: the canonical
/// (symlink-resolved) path must stay under the canonical repo, rejecting `..` and
/// symlink escapes (and absolute `rel`, which resolves outside). An empty `rel` is the
/// repo root. Mirrors the containment check `read_text_file` uses.
fn confine(repo: &Path, rel: &str) -> Result<PathBuf, String> {
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    let target = if rel.is_empty() {
        repo.to_path_buf()
    } else {
        repo.join(rel)
    };
    let canon = target.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&canon_repo) {
        return Err("path is outside the repository".to_string());
    }
    Ok(canon)
}

/// Immediate children of one directory (`subdir`, repo-relative; empty = the repo
/// root), for the lazy file tree (#167). Folders come first, then viewable files, each
/// sorted case-insensitively. Heavy/dependency dirs and `.git` (`SKIP_DIRS`) are
/// hidden; binary files (`SKIP_EXTS`) are hidden, but **every** other folder and file
/// is returned — there is no count or depth cap (depth is reached by expanding,
/// one level per call). The path is confined to `repo` (rejects `..`/symlink escapes).
pub fn list_dir(repo: impl AsRef<Path>, subdir: &str) -> Result<Vec<DirEntryInfo>, String> {
    let repo = repo.as_ref();
    let dir = confine(repo, subdir)?;
    let prefix = subdir.trim_matches('/');
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut dirs: Vec<DirEntryInfo> = Vec::new();
    let mut files: Vec<DirEntryInfo> = Vec::new();
    for entry in entries.flatten() {
        let os_name = entry.file_name();
        let name = os_name.to_string_lossy().to_string();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            dirs.push(DirEntryInfo {
                name,
                path: rel,
                is_dir: true,
            });
        } else if is_listable(&path) {
            files.push(DirEntryInfo {
                name,
                path: rel,
                is_dir: false,
            });
        }
    }
    let by_name =
        |a: &DirEntryInfo, b: &DirEntryInfo| a.name.to_lowercase().cmp(&b.name.to_lowercase());
    dirs.sort_by(by_name);
    files.sort_by(by_name);
    dirs.append(&mut files);
    Ok(dirs)
}

/// Search a repo's viewable files for the file picker: a recursive, **deterministic**
/// (each directory's entries are sorted before recursing, so the same files surface on
/// every machine) walk that returns repo-relative paths whose path contains `query`
/// (case-insensitive substring; empty `query` = the first files), excluding
/// heavy/dependency dirs + `.git` (`SKIP_DIRS`) and binaries (`SKIP_EXTS`). An optional
/// `ext` (e.g. `.md`) restricts to that extension. The walk stops once `limit` matches
/// are collected, so the result — and thus the IPC payload and the rendered list —
/// stays bounded on arbitrarily large repos; the user narrows by typing.
pub fn search_files(
    repo: impl AsRef<Path>,
    query: &str,
    ext: Option<&str>,
    limit: usize,
) -> Vec<String> {
    let repo = repo.as_ref();
    let needle = query.trim().to_lowercase();
    let ext = ext.map(|e| e.to_lowercase());
    let mut out = Vec::new();
    search_collect(repo, repo, &needle, ext.as_deref(), limit, &mut out, 0);
    out
}

fn search_collect(
    root: &Path,
    dir: &Path,
    needle: &str,
    ext: Option<&str>,
    limit: usize,
    out: &mut Vec<String>,
    depth: usize,
) {
    if out.len() >= limit || depth > MAX_SEARCH_DEPTH {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    // Sort entries so the walk (and the `limit` cut-off) is deterministic across
    // machines — the old unsorted walk truncated a different arbitrary set per disk.
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    for entry in entries {
        if out.len() >= limit {
            return;
        }
        let os_name = entry.file_name();
        let name = os_name.to_string_lossy();
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            search_collect(root, &path, needle, ext, limit, out, depth + 1);
        } else if is_listable(&path) {
            if let Ok(rel) = path.strip_prefix(root) {
                let rel = rel.to_string_lossy().replace('\\', "/");
                let lower = rel.to_lowercase();
                if ext.is_some_and(|e| !lower.ends_with(e)) {
                    continue;
                }
                if needle.is_empty() || lower.contains(needle) {
                    out.push(rel);
                }
            }
        }
    }
}

/// Search a repo's viewable files **by content** (#202) for the in-tree search: a
/// recursive, **deterministic** (sorted-walk, machine-independent) walk returning the
/// lines containing `query` (case-insensitive substring). Mirrors `search_files`'
/// skip rules (heavy/dependency dirs + `.git` via `SKIP_DIRS`, binaries via
/// `SKIP_EXTS`, path-confined to `repo`) and adds two content-specific bounds: files
/// over `MAX_CONTENT_SEARCH_BYTES` are skipped (too slow to scan live) and at most
/// `MAX_MATCHES_PER_FILE` lines are taken per file. The walk stops at `limit` total
/// matches; hitting either cap sets `truncated` so the UI surfaces it. An empty /
/// whitespace `query` returns no matches (the tree view stays).
pub fn search_file_contents(
    repo: impl AsRef<Path>,
    query: &str,
    limit: usize,
) -> ContentSearchResult {
    let repo = repo.as_ref();
    let needle = query.trim().to_lowercase();
    let mut result = ContentSearchResult::default();
    if needle.is_empty() {
        return result;
    }
    content_search_collect(repo, repo, &needle, limit, &mut result, 0);
    result
}

fn content_search_collect(
    root: &Path,
    dir: &Path,
    needle: &str,
    limit: usize,
    result: &mut ContentSearchResult,
    depth: usize,
) {
    if result.matches.len() >= limit {
        result.truncated = true;
        return;
    }
    if depth > MAX_SEARCH_DEPTH {
        return;
    }
    let Ok(read) = fs::read_dir(dir) else {
        return;
    };
    // Sorted walk → the `limit` cut-off is deterministic across machines (like
    // `search_collect`).
    let mut entries: Vec<_> = read.flatten().collect();
    entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    for entry in entries {
        if result.matches.len() >= limit {
            result.truncated = true;
            return;
        }
        let os_name = entry.file_name();
        let name = os_name.to_string_lossy();
        let path = entry.path();
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            content_search_collect(root, &path, needle, limit, result, depth + 1);
        } else if is_listable(&path) {
            // Skip oversized files — reading + scanning them would stall the live walk.
            let too_big = fs::metadata(&path)
                .map(|m| m.len() > MAX_CONTENT_SEARCH_BYTES)
                .unwrap_or(true);
            if too_big {
                continue;
            }
            let Ok(rel) = path.strip_prefix(root) else {
                continue;
            };
            let rel = rel.to_string_lossy().replace('\\', "/");
            // Read as UTF-8 text; a non-UTF-8 (binary-ish) or unreadable file is skipped.
            let Ok(contents) = fs::read_to_string(&path) else {
                continue;
            };
            let mut per_file = 0usize;
            for (idx, line) in contents.lines().enumerate() {
                if result.matches.len() >= limit {
                    result.truncated = true;
                    return;
                }
                if line.to_lowercase().contains(needle) {
                    if per_file >= MAX_MATCHES_PER_FILE {
                        // This file has more hits than we show — surface, don't hide.
                        result.truncated = true;
                        break;
                    }
                    result.matches.push(ContentMatch {
                        path: rel.clone(),
                        line: idx + 1,
                        snippet: make_snippet(line, needle),
                    });
                    per_file += 1;
                }
            }
        }
    }
}

/// Build a display snippet from a matching `line`: trim surrounding whitespace, and if
/// still longer than `SNIPPET_MAX_CHARS`, window it around the first match occurrence
/// with `…` markers so the hit stays visible. Char-based throughout (never slices a
/// `str` at a non-boundary), so it's safe for any UTF-8 line.
fn make_snippet(line: &str, needle: &str) -> String {
    let trimmed = line.trim();
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= SNIPPET_MAX_CHARS {
        return trimmed.to_string();
    }
    // Locate the match as a char index. `.find` returns a valid byte boundary in the
    // lowercased string, so counting chars up to it is panic-free; using that count
    // against the original char vec is approximate only when lowercasing changes char
    // counts (rare), which at worst shifts the window slightly.
    let lowered = trimmed.to_lowercase();
    let match_char = lowered
        .find(needle)
        .map(|b| lowered[..b].chars().count())
        .unwrap_or(0)
        .min(chars.len());
    let start = match_char.saturating_sub(SNIPPET_CONTEXT_CHARS);
    let end = (start + SNIPPET_MAX_CHARS).min(chars.len());
    let start = end.saturating_sub(SNIPPET_MAX_CHARS);
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.extend(&chars[start..end]);
    if end < chars.len() {
        out.push('…');
    }
    out
}

/// A file worth listing in the viewer: not an obvious binary by extension.
fn is_listable(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => !SKIP_EXTS.iter().any(|s| ext.eq_ignore_ascii_case(s)),
        None => true, // extensionless (LICENSE, Dockerfile, Makefile, …) is text
    }
}

/// Read a repo-relative text file, validating it stays inside `repo` — the
/// canonical-path check rejects `..` and symlinks that escape the repo (and an
/// absolute `file` resolves outside, so it's rejected too). Capped at a few MB.
pub fn read_text_file(repo: impl AsRef<Path>, file: &str) -> Result<String, String> {
    let repo = repo.as_ref();
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    let canon_target = repo.join(file).canonicalize().map_err(|e| e.to_string())?;
    if !canon_target.starts_with(&canon_repo) {
        return Err("path is outside the repository".to_string());
    }
    let len = fs::metadata(&canon_target)
        .map_err(|e| e.to_string())?
        .len();
    if len > MAX_FILE_BYTES {
        return Err("file is too large to display".to_string());
    }
    fs::read_to_string(&canon_target).map_err(|e| e.to_string())
}

/// Whether `file` (repo-relative) exists as a regular file inside `repo` (#118) —
/// path-validated like `read_text_file` (canonical paths reject `..`/symlink
/// escapes and absolute targets). Used to resolve a template's `open-file` block;
/// a missing/escaping path → false (the panel shows "File not found" + Retry).
pub fn file_exists(repo: impl AsRef<Path>, file: &str) -> bool {
    let repo = repo.as_ref();
    let Ok(canon_repo) = repo.canonicalize() else {
        return false;
    };
    let Ok(canon_target) = repo.join(file).canonicalize() else {
        return false;
    };
    canon_target.starts_with(&canon_repo) && canon_target.is_file()
}

/// Write `contents` to a repo-relative `file`, validating it stays inside `repo`
/// (#141 — the app's first arbitrary file write, backing the Kanban editor). The
/// path is confined to the repo the same way `read_text_file` reads:
///   - an existing file/symlink is canonicalized whole (rejecting a symlink that
///     escapes the repo), and
///   - a new file's *parent* directory is canonicalized (it must exist and be
///     inside the repo), so `..` / absolute / out-of-repo targets are rejected.
///
/// The parent directory must already exist (we create/overwrite a file, not dirs).
/// Capped at the same few-MB limit as reads.
pub fn write_text_file(repo: impl AsRef<Path>, file: &str, contents: &str) -> Result<(), String> {
    let repo = repo.as_ref();
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    if contents.len() as u64 > MAX_FILE_BYTES {
        return Err("file is too large to write".to_string());
    }
    let target = repo.join(file);
    let write_path = match target.canonicalize() {
        // Already exists: the canonical (symlink-resolved) path must stay in the repo.
        Ok(canon) => {
            if !canon.starts_with(&canon_repo) {
                return Err("path is outside the repository".to_string());
            }
            canon
        }
        // New file: validate the parent dir is inside the repo, then write into it.
        Err(_) => {
            let parent = target.parent().ok_or("invalid path")?;
            let canon_parent = parent.canonicalize().map_err(|e| e.to_string())?;
            if !canon_parent.starts_with(&canon_repo) {
                return Err("path is outside the repository".to_string());
            }
            let name = target.file_name().ok_or("invalid file name")?;
            canon_parent.join(name)
        }
    };
    fs::write(&write_path, contents).map_err(|e| e.to_string())
}

/// Whether a `rename` failure is a cross-volume error (the source and destination are
/// on different filesystems, so `fs::rename` can't work) — `EXDEV` on unix, the
/// `ERROR_NOT_SAME_DEVICE` code on Windows. Used to decide when to fall back to a
/// copy-then-remove move. (`std::io::ErrorKind::CrossesDevices` is not yet stable, so
/// we match the raw OS error codes, which is portable here.)
fn is_cross_device(err: &std::io::Error) -> bool {
    #[cfg(unix)]
    let codes: &[i32] = &[18]; // EXDEV
    #[cfg(windows)]
    let codes: &[i32] = &[17]; // ERROR_NOT_SAME_DEVICE
    #[cfg(not(any(unix, windows)))]
    let codes: &[i32] = &[];
    err.raw_os_error()
        .map(|c| codes.contains(&c))
        .unwrap_or(false)
}

/// Recursively copy `src` (a file or directory) to `dst` (which must not exist). The
/// cross-volume fallback for `move_into_repo` — std has no recursive copy. Files use
/// `fs::copy`; a directory is created and its entries copied in turn.
fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(src).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        fs::create_dir(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Move an external OS file/directory (`source`, an absolute OS-native path the user
/// dragged in) **into** the repo directory `dest_subdir` (#253 — the second deliberate
/// `files.rs` write after `write_text_file`). The **destination** is confined to the
/// repo (must resolve to an existing directory inside it); the **source** is *not*
/// confined — it's the user's explicit drag, like the #163 native-dialog consent. The
/// destination filename is derived from the source's own `file_name()` (so the
/// frontend never does OS-separator handling). A name collision in the target dir is
/// **refused** (no overwrite). The move is data-safe: a same-volume `fs::rename`, else
/// (cross-volume) a recursive copy followed by removing the source **only after** the
/// copy fully succeeds — so a mid-operation failure can never lose the original.
/// Returns the new **repo-relative POSIX** path (matching `list_dir`) for the
/// post-drop refresh + toast. No shell-out, so it behaves identically on macOS/Windows.
pub fn move_into_repo(
    repo: impl AsRef<Path>,
    dest_subdir: &str,
    source: &str,
) -> Result<String, String> {
    let repo = repo.as_ref();
    // Confine the destination directory to the repo (rejects `..`/symlink escapes); it
    // must already exist as a directory (we move into it, we don't create the tree).
    let dir = confine(repo, dest_subdir)?;
    if !dir.is_dir() {
        return Err("destination is not a directory".to_string());
    }
    let src = Path::new(source);
    let src_meta =
        fs::symlink_metadata(src).map_err(|_| format!("cannot read dropped item `{source}`"))?;
    let os_name = src.file_name().ok_or("dropped item has no file name")?;
    let name = os_name.to_string_lossy().to_string();
    let dest = dir.join(os_name);
    // Refuse to clobber an existing item (collision → error, no overwrite).
    if dest.symlink_metadata().is_ok() {
        return Err(format!("`{name}` already exists here"));
    }
    match fs::rename(src, &dest) {
        Ok(()) => {}
        Err(e) if is_cross_device(&e) => {
            // Different volume: copy the whole item across, then remove the source —
            // copy-first ordering means a failure leaves the original intact.
            copy_recursive(src, &dest)?;
            let removed = if src_meta.is_dir() {
                fs::remove_dir_all(src)
            } else {
                fs::remove_file(src)
            };
            removed.map_err(|e| e.to_string())?;
        }
        Err(e) => return Err(e.to_string()),
    }
    let prefix = dest_subdir.trim_matches('/');
    Ok(if prefix.is_empty() {
        name
    } else {
        format!("{prefix}/{name}")
    })
}

/// Create one new (empty) directory at repo-relative `path` (#267 — the **third**
/// deliberate `files.rs` write). Validated like `write_text_file`'s new-path branch:
/// the target's **parent** directory must canonicalize **inside** the repo (so `..` /
/// absolute / out-of-repo paths are rejected), and the target must **not already
/// exist** (no clobber, mirroring `move_into_repo`). Only the single leaf directory is
/// created — the parent is an existing tree level. The caller (`commands::create_dir`)
/// additionally guards the new leaf's *name* (no separators, `.`/`..`, or — on Windows
/// — a reserved device name).
pub fn create_dir(repo: impl AsRef<Path>, path: &str) -> Result<(), String> {
    let repo = repo.as_ref();
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    let target = repo.join(path);
    // Refuse to clobber an existing file/dir/symlink (no overwrite).
    if target.symlink_metadata().is_ok() {
        return Err("a file or folder with that name already exists".to_string());
    }
    // The parent dir must exist and be inside the repo (we create one level only).
    let parent = target.parent().ok_or("invalid path")?;
    let canon_parent = parent.canonicalize().map_err(|e| e.to_string())?;
    if !canon_parent.starts_with(&canon_repo) {
        return Err("path is outside the repository".to_string());
    }
    let name = target.file_name().ok_or("invalid folder name")?;
    fs::create_dir(canon_parent.join(name)).map_err(|e| e.to_string())
}

/// Rename (or move within the repo) the repo-relative file or directory at `from` to
/// `to` (#291 — the **fifth** deliberate `files.rs` write, backing the file-tree
/// folder/file **Rename**). Both endpoints are confined to the repo, with these rails:
///   - `from` must canonicalize **inside** the repo (rejecting `..`/symlink escapes)
///     and must **not equal the repo root** (we never rename the repository itself);
///   - `to`'s **parent** directory is canonicalized the way `create_dir` validates a
///     new path — it must exist and be **inside** the repo (so `..` / absolute /
///     out-of-repo destinations are rejected). `to` itself must **not already exist**
///     (no clobber, mirroring `move_into_repo`).
///
/// Only `fs::rename` is used (same-volume within one repo — a folder and its contents
/// move atomically). Returns the destination **repo-relative POSIX** path (matching
/// `list_dir`). No shell-out, so it behaves identically on macOS/Windows.
pub fn rename_path(repo: impl AsRef<Path>, from: &str, to: &str) -> Result<String, String> {
    let repo = repo.as_ref();
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    // Confine the source: it must exist inside the repo and not be the repo root.
    let src = confine(repo, from)?;
    if src == canon_repo {
        return Err("refusing to rename the repository root".to_string());
    }
    // Resolve the destination without requiring it to exist: its parent must
    // canonicalize inside the repo (rejects `..`/absolute/out-of-repo), and the leaf
    // must not already exist.
    let target = repo.join(to);
    if target.symlink_metadata().is_ok() {
        return Err("a file or folder with that name already exists".to_string());
    }
    let parent = target.parent().ok_or("invalid path")?;
    let canon_parent = parent.canonicalize().map_err(|e| e.to_string())?;
    if !canon_parent.starts_with(&canon_repo) {
        return Err("path is outside the repository".to_string());
    }
    let name = target.file_name().ok_or("invalid file name")?;
    let dst = canon_parent.join(name);
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(to.replace('\\', "/").trim_matches('/').to_string())
}

/// Delete the repo-relative file or directory at `path` (#267 — the **fourth**
/// deliberate `files.rs` write, and the genuinely destructive one; a directory is
/// removed **recursively**). Hard safety rails, all enforced before any removal:
///   - `path` must be non-empty;
///   - the **leaf is never a symlink** — a symlinked target is rejected (we don't
///     follow it, so a delete can't reach the link's target outside the repo, nor
///     wipe a directory the link merely points at);
///   - the canonical (symlink-resolved) target must stay **strictly inside** the
///     repo (rejecting `..` / out-of-repo escapes), and must **not equal the repo
///     root** (we never delete the repository itself).
///
/// Any failed check returns a typed error and removes nothing.
pub fn delete_path(repo: impl AsRef<Path>, path: &str) -> Result<(), String> {
    let repo = repo.as_ref();
    if path.trim().is_empty() {
        return Err("refusing to delete the repository root".to_string());
    }
    let canon_repo = repo.canonicalize().map_err(|e| e.to_string())?;
    let target = repo.join(path);
    // `symlink_metadata` does not follow the leaf — so we can both reject a symlink
    // and read the true file/dir type without traversing it.
    let meta = fs::symlink_metadata(&target).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("refusing to delete a symlink".to_string());
    }
    // Canonicalize + confine: the real path must stay inside the repo and not be the
    // repo root. (Intermediate components are symlink-resolved here; anything landing
    // outside the repo is rejected by the containment check.)
    let canon = target.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&canon_repo) {
        return Err("path is outside the repository".to_string());
    }
    if canon == canon_repo {
        return Err("refusing to delete the repository root".to_string());
    }
    if meta.is_dir() {
        fs::remove_dir_all(&canon).map_err(|e| e.to_string())
    } else {
        fs::remove_file(&canon).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("recue-files-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn list_dir_returns_one_level_folders_first_excluding_heavy_and_binaries() {
        let dir = tmp("listdir");
        fs::write(dir.join("README.md"), "# hi").unwrap();
        fs::write(dir.join("LICENSE"), "MIT").unwrap(); // extensionless → text
        fs::write(dir.join("logo.png"), "binary").unwrap(); // binary ext → skipped
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/lib.ts"), "export {}").unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::write(dir.join("node_modules/pkg/x.js"), "skip").unwrap();
        // `.git` is skipped now; other dot-folders are still listed.
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git/config"), "[core]").unwrap();
        fs::create_dir_all(dir.join(".claude")).unwrap();

        let root = list_dir(&dir, "").unwrap();
        let names: Vec<&str> = root.iter().map(|e| e.name.as_str()).collect();
        // Folders come first (`.claude`, `src`), then files (`LICENSE`, `README.md`).
        assert_eq!(names, vec![".claude", "src", "LICENSE", "README.md"]);
        // `.git`, `node_modules`, and the binary are excluded; `src` is a folder.
        assert!(!names.contains(&".git"));
        assert!(!names.contains(&"node_modules"));
        assert!(!names.contains(&"logo.png"));
        assert!(root.iter().find(|e| e.name == "src").unwrap().is_dir);

        // Lazy descent: listing `src` returns its child, with a repo-relative path.
        let src = list_dir(&dir, "src").unwrap();
        assert_eq!(src.len(), 1);
        assert_eq!(src[0].path, "src/lib.ts");
        assert!(!src[0].is_dir);

        // Traversal escapes are rejected.
        assert!(list_dir(&dir, "../..").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_files_matches_substring_and_has_no_count_cap() {
        let dir = tmp("search");
        fs::write(dir.join("README.md"), "# hi").unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/store.ts"), "export {}").unwrap();
        fs::write(dir.join("KANBAN.md"), "# board").unwrap();
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::write(dir.join("node_modules/store.ts"), "skip").unwrap();
        // Far more than the old 500 cap — every one is reachable via search.
        for i in 0..600 {
            fs::write(dir.join(format!("note-{i:04}.md")), "x").unwrap();
        }

        // Empty query returns the first results (bounded by the limit), deterministically.
        let first = search_files(&dir, "", None, 50);
        assert_eq!(first.len(), 50);

        // A specific name is found even though it sorts past the old 500-file cap —
        // the user-created board is never silently dropped now.
        let kanban = search_files(&dir, "kanban", None, SEARCH_RESULT_CAP);
        assert_eq!(kanban, vec!["KANBAN.md".to_string()]);

        // Substring match across nested dirs, skipping node_modules.
        let store = search_files(&dir, "store", None, SEARCH_RESULT_CAP);
        assert_eq!(store, vec!["src/store.ts".to_string()]);

        // The `.md` extension filter (Kanban picker) restricts results.
        let md = search_files(&dir, "readme", Some(".md"), SEARCH_RESULT_CAP);
        assert_eq!(md, vec!["README.md".to_string()]);
        let ts = search_files(&dir, "store", Some(".md"), SEARCH_RESULT_CAP);
        assert!(ts.is_empty());

        // No count cap on coverage: all 600 notes + the other files are searchable.
        let all_notes = search_files(&dir, "note-", None, 1000);
        assert_eq!(all_notes.len(), 600);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_file_contents_matches_lines_case_insensitively_with_snippets() {
        let dir = tmp("content-search");
        fs::write(
            dir.join("a.ts"),
            "import { useStore } from \"./store\";\nconst x = 1;\nUSESTORE_AGAIN();\n",
        )
        .unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/b.rs"), "// nothing here\nfn main() {}\n").unwrap();
        // Skipped: node_modules dir, a binary ext, and `.git`.
        fs::create_dir_all(dir.join("node_modules")).unwrap();
        fs::write(dir.join("node_modules/c.ts"), "useStore everywhere").unwrap();
        fs::write(dir.join("logo.png"), "useStore").unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git/config"), "useStore").unwrap();

        let res = search_file_contents(&dir, "usestore", SEARCH_RESULT_CAP);
        // Two hits in a.ts (line 1 + line 3), none from skipped locations.
        assert_eq!(res.matches.len(), 2);
        assert!(!res.truncated);
        assert_eq!(res.matches[0].path, "a.ts");
        assert_eq!(res.matches[0].line, 1);
        assert!(res.matches[0].snippet.contains("useStore"));
        assert_eq!(res.matches[1].line, 3);
        // Skipped sources never appear.
        assert!(res.matches.iter().all(|m| m.path == "a.ts"));

        // Empty query → no content matches (the tree stays).
        assert!(search_file_contents(&dir, "   ", SEARCH_RESULT_CAP)
            .matches
            .is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_file_contents_caps_per_file_and_total_and_flags_truncation() {
        let dir = tmp("content-search-caps");
        // One file with many matching lines → capped at MAX_MATCHES_PER_FILE, flagged.
        let many = (0..20)
            .map(|i| format!("needle line {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(dir.join("dense.txt"), many).unwrap();
        let capped = search_file_contents(&dir, "needle", SEARCH_RESULT_CAP);
        assert_eq!(capped.matches.len(), MAX_MATCHES_PER_FILE);
        assert!(capped.truncated);

        // A tiny global limit truncates across files too.
        fs::write(dir.join("other.txt"), "needle once\n").unwrap();
        let limited = search_file_contents(&dir, "needle", 2);
        assert_eq!(limited.matches.len(), 2);
        assert!(limited.truncated);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_file_contents_skips_oversized_files() {
        let dir = tmp("content-search-big");
        // A file just over the content-search size cap is skipped even though it matches.
        let big = "z".repeat((MAX_CONTENT_SEARCH_BYTES + 16) as usize) + "\nneedle\n";
        fs::write(dir.join("big.txt"), big).unwrap();
        fs::write(dir.join("small.txt"), "needle\n").unwrap();
        let res = search_file_contents(&dir, "needle", SEARCH_RESULT_CAP);
        assert_eq!(res.matches.len(), 1);
        assert_eq!(res.matches[0].path, "small.txt");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn make_snippet_windows_long_lines_around_the_match() {
        // Short line: returned trimmed, unchanged.
        assert_eq!(make_snippet("  hello world  ", "world"), "hello world");
        // Long line with the match far in: windowed with ellipsis markers, match kept.
        let long = format!("{}MATCH{}", "a".repeat(300), "b".repeat(300));
        let snip = make_snippet(&long, "match");
        assert!(snip.contains("MATCH"));
        assert!(snip.starts_with('…'));
        assert!(snip.ends_with('…'));
        assert!(snip.chars().count() <= SNIPPET_MAX_CHARS + 2); // + the two … markers
    }

    #[test]
    fn reads_a_file_inside_the_repo() {
        let dir = tmp("read");
        fs::write(dir.join("a.md"), "hello").unwrap();
        assert_eq!(read_text_file(&dir, "a.md").unwrap(), "hello");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_and_writes_an_out_of_repo_file_via_its_parent_dir(/* #163 */) {
        // An arbitrary absolute file `/a/b/note.md` is opened (#163) as
        // { repo: "/a/b", file: "note.md" } — its own parent dir as the root. A bare
        // basename can't escape its parent, so the existing containment validation
        // passes and read/write/file_exists all work with no backend change.
        let dir = tmp("absfile");
        fs::write(dir.join("note.md"), "outside").unwrap();
        assert_eq!(read_text_file(&dir, "note.md").unwrap(), "outside");
        assert!(file_exists(&dir, "note.md"));
        write_text_file(&dir, "note.md", "edited").unwrap();
        assert_eq!(read_text_file(&dir, "note.md").unwrap(), "edited");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_path_traversal() {
        let dir = tmp("traversal");
        fs::write(dir.join("a.md"), "x").unwrap();
        // Escaping the repo must be rejected (canonical path lands outside, or
        // the target doesn't exist and canonicalize fails) — never read.
        assert!(read_text_file(&dir, "../../../../../../etc/hosts").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_exists_checks_presence_inside_the_repo() {
        let dir = tmp("exists");
        fs::write(dir.join("present.md"), "hi").unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("sub/nested.txt"), "x").unwrap();
        assert!(file_exists(&dir, "present.md"));
        assert!(file_exists(&dir, "sub/nested.txt"));
        assert!(!file_exists(&dir, "missing.md"));
        // A directory is not a file; traversal escapes are rejected.
        assert!(!file_exists(&dir, "sub"));
        assert!(!file_exists(&dir, "../../../../etc/hosts"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn writes_a_new_and_overwrites_an_existing_file_inside_the_repo() {
        let dir = tmp("write");
        fs::create_dir_all(dir.join("sub")).unwrap();
        // New file in the repo root and in an existing subdir.
        write_text_file(&dir, "board.md", "# hi").unwrap();
        write_text_file(&dir, "sub/nested.md", "nested").unwrap();
        assert_eq!(read_text_file(&dir, "board.md").unwrap(), "# hi");
        assert_eq!(read_text_file(&dir, "sub/nested.md").unwrap(), "nested");
        // Overwrite.
        write_text_file(&dir, "board.md", "# bye").unwrap();
        assert_eq!(read_text_file(&dir, "board.md").unwrap(), "# bye");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_rejects_paths_outside_the_repo() {
        let dir = tmp("write-escape");
        // Traversal, absolute, and a non-existent parent dir are all rejected;
        // nothing is written outside the repo.
        assert!(write_text_file(&dir, "../escape.md", "x").is_err());
        assert!(write_text_file(&dir, "../../../../../../tmp/escape.md", "x").is_err());
        assert!(write_text_file(&dir, "/etc/recue-escape.md", "x").is_err());
        assert!(write_text_file(&dir, "nope/deep/x.md", "x").is_err()); // parent missing
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn moves_a_file_into_the_repo_root_and_a_subdir() {
        let repo = tmp("move-repo");
        fs::create_dir_all(repo.join("sub")).unwrap();
        // An external source dir (a sibling of the repo) holds the dragged files.
        let ext = tmp("move-src");
        fs::write(ext.join("dropped.txt"), "hello").unwrap();
        fs::write(ext.join("into-sub.txt"), "world").unwrap();

        // Into the repo root (empty dest_subdir).
        let rel = move_into_repo(&repo, "", ext.join("dropped.txt").to_str().unwrap()).unwrap();
        assert_eq!(rel, "dropped.txt");
        assert_eq!(read_text_file(&repo, "dropped.txt").unwrap(), "hello");
        // The source was removed (it's a move, not a copy).
        assert!(!ext.join("dropped.txt").exists());

        // Into a subdir — the returned path is repo-relative POSIX.
        let rel = move_into_repo(&repo, "sub", ext.join("into-sub.txt").to_str().unwrap()).unwrap();
        assert_eq!(rel, "sub/into-sub.txt");
        assert_eq!(read_text_file(&repo, "sub/into-sub.txt").unwrap(), "world");

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&ext);
    }

    #[test]
    fn moves_a_directory_recursively_into_the_repo() {
        let repo = tmp("move-dir-repo");
        let ext = tmp("move-dir-src");
        fs::create_dir_all(ext.join("folder/nested")).unwrap();
        fs::write(ext.join("folder/a.txt"), "a").unwrap();
        fs::write(ext.join("folder/nested/b.txt"), "b").unwrap();

        let rel = move_into_repo(&repo, "", ext.join("folder").to_str().unwrap()).unwrap();
        assert_eq!(rel, "folder");
        assert_eq!(read_text_file(&repo, "folder/a.txt").unwrap(), "a");
        assert_eq!(read_text_file(&repo, "folder/nested/b.txt").unwrap(), "b");
        assert!(!ext.join("folder").exists());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&ext);
    }

    #[test]
    fn move_refuses_a_name_collision_without_overwriting() {
        let repo = tmp("move-collide-repo");
        fs::write(repo.join("dup.txt"), "original").unwrap();
        let ext = tmp("move-collide-src");
        fs::write(ext.join("dup.txt"), "incoming").unwrap();

        assert!(move_into_repo(&repo, "", ext.join("dup.txt").to_str().unwrap()).is_err());
        // The existing file is untouched and the source still exists (no data loss).
        assert_eq!(read_text_file(&repo, "dup.txt").unwrap(), "original");
        assert!(ext.join("dup.txt").exists());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&ext);
    }

    #[test]
    fn move_rejects_an_out_of_repo_destination_and_missing_source() {
        let repo = tmp("move-reject-repo");
        let ext = tmp("move-reject-src");
        fs::write(ext.join("ok.txt"), "x").unwrap();

        // A traversal destination is rejected (confine), leaving the source in place.
        assert!(move_into_repo(&repo, "../escape", ext.join("ok.txt").to_str().unwrap()).is_err());
        assert!(ext.join("ok.txt").exists());
        // A missing source errors clearly.
        assert!(move_into_repo(&repo, "", ext.join("nope.txt").to_str().unwrap()).is_err());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&ext);
    }

    #[test]
    fn creates_a_directory_at_the_root_and_in_a_subdir() {
        let dir = tmp("mkdir");
        fs::create_dir_all(dir.join("sub")).unwrap();
        // New dir at the repo root and inside an existing subdir.
        create_dir(&dir, "fresh").unwrap();
        create_dir(&dir, "sub/inner").unwrap();
        assert!(dir.join("fresh").is_dir());
        assert!(dir.join("sub/inner").is_dir());
        // A file can then be written into the new dir (it's a real tree level).
        write_text_file(&dir, "fresh/note.md", "hi").unwrap();
        assert_eq!(read_text_file(&dir, "fresh/note.md").unwrap(), "hi");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_dir_refuses_collision_and_out_of_repo_and_missing_parent() {
        let dir = tmp("mkdir-reject");
        fs::create_dir_all(dir.join("exists")).unwrap();
        fs::write(dir.join("file.txt"), "x").unwrap();
        // Collision with an existing dir or file → no clobber.
        assert!(create_dir(&dir, "exists").is_err());
        assert!(create_dir(&dir, "file.txt").is_err());
        // Traversal / absolute → rejected (parent canonicalizes outside the repo).
        assert!(create_dir(&dir, "../escape").is_err());
        assert!(create_dir(&dir, "../../../../tmp/recue-escape-dir").is_err());
        // A missing parent level → rejected (we create one level only).
        assert!(create_dir(&dir, "nope/deep").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn deletes_a_file_and_a_directory_tree_inside_the_repo() {
        let dir = tmp("delete-ok");
        fs::write(dir.join("a.md"), "x").unwrap();
        fs::create_dir_all(dir.join("folder/nested")).unwrap();
        fs::write(dir.join("folder/b.txt"), "y").unwrap();
        fs::write(dir.join("folder/nested/c.txt"), "z").unwrap();
        // A file is removed.
        delete_path(&dir, "a.md").unwrap();
        assert!(!dir.join("a.md").exists());
        // A directory is removed recursively (contents and all).
        delete_path(&dir, "folder").unwrap();
        assert!(!dir.join("folder").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_refuses_repo_root_traversal_outside_and_missing_target() {
        let dir = tmp("delete-reject");
        fs::write(dir.join("keep.md"), "x").unwrap();
        // The repo root itself is never deletable (empty / "." / explicit).
        assert!(delete_path(&dir, "").is_err());
        assert!(delete_path(&dir, "   ").is_err());
        assert!(delete_path(&dir, ".").is_err());
        assert!(dir.exists());
        // Traversal / absolute escapes are rejected, leaving the in-repo file intact.
        assert!(delete_path(&dir, "../").is_err());
        assert!(delete_path(&dir, "../../../../etc/hosts").is_err());
        // A missing target errors clearly (nothing to remove).
        assert!(delete_path(&dir, "nope.md").is_err());
        assert_eq!(read_text_file(&dir, "keep.md").unwrap(), "x");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn renames_a_file_and_a_folder_inside_the_repo() {
        let dir = tmp("rename-ok");
        fs::write(dir.join("old.md"), "x").unwrap();
        fs::create_dir_all(dir.join("folder/nested")).unwrap();
        fs::write(dir.join("folder/a.txt"), "a").unwrap();
        fs::write(dir.join("folder/nested/b.txt"), "b").unwrap();

        // Rename a top-level file — the returned path is repo-relative POSIX.
        let rel = rename_path(&dir, "old.md", "new.md").unwrap();
        assert_eq!(rel, "new.md");
        assert!(!dir.join("old.md").exists());
        assert_eq!(read_text_file(&dir, "new.md").unwrap(), "x");

        // Rename a folder — its whole subtree moves with it.
        let rel = rename_path(&dir, "folder", "renamed").unwrap();
        assert_eq!(rel, "renamed");
        assert!(!dir.join("folder").exists());
        assert_eq!(read_text_file(&dir, "renamed/a.txt").unwrap(), "a");
        assert_eq!(read_text_file(&dir, "renamed/nested/b.txt").unwrap(), "b");

        // Rename a file that lives inside a subdir (parent path preserved).
        let rel = rename_path(&dir, "renamed/a.txt", "renamed/z.txt").unwrap();
        assert_eq!(rel, "renamed/z.txt");
        assert!(!dir.join("renamed/a.txt").exists());
        assert_eq!(read_text_file(&dir, "renamed/z.txt").unwrap(), "a");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_refuses_clobber_root_and_out_of_repo() {
        let dir = tmp("rename-reject");
        fs::write(dir.join("keep.md"), "keep").unwrap();
        fs::write(dir.join("taken.md"), "taken").unwrap();
        // No-clobber: the destination already exists.
        assert!(rename_path(&dir, "keep.md", "taken.md").is_err());
        assert_eq!(read_text_file(&dir, "keep.md").unwrap(), "keep");
        assert_eq!(read_text_file(&dir, "taken.md").unwrap(), "taken");
        // The repo root itself is never renamable.
        assert!(rename_path(&dir, "", "elsewhere").is_err());
        // A missing source errors clearly.
        assert!(rename_path(&dir, "nope.md", "whatever.md").is_err());
        // Traversal / absolute destinations escape the repo → rejected, source intact.
        assert!(rename_path(&dir, "keep.md", "../escape.md").is_err());
        assert!(rename_path(&dir, "keep.md", "../../../../tmp/recue-rename-escape.md").is_err());
        // A destination whose parent level doesn't exist is rejected too.
        assert!(rename_path(&dir, "keep.md", "nope/deep.md").is_err());
        assert_eq!(read_text_file(&dir, "keep.md").unwrap(), "keep");
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn delete_refuses_to_follow_a_symlink() {
        use std::os::unix::fs::symlink;
        // A symlink inside the repo pointing at an *outside* directory must not be
        // followed — deleting it would otherwise wipe the link's real target.
        let repo = tmp("delete-symlink-repo");
        let outside = tmp("delete-symlink-outside");
        fs::write(outside.join("precious.txt"), "do not delete").unwrap();
        symlink(&outside, repo.join("link")).unwrap();
        assert!(delete_path(&repo, "link").is_err());
        // The link's target (and its file) survive untouched.
        assert!(outside.join("precious.txt").exists());
        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&outside);
    }
}
