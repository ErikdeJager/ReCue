### 217. [ ] Fix the feedback (bug) button opening the documents folder instead of the browser on Windows

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-27

**Description**

The sidebar-footer **feedback (bug) button** (#210) is meant to open the feedback
Google Form in the user's default browser. On **Windows** it instead opens the
**documents folder** (no browser). Fix the URL-open path so the feedback button opens
the URL in the default browser cross-platform (specifically on Windows; unchanged on
macOS).

Root cause (grounded in the code):

- The button calls `openUrl(FEEDBACK_FORM_URL)` (`src/components/Sidebar/Sidebar.tsx`,
  #210) → ipc `open_url` (`src/ipc.ts:396`) → the Rust command
  `open_url` (`src-tauri/src/commands.rs:1135`), which runs
  `std::process::Command::new("open").arg(&url)`.
- `open` is the **macOS** open command. On Windows there is no standard `open`
  executable that opens a URL in the browser; whatever Windows resolves `open` to is
  opening a folder (the reported "documents folder" symptom) rather than the URL. The
  command is hardcoded to macOS `open` with no platform branch.
- The `is_http_url(&url)` guard (only `http`/`https`) is correct and should be kept.

Fix: make `open_url` open the URL with the **OS default browser cross-platform**.

Recommended implementation — use the well-established **`open` crate** (`open::that` /
`open::that_detached`), which resolves to `open` on macOS, `ShellExecute`/`cmd start`
on Windows, and `xdg-open` on Linux:

- Add `open = "5"` (or current) to `src-tauri/Cargo.toml`.
- In `open_url`, keep the `is_http_url` guard, then `open::that_detached(&url)` (or
  `open::that`), mapping its error to `SessionError::Io`.

Alternative (no new dependency) — platform-conditional `Command`:

- `#[cfg(target_os = "macos")]` → `Command::new("open").arg(url)`
- `#[cfg(target_os = "windows")]` → `Command::new("cmd").args(["/C", "start", "", &url])`
  (the empty `""` is `start`'s title arg so a quoted URL isn't taken as the title)
- `#[cfg(target_os = "linux")]` → `Command::new("xdg-open").arg(url)`

Prefer the `open` crate (handles the Windows quoting/edge cases and is shell-free);
either keeps the no-shell-injection property.

**Scope / out of scope**

- In scope: `open_url` (the feedback button's path) opening URLs correctly on Windows
  (and remaining correct on macOS / Linux).
- Out of scope: the other `open`-based commands (`reveal_path`,
  `reveal_file_in_finder`, `open_data_folder`) — these are macOS-Finder "reveal"
  concepts; they would also need cross-platform handling if Windows becomes a
  supported target, but that is a **separate** decision (see Notes — the project is
  documented macOS-only). Do not change them under this task.

**Subtasks**

1. [ ] Update `open_url` (`src-tauri/src/commands.rs`) to open the URL via the OS
   default browser cross-platform — recommended `open` crate (`open::that_detached`),
   keeping the `is_http_url` guard and the `SessionError::Io` error mapping.
2. [ ] If using the `open` crate, add it to `src-tauri/Cargo.toml`.
3. [ ] Verify on Windows the feedback (bug) button opens the Google Form in the
   default browser (not a folder); verify macOS behavior is unchanged.
4. [ ] `cargo build` / `npm run lint:rust` (clippy) / `cargo fmt`; confirm the
   existing `open_url` tests (if any) still pass / add one if practical.
5. [ ] Docs: note in `CLAUDE.md` that `open_url` is cross-platform (and, if relevant,
   that the ⌘-click link-open path #109 benefits too).

**Acceptance criteria**

- [ ] On Windows, clicking the feedback (bug) button opens the feedback Google Form in
      the default browser — it no longer opens the documents folder.
- [ ] On macOS the feedback button still opens the form in the default browser
      (no regression); the `http`/`https`-only guard is preserved.
- [ ] `cargo build` and `cargo clippy` pass; Rust is `cargo fmt`-clean.

**Notes**

- Decided autonomously (refine loop, user not answering — see `ASSUMPTIONS.md`).
- **Scope tension flagged:** `CLAUDE.md` documents ClaudeCue as **macOS-only**, but
  this card is a Windows bug report — the user is evidently running it on Windows.
  This task fixes only the reported `open_url` path; whether to broaden Windows
  support (the macOS-specific `open`-based reveal commands, `path_env` login-shell
  PATH, bundle config, etc.) is a larger question left for the user. If the user did
  **not** intend Windows support, this fix is still harmless on macOS.
- Recommended the `open` crate for correct Windows URL quoting + shell-free safety;
  the platform-`cfg` `Command` approach is the dependency-free fallback.
- **Depends on: none.**
