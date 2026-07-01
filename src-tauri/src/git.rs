//! Git support: current branch + working-tree diff vs `HEAD`, branch listing,
//! and a small set of deliberate writes (`checkout_branch` #27, `worktree_add`/
//! `worktree_remove` #74, and branch creation `create_branch`/`worktree_add_new_branch`
//! #124).
//!
//! Reads aside, the writes are: `checkout_branch` (switch to an *existing* local
//! branch, #27), the worktree add/remove pair (#74), and **branch creation** —
//! `git checkout -b` / `git worktree add -b` from the new-session flow (#124).
//! We **shell out to `git`** (rather than linking
//! `git2`/libgit2) because the value here is a faithful unified-diff parse, and
//! the parser — the part with real logic — is then a pure `&str -> structs`
//! function that is unit-tested against fixtures with no repo on disk. The thin
//! `git` invocation layer is covered by temp-repo integration tests (which skip
//! when `git` is unavailable). Renames are left as add+del (we do not pass `-M`),
//! so file status stays M/A/D; binary files are flagged with empty hunks.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

/// Build a `Command` that does **not** flash a console window on Windows. A GUI app
/// has no attached console, so each shelled-out `git` (or `<cli> --version`) call
/// would otherwise pop a transient black `conhost` window — and `current_branch` /
/// `working_diff` / branch listing run on every refresh, so it flashes constantly.
/// Sets `CREATE_NO_WINDOW` (0x0800_0000) on Windows; a **no-op on unix**, so macOS
/// keeps spawning `git` exactly as before. Shared by `git.rs` and `commands.rs`.
pub(crate) fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let cmd = Command::new(program);
    #[cfg(windows)]
    let mut cmd = cmd;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// File status in a working-tree diff (renames surface as a delete + an add).
/// `Ignored` (#270) is only produced by `file_statuses` (the FileTree coloring),
/// which passes `--ignored=matching`; the hunk-parsing diff paths never emit it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum FileStatus {
    #[serde(rename = "M")]
    Modified,
    #[serde(rename = "A")]
    Added,
    #[serde(rename = "D")]
    Deleted,
    #[serde(rename = "I")]
    Ignored,
}

/// Row type within a hunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HunkLineType {
    Hunk,
    Context,
    Add,
    Del,
}

/// A single rendered diff row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HunkLine {
    #[serde(rename = "type")]
    pub kind: HunkLineType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_no: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_no: Option<u32>,
    pub text: String,
}

/// A single changed file with its hunks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileDiff {
    pub path: String,
    pub status: FileStatus,
    pub add: u32,
    pub del: u32,
    pub binary: bool,
    pub hunks: Vec<HunkLine>,
}

/// Top-of-panel summary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffSummary {
    pub branch: String,
    pub files_changed: u32,
    pub adds: u32,
    pub dels: u32,
}

/// The full working-tree diff vs `HEAD`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkingDiff {
    pub summary: DiffSummary,
    pub files: Vec<FileDiff>,
}

/// One file's working-tree status (#252) — the lightweight per-file signal the
/// FileTree coloring reads (green = added, yellow = modified, red = deleted). `path`
/// is repo-relative POSIX (`/`-separated, via `core.quotepath=false`), matching
/// `files::list_dir`, so the frontend lookup is a direct string-keyed hit on both
/// macOS and Windows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FileStatusEntry {
    pub path: String,
    pub status: FileStatus,
}

/// Branches of a folder: the currently checked-out one, the local branches
/// (`all`), and the remote-tracking branches (`remote`, qualified `<remote>/<name>`,
/// #180). A non-git folder yields `{ current: "", all: [], remote: [] }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BranchList {
    pub current: String,
    pub all: Vec<String>,
    /// Remote-tracking branches as qualified short refs (e.g. `origin/feature-x`),
    /// excluding the symbolic `*/HEAD` and any whose short name already exists
    /// locally (deduped against `all`). Selecting one pulls it into a new local
    /// tracking branch (#180).
    pub remote: Vec<String>,
}

/// Current branch name, a short sha when detached, or `""` for a non-git dir.
pub fn current_branch(cwd: impl AsRef<Path>) -> String {
    let cwd = cwd.as_ref();
    let branch = run_git(cwd, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    if branch.is_empty() {
        return String::new();
    }
    if branch == "HEAD" {
        // Detached HEAD: fall back to the short commit sha.
        return match run_git(cwd, &["rev-parse", "--short", "HEAD"]) {
            Some(sha) if !sha.is_empty() => format!("@{sha}"),
            _ => "HEAD".to_string(),
        };
    }
    branch
}

/// Current branch for each path, resolved in a single call so the sidebar needs
/// one IPC round-trip instead of one per repo.
pub fn current_branches(paths: &[String]) -> HashMap<String, String> {
    paths
        .iter()
        .map(|path| (path.clone(), current_branch(path)))
        .collect()
}

/// Working tree (staged + unstaged) vs `HEAD`. Non-git folders and repos with no
/// commits return an empty, non-erroring result.
pub fn working_diff(cwd: impl AsRef<Path>) -> WorkingDiff {
    let cwd = cwd.as_ref();
    let branch = current_branch(cwd);

    let mut files = if has_head(cwd) {
        let diff = run_git_raw(
            cwd,
            &[
                "-c",
                "core.quotepath=false",
                "diff",
                "HEAD",
                "--no-color",
                "--no-ext-diff",
            ],
        )
        .unwrap_or_default();
        parse_unified_diff(&diff)
    } else {
        Vec::new()
    };

    // `git diff HEAD` reports tracked changes only — untracked (new) files are invisible
    // (#183). List them (respecting .gitignore via --exclude-standard) and synthesize a
    // new-file diff for each with `diff --no-index -- /dev/null <path>`, reusing
    // `parse_unified_diff` (the `new file mode` line → FileStatus::Added, the `b/<path>`
    // header → the relative path, a binary file → flagged binary). Bounded by
    // MAX_UNTRACKED_FILES so a pathological untracked set can't storm git spawns.
    const MAX_UNTRACKED_FILES: usize = 2000;
    for path in untracked_files(cwd).into_iter().take(MAX_UNTRACKED_FILES) {
        let Some(diff) = run_git_raw_allow_diff(
            cwd,
            &[
                "-c",
                "core.quotepath=false",
                "diff",
                "--no-index",
                "--no-color",
                "--no-ext-diff",
                "--",
                "/dev/null",
                &path,
            ],
        ) else {
            continue;
        };
        files.append(&mut parse_unified_diff(&diff));
    }

    let adds: u32 = files.iter().map(|f| f.add).sum();
    let dels: u32 = files.iter().map(|f| f.del).sum();
    WorkingDiff {
        summary: DiffSummary {
            branch,
            files_changed: files.len() as u32,
            adds,
            dels,
        },
        files,
    }
}

/// Lightweight per-file working-tree status vs `HEAD` (#252) for the FileTree
/// coloring. Unlike `working_diff` (which parses every hunk *and* spawns one `git`
/// per untracked file), this is a **single** `git status --porcelain` call. Non-git
/// folders and repos with no commits return an empty, non-erroring result (a status
/// run there exits non-zero → `run_git_raw` yields `None` → empty), matching
/// `working_diff`'s fail-open behavior. Bounded by `MAX_STATUS_FILES` so a
/// pathological working tree can't produce an unbounded IPC payload.
pub fn file_statuses(cwd: impl AsRef<Path>) -> Vec<FileStatusEntry> {
    /// Cap the per-file status payload (mirrors `working_diff`'s `MAX_UNTRACKED_FILES`
    /// spirit) so an enormous untracked tree stays bounded over IPC.
    const MAX_STATUS_FILES: usize = 5000;
    let cwd = cwd.as_ref();
    // `-z` (NUL-separated, no quoting) is robust to spaces/newlines in paths;
    // `--untracked-files=all` lists every new file (so a freshly-created file colors
    // green), `core.quotepath=false` keeps non-ASCII paths raw (matching `list_dir`).
    // `--ignored=matching` (#270) surfaces gitignored paths so the FileTree can dim
    // them: matching mode lists each individually-ignored file (e.g. `.env`) and
    // collapses a wholly-ignored directory to a single `dir/` summary entry (rather
    // than every file inside it) — keeping the payload bounded and keyable by path.
    let out = run_git_raw(
        cwd,
        &[
            "-c",
            "core.quotepath=false",
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--ignored=matching",
        ],
    )
    .unwrap_or_default();
    let mut entries = parse_porcelain_z(&out);
    entries.truncate(MAX_STATUS_FILES);
    entries
}

/// Two-dot `git diff <base> <target>` (#81) — the head-to-head difference,
/// oriented base → target. Validates both branches exist (like `checkout_branch`)
/// so the IPC boundary can't pass arbitrary refspecs; reuses `parse_unified_diff`
/// and returns the same `WorkingDiff` shape (summary labeled "base → target").
pub fn compare_branches(
    cwd: impl AsRef<Path>,
    base: &str,
    target: &str,
) -> Result<WorkingDiff, String> {
    let cwd = cwd.as_ref();
    let all = list_branches(cwd).all;
    if !all.iter().any(|b| b == base) {
        return Err(format!("unknown branch `{base}`"));
    }
    if !all.iter().any(|b| b == target) {
        return Err(format!("unknown branch `{target}`"));
    }
    let diff = run_git_raw(
        cwd,
        &[
            "-c",
            "core.quotepath=false",
            "diff",
            base,
            target,
            "--no-color",
            "--no-ext-diff",
        ],
    )
    .unwrap_or_default();
    let files = parse_unified_diff(&diff);
    let adds: u32 = files.iter().map(|f| f.add).sum();
    let dels: u32 = files.iter().map(|f| f.del).sum();
    Ok(WorkingDiff {
        summary: DiffSummary {
            branch: format!("{base} → {target}"),
            files_changed: files.len() as u32,
            adds,
            dels,
        },
        files,
    })
}

/// One commit in a folder's history (#230) — the diff viewer's "Commits" source list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub author: String,
    pub date: String,
    pub subject: String,
}

/// The latest `limit` commits on the folder's HEAD (#230), newest first. Fields are
/// NUL-delimited (`%x00`) so a subject can hold any character; `%s` is single-line so
/// records split cleanly on `\n`. Non-git / no-commits → empty (no error, like
/// `working_diff`). The caller bounds `limit`.
pub fn list_commits(cwd: impl AsRef<Path>, limit: u32) -> Vec<CommitInfo> {
    let cwd = cwd.as_ref();
    let n = limit.to_string();
    let out = run_git_raw(
        cwd,
        &[
            "log",
            "-n",
            &n,
            "--pretty=format:%H%x00%h%x00%an%x00%ad%x00%s",
            "--date=short",
        ],
    )
    .unwrap_or_default();
    out.lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            let mut parts = line.splitn(5, '\u{0}');
            let sha = parts.next()?.to_string();
            if sha.is_empty() {
                return None;
            }
            Some(CommitInfo {
                sha,
                short_sha: parts.next().unwrap_or("").to_string(),
                author: parts.next().unwrap_or("").to_string(),
                date: parts.next().unwrap_or("").to_string(),
                subject: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect()
}

/// The patch a single commit introduced (#230) — `git show <sha>` with no commit
/// header (`--format=`), parsed into the same `WorkingDiff` shape the body renders.
/// Handles the **root** commit (full initial diff) and normal commits; a merge commit
/// yields git's default `show` (often empty). Errors on an empty sha or a git failure;
/// the sha is passed as a single arg (no refspec injection). Summary label = short sha.
pub fn commit_diff(cwd: impl AsRef<Path>, sha: &str) -> Result<WorkingDiff, String> {
    let cwd = cwd.as_ref();
    if sha.trim().is_empty() {
        return Err("empty commit sha".to_string());
    }
    let diff = run_git_raw(
        cwd,
        &[
            "-c",
            "core.quotepath=false",
            "show",
            "--no-color",
            "--no-ext-diff",
            "--format=",
            sha,
        ],
    )
    .ok_or_else(|| format!("could not read commit `{sha}`"))?;
    let files = parse_unified_diff(&diff);
    let adds: u32 = files.iter().map(|f| f.add).sum();
    let dels: u32 = files.iter().map(|f| f.del).sum();
    Ok(WorkingDiff {
        summary: DiffSummary {
            branch: sha.get(..7).unwrap_or(sha).to_string(),
            files_changed: files.len() as u32,
            adds,
            dels,
        },
        files,
    })
}

/// Local branches of `cwd` plus the current one (for the new-session branch
/// picker). Non-git folders / repos with no branches return an empty list, which
/// the UI treats as "just spawn here" (no branch picker).
pub fn list_branches(cwd: impl AsRef<Path>) -> BranchList {
    let cwd = cwd.as_ref();
    let all: Vec<String> = run_git(
        cwd,
        &["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    )
    .map(|out| {
        out.lines()
            .map(str::to_string)
            .filter(|line| !line.is_empty())
            .collect()
    })
    .unwrap_or_default();
    // Remote-tracking branches (#180): two cheap reads, no network. Exclude the
    // symbolic `*/HEAD` (e.g. `origin/HEAD`, or its bare `origin` short form) and any
    // ref whose name part (after the first `/`) already exists as a local branch.
    let remote: Vec<String> = run_git(
        cwd,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )
    .map(|out| {
        out.lines()
            .filter(|line| !line.is_empty())
            .filter(|line| match line.split_once('/') {
                // `<remote>/<name>` — keep unless it's a `*/HEAD` or a local dup.
                Some((_remote, name)) => name != "HEAD" && !all.iter().any(|b| b == name),
                // A bare remote name (the `origin/HEAD` short form) — drop it.
                None => false,
            })
            .map(str::to_string)
            .collect()
    })
    .unwrap_or_default();
    BranchList {
        current: current_branch(cwd),
        all,
        remote,
    }
}

/// Best-effort `git fetch --prune` to refresh remote-tracking refs before the
/// new-session branch picker lists remote branches (#180) — the app's first git
/// **network** read. `GIT_TERMINAL_PROMPT=0` (and SSH `BatchMode`) make a private
/// remote fail fast instead of hanging on a credential prompt in a GUI-launched
/// process. Returns git's stderr on failure; the caller swallows it (cached refs
/// are shown instead).
pub fn fetch_remotes(cwd: impl AsRef<Path>) -> Result<(), String> {
    let cwd = cwd.as_ref();
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(["fetch", "--prune"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "git fetch failed".to_string()
        } else {
            stderr
        })
    }
}

/// Derive the local directory name `git clone <url>` would create from a repo URL
/// (#295) — a **pure** helper (unit-tested; no filesystem / git). Trims whitespace
/// and a trailing `/`, takes the segment after the last `/` **or** `:` (so an SCP-form
/// `git@host:owner/repo.git` yields `repo`), then strips a trailing `.git`. Falls back
/// to `"repo"` when the result is empty, so the caller always has a safe, non-empty dir
/// name to `PathBuf::join` onto the chosen parent. Cross-platform (string-only; the
/// caller builds the actual path with `PathBuf::join`, never string concat).
pub fn repo_dir_name(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    // Split on the last '/' or ':' — covers `https://host/owner/repo(.git)`,
    // `ssh://host/owner/repo`, and the SCP form `git@host:owner/repo.git`.
    let last = trimmed.rsplit(['/', ':']).next().unwrap_or(trimmed);
    let name = last.strip_suffix(".git").unwrap_or(last);
    if name.is_empty() {
        "repo".to_string()
    } else {
        name.to_string()
    }
}

/// Clone the git repo at `url` into `dest` (#295) — a new deliberate git **network**
/// write, modeled on `fetch_remotes`. `dest` must not already exist (git creates it);
/// the caller pre-checks a non-empty existing target. Copies `fetch_remotes`' two
/// fail-fast env vars — `GIT_TERMINAL_PROMPT=0` + `GIT_SSH_COMMAND=ssh -oBatchMode=yes`
/// — so an authed/private remote **fails fast** instead of hanging a GUI-launched
/// process on a credential prompt. `dest` is passed as an `OsStr` arg (no `-C`, since
/// the repo doesn't exist yet); the path is built by the caller with `PathBuf::join`.
/// Returns git's trimmed stderr on failure. Cross-platform (shell-out via
/// `hidden_command`; no raw `$HOME` / POSIX assumptions).
pub fn clone_repo(url: &str, dest: impl AsRef<Path>) -> Result<(), String> {
    let output = hidden_command("git")
        .arg("clone")
        .arg(url)
        .arg(dest.as_ref())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "git clone failed".to_string()
        } else {
            stderr
        })
    }
}

/// Ensure `cwd` has **some** branch checked out (#298) — the post-`clone_repo` step.
/// `git clone` already leaves HEAD on the remote's **default branch** (`main`,
/// `master`, `develop`, …), so the job here is **not** to force `main` but only to
/// guarantee a checked-out branch exists:
/// - If the repo already has a current branch (the common case) → **do nothing**,
///   leaving the remote's default branch checked out exactly as cloned.
/// - If the repo has **no** branch at all (an unborn HEAD — a truly empty / branch-less
///   clone) → create + check out `main` from HEAD (`git checkout -b main`) so the repo
///   has a usable branch, matching a fresh `git init`.
///
/// The branch-less case is detected via `list_branches(cwd).all` being empty (an unborn
/// repo has no `refs/heads`). Returns git's error on a real failure. Reuses the existing
/// `create_branch` write (via `hidden_command`), so it's identical on macOS and Windows.
pub fn ensure_checked_out_branch(cwd: impl AsRef<Path>) -> Result<(), String> {
    let cwd = cwd.as_ref();
    if list_branches(cwd).all.is_empty() {
        // Unborn / branch-less clone (empty repo): fabricate `main` so there's a
        // checked-out branch to work on.
        create_branch(cwd, "main", "")
    } else {
        // A default branch is already checked out — leave it exactly as cloned.
        Ok(())
    }
}

/// Fast-forward the current branch of `cwd` to its upstream — `git pull --ff-only`
/// (#181). A new deliberate git **network** write invoked from the sidebar repo /
/// worktree context menus. `--ff-only` advances the branch when possible and refuses
/// (clean error, no merge commit / no half-finished merge) when it has diverged or
/// has uncommitted changes — safe for a folder an agent may be using.
/// `GIT_TERMINAL_PROMPT=0` (+ SSH `BatchMode`) makes a private remote fail fast
/// instead of hanging on a credential prompt. On success returns git's **trimmed
/// stdout** (e.g. `"Already up to date."` or the fast-forward summary) for the toast;
/// on failure returns the **trimmed stderr** (diverged / no upstream / not a repo).
/// Never panics. (`--ff-only` fetches then fast-forwards, so no separate fetch.)
pub fn pull_ff(cwd: impl AsRef<Path>) -> Result<String, String> {
    let cwd = cwd.as_ref();
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(["pull", "--ff-only"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -oBatchMode=yes")
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "git pull failed".to_string()
        } else {
            stderr
        })
    }
}

/// Check out an existing local branch in `cwd` — the first intentional git
/// *write* (see CLAUDE.md). The branch must already exist locally (we validate
/// against `list_branches`, which also blocks flag-like / arbitrary refspecs from
/// the IPC boundary). On failure (e.g. a dirty tree that would be overwritten)
/// returns git's stderr so the UI can explain it; never panics.
pub fn checkout_branch(cwd: impl AsRef<Path>, branch: &str) -> Result<(), String> {
    let cwd = cwd.as_ref();
    if !list_branches(cwd).all.iter().any(|b| b == branch) {
        return Err(format!("unknown branch `{branch}`"));
    }
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(["checkout", branch])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("could not check out `{branch}`")
        } else {
            stderr
        })
    }
}

/// Add a worktree for an existing local `branch` at `dest` (#74 — a new git
/// *write*, expanding the read-only-except-checkout rule; see CLAUDE.md).
/// Validates the branch exists (like `checkout_branch`) and returns git's stderr
/// on failure (e.g. the branch is already checked out elsewhere). Never panics.
pub fn worktree_add(
    repo: impl AsRef<Path>,
    branch: &str,
    dest: impl AsRef<Path>,
) -> Result<(), String> {
    let repo = repo.as_ref();
    if !list_branches(repo).all.iter().any(|b| b == branch) {
        return Err(format!("unknown branch `{branch}`"));
    }
    let output = hidden_command("git")
        .arg("-C")
        .arg(repo)
        .args(["worktree", "add"])
        .arg(dest.as_ref())
        .arg(branch)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("could not add worktree for `{branch}`")
        } else {
            stderr
        })
    }
}

/// Validate a **new** branch `name` (and optional `base`) before a create (#124):
/// non-empty, a valid git ref (rejecting leading-dash / flag-like names at the IPC
/// boundary), not already existing, and `base` (when given) must exist. Returns the
/// error message on failure, mirroring the other writes' messages.
fn validate_new_branch(cwd: &Path, name: &str, base: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("branch name is required".to_string());
    }
    // A leading '-' would be parsed as a flag by git; reject before shelling out.
    if name.starts_with('-') || run_git(cwd, &["check-ref-format", "--branch", name]).is_none() {
        return Err(format!("invalid branch name `{name}`"));
    }
    let existing = list_branches(cwd);
    if existing.all.iter().any(|b| b == name) {
        return Err(format!("branch `{name}` already exists"));
    }
    // The base may be a local branch or a remote-tracking ref (#180) — selecting a
    // remote branch "pulls" it by creating a new local branch based on `origin/x`.
    // Membership-in-list still blocks arbitrary / flag-like refspecs at the boundary.
    if !base.is_empty()
        && !existing.all.iter().any(|b| b == base)
        && !existing.remote.iter().any(|b| b == base)
    {
        return Err(format!("unknown base branch `{base}`"));
    }
    Ok(())
}

/// Create + check out a **new** local branch `name` from `base` (or HEAD when
/// `base` is empty) in `cwd` — a new git *write* introduced by #124 (branch
/// creation, expanding the prior checkout-only rule; see CLAUDE.md). Validates the
/// name (valid ref, not existing) and base (exists) before `git checkout -b`. On
/// failure (incl. a dirty tree) returns git's stderr; never panics.
pub fn create_branch(cwd: impl AsRef<Path>, name: &str, base: &str) -> Result<(), String> {
    let cwd = cwd.as_ref();
    let name = name.trim();
    let base = base.trim();
    validate_new_branch(cwd, name, base)?;
    let mut cmd = hidden_command("git");
    cmd.arg("-C").arg(cwd).args(["checkout", "-b", name]);
    if !base.is_empty() {
        cmd.arg(base);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("could not create branch `{name}`")
        } else {
            stderr
        })
    }
}

/// Add a worktree at `dest` on a **new** branch `name` (from `base` or HEAD) — the
/// ⌘⏎ create-branch-as-worktree path (#124, extends #74's `worktree_add`). Same
/// name/base validation as `create_branch`. Returns git's stderr on failure.
pub fn worktree_add_new_branch(
    repo: impl AsRef<Path>,
    name: &str,
    base: &str,
    dest: impl AsRef<Path>,
) -> Result<(), String> {
    let repo = repo.as_ref();
    let name = name.trim();
    let base = base.trim();
    validate_new_branch(repo, name, base)?;
    let mut cmd = hidden_command("git");
    cmd.arg("-C")
        .arg(repo)
        .args(["worktree", "add", "-b", name])
        .arg(dest.as_ref());
    if !base.is_empty() {
        cmd.arg(base);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("could not create worktree branch `{name}`")
        } else {
            stderr
        })
    }
}

/// Remove the worktree at `dest` from `repo` (#74 — a new git write). `force` is
/// required when the worktree has uncommitted changes; without it git refuses,
/// which the caller uses as the dirty guard. Returns git's stderr on failure.
pub fn worktree_remove(
    repo: impl AsRef<Path>,
    dest: impl AsRef<Path>,
    force: bool,
) -> Result<(), String> {
    let mut cmd = hidden_command("git");
    cmd.arg("-C")
        .arg(repo.as_ref())
        .args(["worktree", "remove"]);
    if force {
        cmd.arg("--force");
    }
    cmd.arg(dest.as_ref());
    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "could not remove worktree".to_string()
        } else {
            stderr
        })
    }
}

/// Parse `git diff` unified output into structured per-file diffs.
pub fn parse_unified_diff(diff: &str) -> Vec<FileDiff> {
    let mut files: Vec<FileDiff> = Vec::new();
    let mut current: Option<FileDiff> = None;
    let mut old_no = 0u32;
    let mut new_no = 0u32;

    for line in diff.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            if let Some(done) = current.take() {
                files.push(done);
            }
            current = Some(FileDiff {
                path: path_from_diff_git(rest),
                status: FileStatus::Modified,
                add: 0,
                del: 0,
                binary: false,
                hunks: Vec::new(),
            });
            continue;
        }

        let Some(file) = current.as_mut() else {
            continue;
        };

        if line.starts_with("new file mode") {
            file.status = FileStatus::Added;
        } else if line.starts_with("deleted file mode") {
            file.status = FileStatus::Deleted;
        } else if line.starts_with("Binary files ") {
            file.binary = true;
        } else if let Some(header) = line.strip_prefix("+++ ") {
            if let Some(path) = path_from_diff_header(header) {
                file.path = path;
            }
        } else if let Some(header) = line.strip_prefix("--- ") {
            // For deletions `+++` is /dev/null, so the old path is authoritative.
            if file.status == FileStatus::Deleted {
                if let Some(path) = path_from_diff_header(header) {
                    file.path = path;
                }
            }
        } else if line.starts_with("@@") {
            if let Some((old_start, new_start)) = parse_hunk_header(line) {
                old_no = old_start;
                new_no = new_start;
            }
            file.hunks.push(HunkLine {
                kind: HunkLineType::Hunk,
                old_no: None,
                new_no: None,
                text: line.to_string(),
            });
        } else if let Some(text) = line.strip_prefix('+') {
            file.add += 1;
            file.hunks.push(HunkLine {
                kind: HunkLineType::Add,
                old_no: None,
                new_no: Some(new_no),
                text: text.to_string(),
            });
            new_no += 1;
        } else if let Some(text) = line.strip_prefix('-') {
            file.del += 1;
            file.hunks.push(HunkLine {
                kind: HunkLineType::Del,
                old_no: Some(old_no),
                new_no: None,
                text: text.to_string(),
            });
            old_no += 1;
        } else if let Some(text) = line.strip_prefix(' ') {
            file.hunks.push(HunkLine {
                kind: HunkLineType::Context,
                old_no: Some(old_no),
                new_no: Some(new_no),
                text: text.to_string(),
            });
            old_no += 1;
            new_no += 1;
        } else if line.starts_with('\\') {
            // "\ No newline at end of file" — a marker, not a real line.
            file.hunks.push(HunkLine {
                kind: HunkLineType::Context,
                old_no: None,
                new_no: None,
                text: line.to_string(),
            });
        }
    }

    if let Some(done) = current.take() {
        files.push(done);
    }
    files
}

/// Parse `git status --porcelain=v1 -z` output into per-file statuses (#252). The
/// stream is a sequence of NUL-terminated records, each `XY<space>PATH`; a
/// **renamed/copied** entry (`R`/`C` in the index column) carries a *second*
/// NUL-separated field — the original path. Git's `-z` order for a rename is
/// `XY<space><new>\0<old>\0` (verified against git 2.x), so we emit `Added` for the
/// new path and `Deleted` for the consumed original — mirroring `parse_unified_diff`'s
/// rename-as-add+del convention. Mapping for the rest: `!!` (gitignored, #270, only
/// emitted with `--ignored`) → `Ignored`; `??` (untracked) → `Added`; a `D` in either
/// column → `Deleted`; an `A` in either column → `Added`; everything else (`M`,
/// type-change, unmerged `U…`) → `Modified`. A wholly-ignored directory surfaces as
/// `dir/` (trailing slash, matching mode) — the slash is stripped so it keys by the
/// directory path like `list_dir`'s folder rows. Malformed records are skipped. Pure —
/// unit-tested against fixtures with no repo on disk.
fn parse_porcelain_z(out: &str) -> Vec<FileStatusEntry> {
    let fields: Vec<&str> = out.split('\u{0}').collect();
    let mut entries: Vec<FileStatusEntry> = Vec::new();
    let mut i = 0;
    while i < fields.len() {
        let field = fields[i];
        i += 1;
        // A valid record is "XY PATH": 2 status chars + a space + ≥1 path char. Bytes
        // 0..=2 are always ASCII (status + space), so byte index 3 is a char boundary.
        if field.len() < 4 {
            continue;
        }
        let bytes = field.as_bytes();
        let (x, y) = (bytes[0], bytes[1]);
        let path = &field[3..];
        // Renamed/copied: `path` is the NEW name; the next field is the original path.
        if x == b'R' || x == b'C' {
            entries.push(FileStatusEntry {
                path: path.to_string(),
                status: FileStatus::Added,
            });
            if let Some(orig) = fields.get(i) {
                i += 1;
                if !orig.is_empty() {
                    entries.push(FileStatusEntry {
                        path: (*orig).to_string(),
                        status: FileStatus::Deleted,
                    });
                }
            }
            continue;
        }
        let status = if x == b'!' {
            // Gitignored (`!!`, #270, emitted by `file_statuses`'s `--ignored=matching`)
            // — the FileTree dims it.
            FileStatus::Ignored
        } else if x == b'?' {
            // Untracked (`??`) — a brand-new file reads as Added (green).
            FileStatus::Added
        } else if x == b'D' || y == b'D' {
            FileStatus::Deleted
        } else if x == b'A' || y == b'A' {
            FileStatus::Added
        } else {
            FileStatus::Modified
        };
        // A wholly-ignored directory surfaces as `dir/` (matching mode, #270); strip the
        // trailing slash so it keys by the directory path, matching `list_dir`'s folder
        // rows. Only ignored dir entries carry a slash, so this never touches a file.
        let path = if status == FileStatus::Ignored {
            path.strip_suffix('/').unwrap_or(path)
        } else {
            path
        };
        entries.push(FileStatusEntry {
            path: path.to_string(),
            status,
        });
    }
    entries
}

/// Parse `@@ -old[,n] +new[,m] @@ ...` into the (old_start, new_start) line nums.
fn parse_hunk_header(line: &str) -> Option<(u32, u32)> {
    let body = line.strip_prefix("@@ ")?;
    let end = body.find(" @@")?;
    let mut ranges = body[..end].split(' ');
    let old = ranges.next()?.strip_prefix('-')?;
    let new = ranges.next()?.strip_prefix('+')?;
    let old_start = old.split(',').next()?.parse().ok()?;
    let new_start = new.split(',').next()?.parse().ok()?;
    Some((old_start, new_start))
}

/// Best-effort path from a `diff --git a/<p> b/<p>` line (the `+++/---` headers
/// override this once seen).
fn path_from_diff_git(rest: &str) -> String {
    match rest.find(" b/") {
        Some(idx) => rest[idx + 3..].to_string(),
        None => rest.to_string(),
    }
}

/// Path from a `--- a/<p>` / `+++ b/<p>` header (None for `/dev/null`).
fn path_from_diff_header(header: &str) -> Option<String> {
    let header = header.split('\t').next().unwrap_or(header).trim();
    if header == "/dev/null" {
        return None;
    }
    let stripped = header
        .strip_prefix("a/")
        .or_else(|| header.strip_prefix("b/"))
        .unwrap_or(header);
    Some(unquote(stripped))
}

fn unquote(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        value[1..value.len() - 1].to_string()
    } else {
        value.to_string()
    }
}

fn has_head(cwd: &Path) -> bool {
    run_git(cwd, &["rev-parse", "--verify", "HEAD"]).is_some()
}

/// Whether `cwd` is inside a git work tree (#118) — decides if a template's
/// `open-diff` block can resolve. A non-git folder returns false (the panel then
/// shows "Not a git repository" + Retry).
pub fn is_git_repo(cwd: impl AsRef<Path>) -> bool {
    run_git(cwd.as_ref(), &["rev-parse", "--is-inside-work-tree"])
        .map(|out| out == "true")
        .unwrap_or(false)
}

/// Run `git -C <cwd> <args>`; trimmed stdout on success, else `None`.
fn run_git(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Like `run_git` but returns raw (untrimmed) stdout — for diff text.
fn run_git_raw(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Like `run_git_raw` but tolerates `git`'s "differences found" exit code (#183):
/// `git diff --no-index` exits **1** when the two inputs differ (the normal case for
/// an untracked file vs `/dev/null`), **0** only when identical. Returns stdout for
/// exit 0 or 1, and `None` for ≥2 (a real error) or a spawn failure. Used **only**
/// for the `--no-index` untracked-file pass — `run_git_raw` stays strict elsewhere.
fn run_git_raw_allow_diff(cwd: &Path, args: &[&str]) -> Option<String> {
    let output = hidden_command("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .ok()?;
    match output.status.code() {
        Some(0) | Some(1) => Some(String::from_utf8_lossy(&output.stdout).into_owned()),
        _ => None,
    }
}

/// Untracked (new) files in `cwd`, as repo-relative paths. `git diff HEAD` omits
/// untracked files entirely (#183), so `working_diff` lists them here.
/// `--exclude-standard` honors `.gitignore` / `.git/info/exclude` / global excludes
/// (so build output and dependencies stay out); `-z` gives NUL-separated raw paths
/// (robust to spaces/newlines). A non-git folder yields an empty list (no error).
fn untracked_files(cwd: &Path) -> Vec<String> {
    let out =
        run_git_raw(cwd, &["ls-files", "--others", "--exclude-standard", "-z"]).unwrap_or_default();
    out.split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    // --- Parser tests (pure, no repo) ---

    #[test]
    fn parses_a_modification_with_counts_and_line_numbers() {
        let diff = "\
diff --git a/src/main.rs b/src/main.rs
index 83db48f..bf3a2c1 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,3 +1,4 @@
 fn main() {
-    println!(\"hi\");
+    println!(\"hello\");
+    println!(\"world\");
 }
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 1);
        let f = &files[0];
        assert_eq!(f.path, "src/main.rs");
        assert_eq!(f.status, FileStatus::Modified);
        assert_eq!(f.add, 2);
        assert_eq!(f.del, 1);
        assert!(!f.binary);

        assert_eq!(f.hunks[0].kind, HunkLineType::Hunk);
        // " fn main() {" is context at old 1 / new 1
        assert_eq!(f.hunks[1].kind, HunkLineType::Context);
        assert_eq!(f.hunks[1].old_no, Some(1));
        assert_eq!(f.hunks[1].new_no, Some(1));
        // deletion carries an old line number only
        assert_eq!(f.hunks[2].kind, HunkLineType::Del);
        assert_eq!(f.hunks[2].old_no, Some(2));
        assert_eq!(f.hunks[2].new_no, None);
        // addition carries a new line number only
        assert_eq!(f.hunks[3].kind, HunkLineType::Add);
        assert_eq!(f.hunks[3].new_no, Some(2));
        assert_eq!(f.hunks[3].old_no, None);
        assert_eq!(f.hunks[4].new_no, Some(3));
    }

    #[test]
    fn parses_an_added_file() {
        let diff = "\
diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..3b18e51
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new.txt");
        assert_eq!(files[0].status, FileStatus::Added);
        assert_eq!(files[0].add, 2);
        assert_eq!(files[0].del, 0);
    }

    #[test]
    fn parses_a_deleted_file() {
        let diff = "\
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 3b18e51..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-hello
-world
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "gone.txt");
        assert_eq!(files[0].status, FileStatus::Deleted);
        assert_eq!(files[0].add, 0);
        assert_eq!(files[0].del, 2);
    }

    #[test]
    fn flags_binary_files_with_no_hunks() {
        let diff = "\
diff --git a/img.png b/img.png
index abc1234..def5678 100644
Binary files a/img.png and b/img.png differ
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "img.png");
        assert!(files[0].binary);
        assert!(files[0].hunks.is_empty());
    }

    #[test]
    fn parses_multiple_files() {
        let diff = "\
diff --git a/a.txt b/a.txt
index 1..2 100644
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-old
+new
diff --git a/b.txt b/b.txt
new file mode 100644
index 0..1
--- /dev/null
+++ b/b.txt
@@ -0,0 +1 @@
+added
";
        let files = parse_unified_diff(diff);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "a.txt");
        assert_eq!(files[0].add, 1);
        assert_eq!(files[0].del, 1);
        assert_eq!(files[1].path, "b.txt");
        assert_eq!(files[1].status, FileStatus::Added);
        assert_eq!(files[1].add, 1);
    }

    #[test]
    fn empty_diff_yields_no_files() {
        assert!(parse_unified_diff("").is_empty());
    }

    // --- Porcelain status parser tests (pure, no repo) (#252) ---

    #[test]
    fn porcelain_parses_added_modified_deleted_and_untracked() {
        // NUL-separated records: staged add, worktree-modified, worktree-deleted,
        // staged-delete, and an untracked file.
        let out =
            "A  added.txt\u{0} M mod.txt\u{0} D del.txt\u{0}D  staged-del.txt\u{0}?? new.txt\u{0}";
        let entries = parse_porcelain_z(out);
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        assert_eq!(by("added.txt"), Some(FileStatus::Added));
        assert_eq!(by("mod.txt"), Some(FileStatus::Modified));
        assert_eq!(by("del.txt"), Some(FileStatus::Deleted));
        assert_eq!(by("staged-del.txt"), Some(FileStatus::Deleted));
        assert_eq!(by("new.txt"), Some(FileStatus::Added));
        assert_eq!(entries.len(), 5);
    }

    #[test]
    fn porcelain_maps_a_rename_to_add_new_plus_delete_old() {
        // `git status -z` emits a rename as `R  <new>\0<old>\0` (new path first).
        let out = "R  new.txt\u{0}old.txt\u{0}";
        let entries = parse_porcelain_z(out);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "new.txt");
        assert_eq!(entries[0].status, FileStatus::Added);
        assert_eq!(entries[1].path, "old.txt");
        assert_eq!(entries[1].status, FileStatus::Deleted);
    }

    #[test]
    fn porcelain_handles_subdir_paths_and_skips_malformed() {
        // Subdir paths stay repo-relative POSIX; an empty / too-short record is skipped.
        let out = "\u{0} M src/a/b.rs\u{0}AM src/new.rs\u{0}";
        let entries = parse_porcelain_z(out);
        // `AM` (staged add + worktree modify) is a new file → Added (A wins over M).
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        assert_eq!(by("src/a/b.rs"), Some(FileStatus::Modified));
        assert_eq!(by("src/new.rs"), Some(FileStatus::Added));
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn porcelain_emits_ignored_for_bang_records() {
        // `--ignored=matching` emits `!!` records: a single ignored file, and a
        // wholly-ignored directory as `dir/` (trailing slash) — stripped to `dir`.
        let out = "!! .env\u{0}!! build/\u{0}!! src/secret.key\u{0}";
        let entries = parse_porcelain_z(out);
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        assert_eq!(by(".env"), Some(FileStatus::Ignored));
        // The directory's trailing slash is stripped so it keys like a folder row.
        assert_eq!(by("build"), Some(FileStatus::Ignored));
        assert_eq!(by("build/"), None);
        assert_eq!(by("src/secret.key"), Some(FileStatus::Ignored));
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn porcelain_mixes_ignored_with_tracked_changes() {
        // Ignored records coexist with real changes; each keeps its own status.
        let out = " M mod.txt\u{0}!! .env\u{0}?? new.txt\u{0}";
        let entries = parse_porcelain_z(out);
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        assert_eq!(by("mod.txt"), Some(FileStatus::Modified));
        assert_eq!(by(".env"), Some(FileStatus::Ignored));
        assert_eq!(by("new.txt"), Some(FileStatus::Added));
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn porcelain_empty_yields_no_entries() {
        assert!(parse_porcelain_z("").is_empty());
    }

    // --- URL → dir-name helper tests (pure, no repo) (#295) ---

    #[test]
    fn repo_dir_name_strips_git_suffix_trailing_slash_and_forms() {
        // https:// with a `.git` suffix.
        assert_eq!(repo_dir_name("https://github.com/owner/repo.git"), "repo");
        // https:// without the suffix.
        assert_eq!(repo_dir_name("https://github.com/owner/repo"), "repo");
        // A trailing slash is trimmed before taking the basename.
        assert_eq!(repo_dir_name("https://github.com/owner/repo/"), "repo");
        assert_eq!(repo_dir_name("https://github.com/owner/repo.git/"), "repo");
        // SCP-form `git@host:owner/repo.git` splits on the last `/` → `repo`.
        assert_eq!(repo_dir_name("git@github.com:owner/repo.git"), "repo");
        // SCP-form with the org directly after the colon (no `/`).
        assert_eq!(repo_dir_name("git@github.com:repo.git"), "repo");
        // ssh:// URL.
        assert_eq!(repo_dir_name("ssh://git@host.xz/owner/repo.git"), "repo");
        // A dotted repo name only loses a *trailing* `.git`.
        assert_eq!(
            repo_dir_name("https://github.com/owner/my.repo.git"),
            "my.repo"
        );
        // Surrounding whitespace is trimmed.
        assert_eq!(repo_dir_name("  https://host/owner/repo.git  "), "repo");
        // Degenerate input falls back to a safe non-empty name.
        assert_eq!(repo_dir_name(""), "repo");
        assert_eq!(repo_dir_name("/"), "repo");
    }

    // --- Integration tests (real `git`; skip if unavailable) ---

    fn unique_dir(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("recue-git-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        path
    }

    fn git_in(dir: &Path, args: &[&str]) -> bool {
        hidden_command("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn init_repo(tag: &str) -> Option<PathBuf> {
        let dir = unique_dir(tag);
        fs::create_dir_all(&dir).ok()?;
        if !git_in(&dir, &["init", "-q"]) {
            let _ = fs::remove_dir_all(&dir);
            return None;
        }
        git_in(&dir, &["config", "user.email", "t@test.dev"]);
        git_in(&dir, &["config", "user.name", "Test"]);
        git_in(&dir, &["config", "commit.gpgsign", "false"]);
        Some(dir)
    }

    fn commit_all(dir: &Path, msg: &str) -> bool {
        git_in(dir, &["add", "-A"]) && git_in(dir, &["commit", "-q", "--no-verify", "-m", msg])
    }

    /// `git clone <origin> <dest>` into a fresh temp dir, with a test identity set
    /// so the clone can commit. None if git/clone is unavailable.
    fn clone_repo(origin: &Path, tag: &str) -> Option<PathBuf> {
        let dest = unique_dir(tag);
        let ok = Command::new("git")
            .args(["clone", "-q"])
            .arg(origin)
            .arg(&dest)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            let _ = fs::remove_dir_all(&dest);
            return None;
        }
        git_in(&dest, &["config", "user.email", "t@test.dev"]);
        git_in(&dest, &["config", "user.name", "Test"]);
        git_in(&dest, &["config", "commit.gpgsign", "false"]);
        Some(dest)
    }

    #[test]
    fn is_git_repo_distinguishes_git_and_plain_folders() {
        // A plain (non-git) folder is not a repo.
        let plain = unique_dir("plain");
        fs::create_dir_all(&plain).unwrap();
        assert!(!is_git_repo(&plain));
        let _ = fs::remove_dir_all(&plain);
        // An init'd repo is.
        let Some(repo) = init_repo("isrepo") else {
            return;
        };
        assert!(is_git_repo(&repo));
        let _ = fs::remove_dir_all(&repo);
    }

    #[test]
    fn dirty_repo_reports_branch_and_modification() {
        let Some(dir) = init_repo("dirty") else {
            return;
        };
        fs::write(dir.join("a.txt"), "line1\nline2\n").unwrap();
        assert!(commit_all(&dir, "init"));
        fs::write(dir.join("a.txt"), "line1\nchanged\nline3\n").unwrap();

        let branch = current_branch(&dir);
        assert!(!branch.is_empty());

        let diff = working_diff(&dir);
        assert_eq!(diff.summary.branch, branch);
        assert_eq!(diff.files.len(), 1);
        assert_eq!(diff.files[0].path, "a.txt");
        assert_eq!(diff.files[0].status, FileStatus::Modified);
        assert!(diff.summary.adds >= 1 && diff.summary.dels >= 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn working_diff_includes_untracked_files_and_respects_gitignore() {
        let Some(dir) = init_repo("untracked") else {
            return;
        };
        // Initial commit: a normal file, a tracked file inside a hidden folder, and a
        // .gitignore — so .gitignore itself is tracked (won't show as Added) and the
        // hidden-folder tracked file can be modified to prove that path still works.
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        fs::create_dir_all(dir.join(".hidden")).unwrap();
        fs::write(dir.join(".hidden/tracked.txt"), "v1\n").unwrap();
        fs::write(dir.join(".gitignore"), "ignored/\n").unwrap();
        assert!(commit_all(&dir, "init"));

        // A tracked modification inside the hidden folder (still must render, #183).
        fs::write(dir.join(".hidden/tracked.txt"), "v2\n").unwrap();
        // Untracked files: one in a normal folder, one in a new hidden folder.
        fs::create_dir_all(dir.join("newvisible")).unwrap();
        fs::write(dir.join("newvisible/file.txt"), "new\n").unwrap();
        fs::create_dir_all(dir.join(".newhidden")).unwrap();
        fs::write(dir.join(".newhidden/file.txt"), "newh\n").unwrap();
        // An ignored untracked file — must NOT appear.
        fs::create_dir_all(dir.join("ignored")).unwrap();
        fs::write(dir.join("ignored/secret.txt"), "nope\n").unwrap();

        let diff = working_diff(&dir);
        let by_path = |p: &str| diff.files.iter().find(|f| f.path == p);

        // Tracked modification inside the hidden folder still renders as before.
        let tracked = by_path(".hidden/tracked.txt").expect("tracked hidden mod listed");
        assert_eq!(tracked.status, FileStatus::Modified);

        // Both untracked files appear as Added, regardless of hidden/normal folder.
        let visible = by_path("newvisible/file.txt").expect("untracked visible file listed");
        assert_eq!(visible.status, FileStatus::Added);
        assert!(visible.add >= 1);
        let hidden = by_path(".newhidden/file.txt").expect("untracked hidden file listed");
        assert_eq!(hidden.status, FileStatus::Added);
        assert!(hidden.add >= 1);

        // The .gitignore'd file is omitted entirely.
        assert!(
            !diff.files.iter().any(|f| f.path.starts_with("ignored/")),
            "ignored files must not appear in the diff"
        );
        // Summary counts cover tracked + untracked additions.
        assert_eq!(diff.summary.files_changed, diff.files.len() as u32);
        assert!(diff.summary.adds >= 2);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_statuses_reports_added_modified_deleted_and_untracked() {
        let Some(dir) = init_repo("file-statuses") else {
            return;
        };
        // Commit two tracked files, then modify one, delete the other, and add a new
        // untracked file in a subdir.
        fs::write(dir.join("keep.txt"), "v1\n").unwrap();
        fs::write(dir.join("gone.txt"), "bye\n").unwrap();
        assert!(commit_all(&dir, "init"));
        fs::write(dir.join("keep.txt"), "v2\n").unwrap();
        fs::remove_file(dir.join("gone.txt")).unwrap();
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("sub/new.txt"), "new\n").unwrap();

        let entries = file_statuses(&dir);
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        assert_eq!(by("keep.txt"), Some(FileStatus::Modified));
        assert_eq!(by("gone.txt"), Some(FileStatus::Deleted));
        // Subdir paths stay repo-relative POSIX so the frontend lookup matches.
        assert_eq!(by("sub/new.txt"), Some(FileStatus::Added));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_statuses_marks_gitignored_files_and_dirs() {
        let Some(dir) = init_repo("file-statuses-ignored") else {
            return;
        };
        // Ignore a single file and a whole directory; commit the .gitignore so the
        // rest of the tree is clean.
        fs::write(dir.join(".gitignore"), ".env\nbuilt/\n").unwrap();
        assert!(commit_all(&dir, "init"));
        // Now create the ignored paths on disk.
        fs::write(dir.join(".env"), "SECRET=1\n").unwrap();
        fs::create_dir_all(dir.join("built")).unwrap();
        fs::write(dir.join("built/out.js"), "x\n").unwrap();

        let entries = file_statuses(&dir);
        let by = |p: &str| entries.iter().find(|e| e.path == p).map(|e| e.status);
        // The ignored file is flagged Ignored.
        assert_eq!(by(".env"), Some(FileStatus::Ignored));
        // A wholly-ignored directory keys by its dir path (trailing slash stripped),
        // and matching mode does not list the individual files inside it.
        assert_eq!(by("built"), Some(FileStatus::Ignored));
        assert_eq!(by("built/out.js"), None);
        // The committed .gitignore is tracked + clean, so it isn't reported at all.
        assert_eq!(by(".gitignore"), None);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn file_statuses_empty_for_non_git_folder() {
        let plain = unique_dir("file-statuses-plain");
        fs::create_dir_all(&plain).unwrap();
        assert!(file_statuses(&plain).is_empty());
        let _ = fs::remove_dir_all(&plain);
    }

    #[test]
    fn clean_repo_reports_no_changes() {
        let Some(dir) = init_repo("clean") else {
            return;
        };
        fs::write(dir.join("a.txt"), "hello\n").unwrap();
        assert!(commit_all(&dir, "init"));

        let diff = working_diff(&dir);
        assert!(diff.files.is_empty());
        assert_eq!(diff.summary.files_changed, 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn non_git_directory_does_not_error() {
        let dir = unique_dir("nongit");
        fs::create_dir_all(&dir).unwrap();

        let diff = working_diff(&dir);
        assert!(diff.files.is_empty());
        assert_eq!(current_branch(&dir), "");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn current_branches_resolves_many_in_one_call() {
        let Some(dir) = init_repo("branches") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));

        let repo = dir.to_string_lossy().into_owned();
        let nongit = "/definitely/not/a/git/repo".to_string();
        let map = current_branches(&[repo.clone(), nongit.clone()]);
        assert!(!map.get(&repo).unwrap().is_empty());
        assert_eq!(map.get(&nongit).map(String::as_str), Some(""));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_branches_returns_locals_and_current() {
        let Some(dir) = init_repo("listbranches") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        assert!(git_in(&dir, &["branch", "feature"]));

        let list = list_branches(&dir);
        assert!(list.all.iter().any(|b| b == "feature"));
        assert!(list.all.iter().any(|b| b == &list.current));
        assert!(!list.current.is_empty());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_branches_is_empty_for_non_git() {
        let dir = unique_dir("listbranches-nongit");
        fs::create_dir_all(&dir).unwrap();
        let list = list_branches(&dir);
        assert_eq!(list.current, "");
        assert!(list.all.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn checkout_branch_switches_and_rejects_unknown() {
        let Some(dir) = init_repo("checkout") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        assert!(git_in(&dir, &["branch", "feature"]));

        assert!(checkout_branch(&dir, "feature").is_ok());
        assert_eq!(current_branch(&dir), "feature");

        // Unknown branch is rejected without touching the tree.
        assert!(checkout_branch(&dir, "does-not-exist").is_err());
        assert_eq!(current_branch(&dir), "feature");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_branch_creates_checks_out_and_rejects_invalid_or_existing() {
        let Some(dir) = init_repo("create-branch") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        let base = current_branch(&dir);

        // Create + check out a new branch from HEAD (empty base).
        assert!(create_branch(&dir, "feature/new", "").is_ok());
        assert_eq!(current_branch(&dir), "feature/new");
        assert!(list_branches(&dir).all.iter().any(|b| b == "feature/new"));

        // Re-creating the same branch fails (already exists), tree untouched.
        assert!(create_branch(&dir, "feature/new", "").is_err());

        // An invalid ref name is rejected.
        assert!(create_branch(&dir, "bad branch~name", "").is_err());
        // A leading-dash (flag-like) name is rejected.
        assert!(create_branch(&dir, "-x", "").is_err());
        // An unknown base is rejected.
        assert!(create_branch(&dir, "another", "no-such-base").is_err());

        // Create from an explicit existing base.
        assert!(create_branch(&dir, "from-base", &base).is_ok());
        assert_eq!(current_branch(&dir), "from-base");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clone_master_default_stays_on_master_and_creates_no_main() {
        // Build a source repo whose default branch is `master`. After the post-clone
        // step (#298) the clone must stay on `master` — `git clone` already leaves HEAD
        // there — and NO `main` may be fabricated.
        let Some(origin) = init_repo("clone-origin") else {
            return;
        };
        if !git_in(&origin, &["checkout", "-q", "-b", "master"]) {
            let _ = fs::remove_dir_all(&origin);
            return;
        }
        fs::write(origin.join("a.txt"), "x\n").unwrap();
        if !commit_all(&origin, "init") {
            let _ = fs::remove_dir_all(&origin);
            return;
        }

        // Clone via the real `super::clone_repo` into a fresh dest (the test module has
        // its own `clone_repo` helper; disambiguate with `super::`).
        let dest = unique_dir("clone-dest");
        let origin_url = origin.to_string_lossy().to_string();
        if super::clone_repo(&origin_url, &dest).is_err() {
            // git/clone unavailable in this environment — skip.
            let _ = fs::remove_dir_all(&origin);
            let _ = fs::remove_dir_all(&dest);
            return;
        }
        // A test identity so any branch write could proceed cleanly.
        git_in(&dest, &["config", "user.email", "t@test.dev"]);
        git_in(&dest, &["config", "user.name", "Test"]);

        // The clone came down on `master` (the remote's default).
        assert_eq!(current_branch(&dest), "master");
        assert!(!list_branches(&dest).all.iter().any(|b| b == "main"));

        // The post-clone step leaves the default branch alone — no `main` fabricated.
        assert!(ensure_checked_out_branch(&dest).is_ok());
        assert_eq!(current_branch(&dest), "master");
        assert!(!list_branches(&dest).all.iter().any(|b| b == "main"));

        // Idempotent: a second call is still a no-op.
        assert!(ensure_checked_out_branch(&dest).is_ok());
        assert_eq!(current_branch(&dest), "master");
        assert!(!list_branches(&dest).all.iter().any(|b| b == "main"));

        let _ = fs::remove_dir_all(&origin);
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn clone_main_default_stays_on_main() {
        // A repo whose default already is `main`: the post-clone step leaves it on
        // `main`, unchanged.
        let Some(origin) = init_repo("main-origin") else {
            return;
        };
        if !git_in(&origin, &["checkout", "-q", "-b", "main"]) {
            let _ = fs::remove_dir_all(&origin);
            return;
        }
        fs::write(origin.join("a.txt"), "x\n").unwrap();
        if !commit_all(&origin, "init") {
            let _ = fs::remove_dir_all(&origin);
            return;
        }

        let dest = unique_dir("main-clone-dest");
        let origin_url = origin.to_string_lossy().to_string();
        if super::clone_repo(&origin_url, &dest).is_err() {
            let _ = fs::remove_dir_all(&origin);
            let _ = fs::remove_dir_all(&dest);
            return;
        }
        git_in(&dest, &["config", "user.email", "t@test.dev"]);
        git_in(&dest, &["config", "user.name", "Test"]);

        assert_eq!(current_branch(&dest), "main");
        assert!(ensure_checked_out_branch(&dest).is_ok());
        assert_eq!(current_branch(&dest), "main");

        let _ = fs::remove_dir_all(&origin);
        let _ = fs::remove_dir_all(&dest);
    }

    #[test]
    fn ensure_checked_out_branch_creates_main_for_branchless_repo() {
        // A branch-less / unborn repo (a truly empty clone: no commits, no branches):
        // the post-clone step must fabricate + check out `main`, and not error.
        let Some(dir) = init_repo("branchless") else {
            return;
        };
        // Fresh `git init` — no commit yet, so no `refs/heads` at all.
        assert!(list_branches(&dir).all.is_empty());

        assert!(ensure_checked_out_branch(&dir).is_ok());
        // `main` is now the checked-out (still unborn) branch. On an unborn HEAD
        // `current_branch` reports "" (no commit), so assert via the symbolic ref.
        assert_eq!(
            run_git(&dir, &["symbolic-ref", "--short", "HEAD"]).as_deref(),
            Some("main"),
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn worktree_add_new_branch_creates_a_branch_in_a_separate_dir() {
        let Some(dir) = init_repo("wt-new-branch") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        let started_on = current_branch(&dir);

        let dest = unique_dir("wt-new-branch-dest");
        assert!(worktree_add_new_branch(&dir, "wt/feature", "", &dest).is_ok());
        // The new branch exists and the main checkout's HEAD is unchanged.
        assert!(list_branches(&dir).all.iter().any(|b| b == "wt/feature"));
        assert_eq!(current_branch(&dir), started_on);
        // The worktree dir is on the new branch.
        assert_eq!(current_branch(&dest), "wt/feature");

        // A duplicate branch name is rejected.
        let dest2 = unique_dir("wt-new-branch-dest2");
        assert!(worktree_add_new_branch(&dir, "wt/feature", "", &dest2).is_err());

        let _ = fs::remove_dir_all(&dest);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn worktree_add_existing_branch_round_trips_and_guards_existing_dir() {
        // Backs the #259 eager-create + idempotent-fire path: `worktree_add` on an
        // existing branch creates the folder, re-adding to the **same** folder errors
        // (so callers must guard with `!dest.is_dir()`), and `worktree_remove`
        // (non-force) cleans up a clean worktree.
        let Some(dir) = init_repo("wt-existing") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        // A branch that isn't checked out in the main worktree (git refuses to add a
        // worktree for a branch already checked out elsewhere).
        assert!(git_in(&dir, &["branch", "feat"]));

        let dest = unique_dir("wt-existing-dest");
        assert!(worktree_add(&dir, "feat", &dest).is_ok());
        assert!(dest.is_dir());
        assert_eq!(current_branch(&dest), "feat");

        // Re-adding to the same (now-existing) dir fails — this is exactly why
        // `create_schedule` / `prepare_worktree_for_schedule` guard on `!dest.is_dir()`
        // (#259) and reuse the folder instead.
        assert!(worktree_add(&dir, "feat", &dest).is_err());

        // A clean worktree is removable without `--force`.
        assert!(worktree_remove(&dir, &dest, false).is_ok());
        assert!(!dest.is_dir());

        let _ = fs::remove_dir_all(&dest);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_branches_includes_remotes_excludes_head_and_dedups() {
        let Some(dir) = init_repo("remote-branches") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        // A purely-remote branch (no local counterpart) is listed.
        assert!(git_in(
            &dir,
            &["update-ref", "refs/remotes/origin/feat", "HEAD"]
        ));
        // The symbolic origin/HEAD is excluded.
        assert!(git_in(
            &dir,
            &["update-ref", "refs/remotes/origin/HEAD", "HEAD"]
        ));
        // A remote branch duplicating a local one is deduped out.
        assert!(git_in(&dir, &["branch", "dup"]));
        assert!(git_in(
            &dir,
            &["update-ref", "refs/remotes/origin/dup", "HEAD"]
        ));

        let list = list_branches(&dir);
        assert!(list.remote.iter().any(|r| r == "origin/feat"));
        assert!(!list.remote.iter().any(|r| r == "origin/HEAD"));
        assert!(!list.remote.iter().any(|r| r == "origin/dup"));
        // The deduped name still exists as a local branch.
        assert!(list.all.iter().any(|b| b == "dup"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_branch_accepts_a_remote_tracking_ref_as_base() {
        let Some(dir) = init_repo("remote-base") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        assert!(git_in(
            &dir,
            &["update-ref", "refs/remotes/origin/feat", "HEAD"]
        ));

        // The widened validation accepts a remote-tracking ref as the base; "pulling"
        // origin/feat is creating a local branch based on it.
        assert!(create_branch(&dir, "feat-local", "origin/feat").is_ok());
        assert!(list_branches(&dir).all.iter().any(|b| b == "feat-local"));
        // A still-unknown base is rejected.
        assert!(create_branch(&dir, "other", "origin/nope").is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn pull_ff_fast_forwards_a_clone_from_its_origin() {
        let Some(origin) = init_repo("pull-origin") else {
            return;
        };
        fs::write(origin.join("a.txt"), "1\n").unwrap();
        assert!(commit_all(&origin, "init"));
        let Some(clone) = clone_repo(&origin, "pull-clone") else {
            let _ = fs::remove_dir_all(&origin);
            return;
        };
        // Advance origin, then the clone fast-forwards to it.
        fs::write(origin.join("b.txt"), "2\n").unwrap();
        assert!(commit_all(&origin, "second"));

        assert!(pull_ff(&clone).is_ok());
        assert!(clone.join("b.txt").exists());

        let _ = fs::remove_dir_all(&clone);
        let _ = fs::remove_dir_all(&origin);
    }

    #[test]
    fn pull_ff_errors_on_a_diverged_branch() {
        let Some(origin) = init_repo("pull-div-origin") else {
            return;
        };
        fs::write(origin.join("a.txt"), "1\n").unwrap();
        assert!(commit_all(&origin, "init"));
        let Some(clone) = clone_repo(&origin, "pull-div-clone") else {
            let _ = fs::remove_dir_all(&origin);
            return;
        };
        // Both sides advance independently → the branches diverge → ff-only fails.
        fs::write(clone.join("local.txt"), "local\n").unwrap();
        assert!(commit_all(&clone, "local commit"));
        fs::write(origin.join("remote.txt"), "remote\n").unwrap();
        assert!(commit_all(&origin, "remote commit"));

        assert!(pull_ff(&clone).is_err());
        // No merge happened: the divergent remote file was not pulled in.
        assert!(!clone.join("remote.txt").exists());

        let _ = fs::remove_dir_all(&clone);
        let _ = fs::remove_dir_all(&origin);
    }

    #[test]
    fn pull_ff_errors_without_an_upstream() {
        let Some(dir) = init_repo("pull-no-upstream") else {
            return;
        };
        fs::write(dir.join("a.txt"), "x\n").unwrap();
        assert!(commit_all(&dir, "init"));
        // No remote / tracking branch configured → pull has nothing to fast-forward.
        assert!(pull_ff(&dir).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_commits_and_commit_diff_normal_and_root() {
        let Some(dir) = init_repo("commits") else {
            return;
        };
        fs::write(dir.join("a.txt"), "one\n").unwrap();
        assert!(commit_all(&dir, "first"));
        fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
        assert!(commit_all(&dir, "second"));

        let commits = list_commits(&dir, 10);
        assert_eq!(commits.len(), 2);
        // Newest first; fields populated.
        assert_eq!(commits[0].subject, "second");
        assert_eq!(commits[1].subject, "first");
        assert!(!commits[0].sha.is_empty());
        assert!(!commits[0].short_sha.is_empty());
        assert!(!commits[0].date.is_empty());

        // The latest commit added one line to a.txt.
        let head_diff = commit_diff(&dir, &commits[0].sha).unwrap();
        assert_eq!(head_diff.files.len(), 1);
        assert_eq!(head_diff.files[0].path, "a.txt");
        assert_eq!(head_diff.files[0].add, 1);

        // The root commit's diff is the full initial add (no parent).
        let root_diff = commit_diff(&dir, &commits[1].sha).unwrap();
        assert_eq!(root_diff.files.len(), 1);
        assert_eq!(root_diff.files[0].status, FileStatus::Added);

        // `limit` bounds the list; an empty sha errors.
        assert_eq!(list_commits(&dir, 1).len(), 1);
        assert!(commit_diff(&dir, "").is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_commits_empty_for_non_git_folder() {
        let plain = unique_dir("commits-plain");
        fs::create_dir_all(&plain).unwrap();
        assert!(list_commits(&plain, 10).is_empty());
        let _ = fs::remove_dir_all(&plain);
    }
}
