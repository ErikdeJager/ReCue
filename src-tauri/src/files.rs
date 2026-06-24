//! Repo file access for the universal file viewer (#40/#44) and the Kanban editor
//! (#141): list a repo's viewable (text-ish) files, read a text file, and — the
//! app's first arbitrary file write — write a text file (`write_text_file`), all
//! with strict path validation (reject `..`/symlink escapes out of the repo).
//! Read content is returned verbatim and treated as untrusted by the frontend
//! (markdown rendered sanitized with no raw HTML; code highlighted from escaped
//! source).

use std::fs;
use std::path::Path;

/// Directory names skipped while listing (heavy / build / vendored dirs).
const SKIP_DIRS: &[&str] = &[
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
const LIST_CAP: usize = 500;
const MAX_DEPTH: usize = 8;
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

/// Repo viewable files as repo-relative paths (sorted), excluding hidden + heavy
/// dirs and binary extensions, capped. A non-readable dir yields an empty list.
pub fn list_files(repo: impl AsRef<Path>) -> Vec<String> {
    let repo = repo.as_ref();
    let mut out = Vec::new();
    collect(repo, repo, &mut out, 0);
    out.sort();
    out
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<String>, depth: usize) {
    if out.len() >= LIST_CAP || depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= LIST_CAP {
            return;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            // Skip hidden (.git, .github, …) and heavy build/dep dirs.
            if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            collect(root, &path, out, depth + 1);
        } else if is_listable(&path) {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("claudecue-files-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn lists_text_files_excluding_heavy_dirs_and_binaries() {
        let dir = tmp("list");
        fs::write(dir.join("README.md"), "# hi").unwrap();
        fs::write(dir.join("main.rs"), "fn main() {}").unwrap();
        fs::write(dir.join("notes.txt"), "ok").unwrap();
        fs::write(dir.join("LICENSE"), "MIT").unwrap(); // extensionless → text
        fs::write(dir.join("logo.png"), "binary").unwrap(); // binary ext → skipped
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/lib.ts"), "export {}").unwrap();
        fs::create_dir_all(dir.join("node_modules/pkg")).unwrap();
        fs::write(dir.join("node_modules/pkg/x.js"), "skip").unwrap();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git/config"), "skip").unwrap();

        let files = list_files(&dir);
        assert!(files.contains(&"README.md".to_string()));
        assert!(files.contains(&"main.rs".to_string()));
        assert!(files.contains(&"notes.txt".to_string()));
        assert!(files.contains(&"LICENSE".to_string()));
        assert!(files.contains(&"src/lib.ts".to_string()));
        assert!(!files.iter().any(|f| f.ends_with(".png")));
        assert!(!files.iter().any(|f| f.contains("node_modules")));
        assert!(!files.iter().any(|f| f.contains(".git")));
        let _ = fs::remove_dir_all(&dir);
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
        assert!(write_text_file(&dir, "/etc/claudecue-escape.md", "x").is_err());
        assert!(write_text_file(&dir, "nope/deep/x.md", "x").is_err()); // parent missing
        let _ = fs::remove_dir_all(&dir);
    }
}
