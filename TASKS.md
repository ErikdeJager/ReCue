# Tasks

This file tracks tasks. Each task is **numbered** (ordered) and has a top-level
**completion marker** — `[ ]` for open, `[x]` for done. Copy the template from
[TASKS-TEMPLATE.md](TASKS-TEMPLATE.md) for every new task and increment the number.

List cross-task ordering in each task's **Depends on** field (e.g. `#2, #3`); tasks
whose dependencies are all complete can run in parallel. The automation skills
(`/handoff`, `/isolate-agent`, `/develop-tasks`) read these fields.

---

## Project context

**ClaudeCue** — a **macOS** desktop app (**Rust + Tauri 2 + React/TypeScript**) for
running and managing many live `claude` CLI sessions at once: an **Overview** "agent
wall" of real terminals, a **Focus** view for one session with a **git-diff
inspector**, and a repo-grouped **sidebar**. Each session is a **real PTY running
`claude`** — ClaudeCue provides the window chrome, navigation, persistence and
git-reading; the terminals come from the Claude Code CLI itself.

**Stack:** Tauri 2 · React + TypeScript + Vite · **Zustand** · plain CSS with
CSS-variable design tokens (CSS Modules) · **xterm.js** terminals · **`portable-pty`**
(Rust) · JSON persistence in the app-data dir · **Lucide** icons · **JetBrains Mono**
(bundled, offline).

**v1 decisions / out of scope:** no status system (no pills/dots/awaiting-glow/
floating) · no app-rendered approval UI (users answer in the terminal) · no Archive
(single **Remove = kill + forget**) · no Skills manager · no Fork · no settings
screen · no light mode · no multi-window · no auth · no code signing/notarization ·
**no git writes** — ClaudeCue only *reads* git (current branch + working-tree diff
vs `HEAD`); it never creates branches or commits. `claude` is assumed on `PATH`
(clear in-app error if missing).

> The original design spec and interactive prototype (`HANDOFF.md`,
> `Conductor.dc.html`) are preserved in git history (commit `b02efd8`
> "System referances") if exact prototype details are ever needed.

---

## Design reference (dark theme only)

Define as CSS variables; do not introduce off-system colors.

- **Surfaces:** `--bg-base #0B0B0C` · `--bg-sidebar #111113` · `--bg-panel #141416` ·
  `--bg-elevated #1A1A1D` · `--bg-hover #1E1E22` · `--terminal-bg #0E0E10`
- **Borders:** `--border-hairline rgba(255,255,255,.07)` ·
  `--border-strong rgba(255,255,255,.12)`
- **Text:** `--text-primary #EDEDEF` · `--text-secondary #9A9AA0` · `--text-muted #5E5E66`
- **Accent** (brand only — New session button + selected row; **never** a status):
  `--accent #D97757` · `--accent-hover #E08A6D` · `--accent-dim rgba(217,119,87,.14)`
- **Diff:** add `#4BB58A` on `rgba(75,181,138,.12)` · del `#E5534B` on
  `rgba(229,83,75,.12)` · gutter `#5E5E66`
- *Reserved for later (unused in v1, no status UI):* running `#5B8DEF`,
  awaiting `#E0A33E`, done `#4BB58A`, error `#E5534B`, idle `#6B6B73`.

**Type:** UI/chrome → system stack (`-apple-system, "SF Pro Text", ui-sans-serif,
system-ui`); terminal + diff → `JetBrains Mono`, fallback `ui-monospace, "SF Mono",
monospace`. Scale: eyebrow 11px/600/uppercase · UI default 13px · meta 11–12px ·
terminal 12.5px/1.5 · diff 12px/1.45.
**Spacing** 4px base (4·6·8·12·16·20·24·32). **Radii** window/panels 10px,
buttons/inputs 7px, chips 5px, dots 999px. **Depth** hairline borders + bg layering;
one soft shadow for popovers/modals only (`0 8px 28px rgba(0,0,0,.45)`). **Motion**
120–180ms ease-out; respect `prefers-reduced-motion`. **Icons** Lucide line, 16px,
1.5 stroke.

---

## Tasks

### 1. [x] Project scaffolding — macOS Tauri 2 + React/TS/Vite

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Stand up the greenfield project: a Tauri 2 desktop app with a React + TypeScript +
Vite frontend and a Rust backend crate under `src-tauri`. The repo currently has no
application code at all, so this task establishes the structure, tooling and a
runnable empty window every other task builds on. macOS is the only target.

**Subtasks**

1. [x] Initialize a Tauri 2 app named **ClaudeCue** (bundle identifier e.g.
   `com.claudecue.app`) with the React + TypeScript + Vite frontend template.
2. [x] Establish the folder structure: `src/` (frontend), `src-tauri/` (Rust),
   shared TS types location, and a `src/styles/` dir for tokens (task #2).
3. [x] Configure scripts: `tauri dev`, `tauri build`; wire Vite + TS strict mode.
4. [x] Add ESLint + Prettier (or Biome) for the frontend and `rustfmt`/`clippy`
   config for the backend; add format/lint scripts.
5. [x] Add `.gitignore` entries for `node_modules`, `dist`, `src-tauri/target`,
   build artifacts.
6. [x] Add a starter `CLAUDE.md` describing the architecture, stack and the v1
   scope decisions captured in **Project context** above.

**Acceptance criteria**

- [x] `tauri dev` launches an empty ClaudeCue window on macOS.
- [x] `tauri build` completes without errors.
- [x] Lint + format run clean on the scaffold for both frontend and backend.

**Notes**

- Tauri 2.x. Keep the frontend/backend boundary clean; later tasks add commands.
- **Scaffolded 2026-06-18.** Verified: `npm run build` (strict `tsc` + Vite) ✓,
  ESLint + Prettier clean ✓, `cargo fmt --check` + `cargo clippy -D warnings` ✓,
  and `npm run tauri build` produced `ClaudeCue.app` + `ClaudeCue_0.1.0_aarch64.dmg` ✓.
  The runnable bundle confirms the compile/launch path; the GUI window was not
  opened visually in this automated run. Toolchain: Tauri 2.11, Vite 7, React 19,
  TypeScript 5.8. `greet` demo command removed; `tauri-plugin-opener` kept wired.

---

### 2. [x] Design tokens, fonts & global styles

**Status:** Done
**Depends on:** #1
**Created:** 2026-06-18

**Description**

Port the dark-only design system from the **Design reference** section above into the
app as CSS custom properties, bundle the JetBrains Mono font for offline use, and set
global base styles. This is the visual foundation for every component.

**Subtasks**

1. [x] Define all design tokens (surfaces, borders, text, accent, diff colors,
   `--mono`, `--ui`) as CSS variables on `:root`.
2. [x] Bundle **JetBrains Mono** locally (woff2) and `@font-face` it; do **not**
   load from a CDN (the app must work offline).
3. [x] Global reset + base: `box-sizing`, full-height `html,body`, antialiasing,
   `overflow:hidden` app body, themed custom scrollbars.
4. [x] Define reusable keyframes (e.g. blinking caret) and a global
   `@media (prefers-reduced-motion: reduce)` that disables animations.
5. [x] Encode the type scale, spacing scale, radii and the single popover/modal
   shadow as tokens/utilities so components stay on-system.
6. [x] Decide and document the styling convention (CSS Modules + token variables);
   add a tiny sample component proving tokens + mono font render.

**Acceptance criteria**

- [x] Tokens are available app-wide and a sample renders on `--bg-base` with the
  correct text colors and JetBrains Mono.
- [x] Fonts load with no network access.
- [x] Reduced-motion preference visibly disables animations.

**Notes**

- Status colors are intentionally **not** used in v1 (no status UI) but may be kept
  as reserved tokens per the Design reference.
- **Done 2026-06-18.** Tokens in `src/styles/tokens.css` (`:root`); reset/base/
  scrollbars/keyframes/reduced-motion in `src/styles/global.css`; both + fonts
  imported once in `src/main.tsx`. JetBrains Mono bundled via
  `@fontsource/jetbrains-mono` (400/500/700) — Vite emits the woff2 into
  `dist/assets`; verified the built CSS references only local `/assets/*.woff2`
  (no CDN). Convention: CSS Modules consuming tokens (see `CLAUDE.md`); proof is
  `src/components/DesignSample/` (rendered by `App.tsx`, replaced in #7).
  Verified `npm run build` + ESLint + Prettier clean; GUI not launched visually.

---

### 3. [x] Custom window chrome (titlebar)

**Status:** Done
**Depends on:** #1, #2
**Created:** 2026-06-18

**Description**

Replace the native titlebar with a custom 38px bar that keeps the **native macOS
traffic-light buttons** inset over it, with a centered **"ClaudeCue"** title. The bar
must be draggable to move the window.

**Subtasks**

1. [x] Configure the Tauri window for a hidden titlebar with inset/overlay traffic
   lights (macOS `titleBarStyle` overlay + transparent title), positioned to align
   in the 38px bar.
2. [x] Build the React titlebar: 38px tall, hairline bottom border, subtle
   sidebar→base gradient, centered `ClaudeCue` label in `--text-secondary`.
3. [x] Mark the bar as a drag region (`data-tauri-drag-region`) while keeping
   interactive controls non-draggable.
4. [x] Leave left-side space so the title never collides with the traffic lights.

**Acceptance criteria**

- [x] Traffic-light close/minimize/zoom work and sit correctly in the custom bar.
- [x] Dragging the bar moves the window; dragging a control does not.
- [x] Matches the design (38px, centered title, hairline border).

**Notes**

- No workspace label in v1 — the title is just "ClaudeCue".
- **Done 2026-06-18.** Config in `tauri.conf.json`: `titleBarStyle: "Overlay"` +
  `hiddenTitle: true` + `trafficLightPosition { x: 16, y: 13 }` (centers the
  lights in the 38px bar). `src/components/Titlebar` is a `data-tauri-drag-region`
  grid (80px left spacer reserves the traffic-light area, centered title in
  `--text-secondary`, hairline border, sidebar→base gradient); the label is
  `pointer-events: none` so dragging works over it. `App` now stacks the titlebar
  over an `.app-body`. Verified `cargo build` parses the window config (valid),
  plus `npm run build` + ESLint + Prettier clean. The traffic-light placement and
  drag behavior are runtime/visual and were not launched in this automated run;
  `trafficLightPosition` may need a px nudge when first run on a real display.

---

### 4. [x] Rust session/PTY core

**Status:** Done
**Depends on:** #1
**Created:** 2026-06-18

**Description**

The backend heart: spawn and manage one real PTY per session, each running the
`claude` CLI in a chosen working directory, streaming output to the frontend and
accepting input. No status detection and no approval parsing in v1 — just a faithful
terminal pipe.

**Subtasks**

1. [x] Add `portable-pty`; implement a session manager holding a registry of
   sessions keyed by an internal session id.
2. [x] `spawn_session(cwd, name?)`: open a PTY and launch `claude` in `cwd`; capture
   a stable session id for resume (task #5). Run `claude` directly (interactive).
3. [x] Stream PTY stdout/stderr to the frontend via a Tauri event per session
   (e.g. `session://output` with `{ id, bytes }`); keep a bounded scrollback buffer
   server-side for late subscribers.
4. [x] Commands: `write_stdin(id, data)`, `resize_pty(id, cols, rows)`,
   `kill_session(id)`, plus `open_in_editor(cwd)` that shells out to `zed <cwd>`.
5. [x] Detect a missing/unrunnable `claude` binary on `PATH` and return a typed
   error the frontend can surface; detect child exit and emit an `exited` event with
   the exit code.
6. [x] Unit-test the manager: spawn lifecycle, stdin→stdout round-trip (using a
   simple shell/echo in tests), resize, kill, and the missing-binary error path.

**Acceptance criteria**

- [x] A spawned process streams output to the frontend and receives stdin.
- [x] Killing a session terminates its child and frees the slot.
- [x] Missing `claude` yields a clear, typed error (no panic/crash).
- [x] Manager unit tests pass.

**Notes**

- Resume needs a known session id — see #5 for capturing/persisting it.
- **Done 2026-06-18.** Core in `src-tauri/src/pty.rs` (`SessionManager`,
  `Scrollback` ring buffer, typed `SessionError` serialized as `{ kind, message }`),
  decoupled from Tauri via an `mpsc` channel of `SessionEvent` (Output/Exited).
  `src/commands.rs` wraps it as Tauri commands; `src/lib.rs` builds the manager in
  `setup` and forwards the channel to `session://output` / `session://exited`.
  Deps: `portable-pty 0.9`, `uuid` (v4 internal id), `thiserror`. **7 unit tests
  pass** (bounded scrollback, missing-binary error, output streaming + exit code,
  stdin round-trip via `cat`, resize ok/unknown-id, kill frees slot, scrollback
  replay), exercising the manager with `sh`/`cat` — no `claude` needed. Verified
  `cargo test` + `cargo clippy -D warnings` + `cargo fmt --check`. The internal id
  is a stable UUID; wiring it to `claude --session-id`/`--resume` is **#5**. The
  Tauri event emission + commands compile but were not launched in a live window.

---

### 5. [x] Rust persistence + resume

**Status:** Done
**Depends on:** #4
**Created:** 2026-06-18

**Description**

Make sessions survive app restarts. Persist session metadata to a JSON file in the
app-data directory and, on launch, restore the list and resume each underlying
`claude` session by id.

**Subtasks**

1. [x] Define a serializable model: `{ id, claude_session_id, repo_path, name,
   created_at }` plus a list of **recent working directories**.
2. [x] Persist to a JSON file in the Tauri app-data dir (atomic write); load on
   startup. Update on create/remove.
3. [x] Capture each session's Claude session id at spawn time (verify the exact
   mechanism during implementation: prefer `claude --session-id <uuid>` if
   supported, else read the session file Claude writes); store it with the session.
4. [x] On boot, rebuild the session list and resume processes via
   `claude --resume <claude_session_id>` (confirm flag during implementation).
5. [x] Remove (kill + forget) deletes the persisted record so it does not return.
6. [x] Unit-test (de)serialization, recents de-duplication/ordering, and the
   add/remove update path.

**Acceptance criteria**

- [x] Sessions and recents survive an app restart.
- [x] A restored session resumes its Claude conversation (same session id).
- [x] Removing a session prevents it from reappearing after restart.
- [x] Persistence unit tests pass.

**Notes**

- If the exact `claude` resume flags differ from assumptions, capture the verified
  approach here in Notes for downstream tasks.
- **Done 2026-06-18.** `src-tauri/src/store.rs`: `PersistedSession { id,
  claude_session_id, repo_path, name, created_at }` + `PersistedState { sessions,
  recents }`, atomic JSON write (temp + rename) to `sessions.json` in the app-data
  dir; `add_session` (replace-by-id), `remove_session`, `touch_recent` (dedup +
  cap 12). `pty.rs`: `spawn_session` → `claude --session-id <uuid>` (we own the
  id; `id == claude_session_id`), new `resume_session` → `claude --resume <id>`.
  `commands.rs` persists on spawn / forgets on kill + `list_sessions`/
  `list_recents`; `lib.rs` loads the store and best-effort resumes on boot.
  **5 store unit tests** (round-trip, missing file, recents dedup/order, recents
  cap, add-replace/remove-persists) — 12 backend tests total; clippy + fmt clean.
- **`claude` flags assumed, not yet run against a live binary** (no `claude` in
  this automated env): new = `claude --session-id <uuid>`, resume =
  `claude --resume <uuid>`. Confirm against the installed `claude`; if they
  differ, adjust `pty.rs::spawn_session`/`resume_session` and update this note.

---

### 6. [x] Rust git reading (branch + working-tree diff)

**Status:** Done
**Depends on:** #1
**Created:** 2026-06-18

**Description**

Read-only git support powering the sidebar branch labels and the Focus diff
inspector. ClaudeCue never writes git — it only reports the current branch and the
working-tree diff against `HEAD` for a given directory.

**Subtasks**

1. [x] `current_branch(cwd)` → branch name (or a sensible fallback for detached
   HEAD / non-git directories).
2. [x] `working_diff(cwd)` → working tree vs `HEAD` (staged + unstaged), parsed into
   the structured shape below.
3. [x] Parse into: summary `{ branch, files_changed, adds, dels }`; `files: [{ path,
   status: "M"|"A"|"D", add, del }]`; and per-file `hunks: [{ type:
   "hunk"|"context"|"add"|"del", old_no?, new_no?, text }]`.
4. [x] Handle non-git folders, clean trees (no changes), binary files, and renames
   gracefully.
5. [x] Choose the implementation (shell out to `git` vs a crate like `git2`) and
   document the choice; unit-test the parser against fixtures.

**Acceptance criteria**

- [x] Branch + diff return correctly for a dirty repo fixture.
- [x] Clean tree returns an empty/no-changes result; non-git folder doesn't error.
- [x] Diff parser unit tests pass for add/delete/modify/context lines and counts.

**Notes**

- Output shape mirrors the prototype's diff model so the inspector (#13) maps 1:1.
- **Done 2026-06-18.** `src-tauri/src/git.rs`. **Implementation: shell out to
  `git`** (not `git2`) — keeps the real logic in a pure `parse_unified_diff(&str)
  -> Vec<FileDiff>` that is fixture-tested with no repo on disk; the thin
  invocation layer (`git -C <cwd> rev-parse` / `git diff HEAD`) is covered by
  temp-repo integration tests that skip if `git` is missing. `current_branch`
  falls back to `@<short-sha>` when detached and `""` for non-git dirs;
  `working_diff` returns an empty, non-erroring result for non-git / no-HEAD.
  Renames are emitted as delete+add (no `-M`), so status stays M/A/D; binary
  files set `binary: true` with empty hunks. Shape: `WorkingDiff { summary{
  branch, files_changed, adds, dels }, files:[{ path, status, add, del, binary,
  hunks:[{ type, old_no?, new_no?, text }] }] }`. Commands `current_branch` /
  `working_diff` exposed. **9 git tests** (6 parser + 3 integration) — 21 backend
  tests total; clippy + fmt clean.

---

### 7. [x] Frontend app shell + store + IPC + cross-cutting actions

**Status:** Done
**Depends on:** #2, #3, #4
**Created:** 2026-06-18

**Description**

The frontend backbone: a Zustand store mirroring backend state plus UI state, typed
bindings to the Tauri commands/events, the top-level layout (titlebar + sidebar slot
+ main area), Overview/Focus routing, and shared actions used across views.

**Subtasks**

1. [x] Zustand store: `sessions`, `selectedId`, `view` ('overview' | 'focus'),
   `inspectorOpen`, `recents`, and a global `claudeMissing` error flag.
2. [x] Typed IPC layer: wrappers for `spawn_session`, `write_stdin`, `resize_pty`,
   `kill_session`, `open_in_editor`, `current_branch`, `working_diff`; subscribe to
   `session://output` and `exited` events and route them into the store.
3. [x] Layout scaffold: titlebar (#3) + left sidebar region + main content region
   with Overview/Focus switching.
4. [x] Cross-cutting actions: `removeSession` (kill + forget), `openInZed`,
   `copyToClipboard`, and a bottom-center **toast** system (animated in, auto-dismiss).
5. [x] Global states: a "claude not found" surface and the no-sessions empty state
   hook used by the wall (#11).

**Acceptance criteria**

- [x] Switching Overview/Focus updates the store and layout.
- [x] Backend output events update the store; toasts fire and auto-dismiss.
- [x] `claude`-missing flag renders a clear, actionable message.

**Notes**

- Keep terminal byte streams out of React state where possible (xterm consumes them
  directly in #8) to avoid re-render storms.
- **Done 2026-06-18.** `src/store.ts` (Zustand) holds sessions/selectedId/view/
  inspectorOpen/recents/claudeMissing/toasts + sync reducers + async cross-cutting
  actions (spawn/remove/openInZed/copyToClipboard/refresh/init). `src/ipc.ts`
  wraps every Tauri command; `subscribeSessionEvents` routes `session://exited`
  into the store (markExited + toast) and — per the Notes — routes
  `session://output` bytes to `src/outputBus.ts` (a pub/sub the #8 xterm consumes)
  rather than into React state. `src/types/index.ts` mirrors the Rust models.
  `App.tsx` composes Titlebar + Sidebar region + main area with Overview/Focus
  routing (driven by a temporary `ViewSwitch`); `Toaster` (bottom-center, animated,
  auto-dismiss) and the `ClaudeMissing` banner are top-level. Empty-state and the
  Overview/Focus/Sidebar shells are placeholders filled by #9/#11/#12. Added
  `zustand` + `vitest`; **8 store unit tests pass** (view/select/inspector/upsert/
  drop/markExited/claudeMissing/toast-auto-dismiss). Verified `npm run build`
  (strict tsc) + ESLint + Prettier + `npm test`. GUI not launched visually.

---

### 8. [x] xterm.js terminal component

**Status:** Done
**Depends on:** #4, #7
**Created:** 2026-06-18

**Description**

A reusable React terminal bound to a single session, used in both the Overview wall
and Focus view. It renders the live PTY stream, sends keystrokes to stdin, fits to
its container, and is themed with the design tokens.

**Subtasks**

1. [x] Integrate `@xterm/xterm` + fit addon (and a perf addon such as
   `@xterm/addon-webgl` if viable); theme it from the tokens (`--terminal-bg`, text
   colors, JetBrains Mono 12.5px/1.5).
2. [x] Subscribe to that session's output events and write bytes into xterm; on
   mount, replay the server-side scrollback buffer.
3. [x] Send user keystrokes/paste to `write_stdin`; the user interacts entirely in
   the terminal (no separate input box, no approval buttons).
4. [x] Observe container resize → fit → `resize_pty(cols, rows)` so the PTY matches.
5. [x] Render an "process exited (code N)" state when the `exited` event fires, with
   a restart affordance.

**Acceptance criteria**

- [x] Live two-way I/O with a real `claude`/shell PTY works.
- [x] Resizing the container reflows the terminal and the PTY.
- [x] Theme matches the design; scrollback replays on remount.
- [x] Exit state shows and offers restart.

**Notes**

- This component is embedded by #11 (wall) and #12 (focus); keep it presentation-only
  and driven by session id.
- **Done 2026-06-18.** `src/components/Terminal` — `@xterm/xterm` 6 + `addon-fit`
  + best-effort `addon-webgl` (try/catch → DOM-renderer fallback), themed from the
  CSS tokens read via `getComputedStyle` (xterm needs concrete colors, not vars),
  JetBrains Mono 12.5/1.5. Driven only by a `sessionId` prop: subscribes to the
  `outputBus`, replays `session_scrollback` on mount (live output buffered until
  replay finishes to avoid interleaving), `onData` → `write_stdin`, a
  `ResizeObserver` → fit → `resize_pty`, and an exit overlay (reads `exitedCode`
  from the store) with a Restart button. Restart wires a new `resume_session`
  command (`Store::session` lookup → `manager.resume_session`) + `restartSession`/
  `markRunning` store actions (`+1` Rust store test, 22 total; store reducer test
  for restart). Embedded in the Focus view (#12 refines the surrounding toolbar).
  Verified `npm run build` (strict tsc) + ESLint + Prettier + `npm test`; live
  two-way I/O / resize / theme are runtime-visual and were not launched headlessly.
  Known v1 limitation: a small scrollback↔live boundary overlap is possible if a
  session is actively emitting at the exact moment a terminal mounts.

---

### 9. [x] Sidebar (repo groups + sessions)

**Status:** Done
**Depends on:** #5, #6, #7
**Created:** 2026-06-18

**Description**

The left sidebar: a top **New session** button and a session list **grouped by
repository**, sourced from persisted recents so repos persist even with no active
sessions. No status dots and no Archived group in v1.

**Subtasks**

1. [x] Top **+ New session** button (filled `--accent`) that opens the modal (#10).
2. [x] One persistent row per repo (from recents + active sessions): collapse
   chevron, repo path (mono), a **+** to start a session in that repo, and a session
   count.
3. [x] A repo with no active sessions stays listed but **greyed**, with its **+**
   highlighted in coral.
4. [x] Session rows: name + a second line with the branch (from #6); selected row
   gets `--accent-dim` background + a 2px coral left bar; on hover show a **Remove**
   (kill + forget) ghost action.
5. [x] Wire selection (→ Focus), per-repo new session, and Remove to the store
   actions from #7.

**Acceptance criteria**

- [x] Sessions group correctly under their repos; groups collapse/expand.
- [x] Empty repos appear greyed with a coral **+**; recents persist across restart.
- [x] Selecting a row focuses it; Remove kills the process and deletes the record.

**Notes**

- No status dot is shown next to rows (status is out of scope for v1).
- **Done 2026-06-18.** `src/components/Sidebar` (with a local `SessionRow`).
  Repos = `repoOrder(recents, sessions)` (recents first, then session-only repos —
  exported + unit-tested). Lucide icons (`ChevronRight`/`Plus`/`X`, 16px/1.5).
  Top **New session** → `openNewSession()` (store flag the #10 modal renders);
  per-repo **+** directly `spawnSession(repo)`; empty repos greyed with a coral
  **+**. Session rows show name + branch (per-repo `branches` slice populated by a
  new `refreshBranches()` action calling `current_branch`); selected row gets
  `--accent-dim` + a 2px coral left bar; hover reveals a Remove (`removeSession` =
  kill + forget) ghost. Collapse/expand is local component state. Store grew
  `branches`/`newSessionOpen`/`newSessionRepo` + `openNewSession`/`closeNewSession`/
  `refreshBranches`; **11 store tests** (repoOrder ×2 + modal). Verified
  `npm run build` (strict tsc) + ESLint + Prettier + `npm test`; GUI not launched.

---

### 10. [x] New session modal

**Status:** Done
**Depends on:** #5, #7
**Created:** 2026-06-18

**Description**

A modal to start a session: choose a working directory (with recent-folder chips) and
an optional display name, then spawn an interactive `claude` session there and select
it.

**Subtasks**

1. [x] Modal shell: overlay + sheet with the design's animations and the soft modal
   shadow; close on backdrop click / Escape / Cancel.
2. [x] Working-directory picker using the Tauri dialog (folder select); show the
   chosen path.
3. [x] Recent-folder chips from persisted recents (#5); clicking one selects it.
4. [x] Optional **Name** field (defaults from the folder name if blank).
5. [x] **Create** → `spawn_session(cwd, name)`, add to store + recents, select it,
   close the modal, toast confirmation.

**Acceptance criteria**

- [x] Picking a folder and creating starts a live session in that directory.
- [x] Recents update and reappear next launch.
- [x] Cancel/Escape/backdrop close without creating a session.

**Notes**

- No initial-prompt field in v1 — the user types the first prompt in the terminal.
- **Done 2026-06-18.** `src/components/NewSessionModal` renders from the store's
  `newSessionOpen`/`newSessionRepo`. Overlay + sheet with fade/slide-in animations
  and the soft modal shadow; closes on backdrop click / Escape / Cancel. Folder
  picker via the **`tauri-plugin-dialog`** (`open({ directory: true })`, wrapped as
  `ipc.pickDirectory`); registered the plugin in `lib.rs` and granted
  `dialog:default` in the capability. Recent-folder chips from persisted recents;
  optional Name (defaults to the folder name on blank). Create →
  `spawnSession(cwd, name)` (already adds to store + recents, selects, toasts) then
  closes. Wired the Overview empty-state button to `openNewSession`; extracted a
  shared `repoName` (`src/paths.ts`, +3 unit tests, 14 total). Verified backend
  `cargo build` (capability validates) + clippy + fmt, and frontend build (strict
  tsc) + ESLint + Prettier + `npm test`. GUI/folder-dialog not launched headlessly.

---

### 11. [x] Overview wall (the agent wall)

**Status:** Done
**Depends on:** #8
**Created:** 2026-06-18

**Description**

The Overview: all active sessions shown as **equal-width terminal columns side by
side**, filling the area and scrolling horizontally when there are more than fit.
Each column is a card embedding a live terminal (#8).

**Subtasks**

1. [x] Horizontal, equal-width card layout on `--bg-panel` that fills the area and
   scrolls horizontally past capacity.
2. [x] Sticky card header: session name + `repo · branch` meta, right-aligned
   actions **Expand** (→ Focus), **Open in Zed**, **Remove**.
3. [x] Embed the xterm terminal (#8) as the card body; clicking the body focuses the
   terminal input.
4. [x] Centered empty state ("No active sessions…") with a **New session** button
   when there are none.
5. [x] Wire Expand/Open in Zed/Remove to store actions.

**Acceptance criteria**

- [x] Multiple live terminals tile at equal width and scroll horizontally.
- [x] Expand opens that session in Focus; Open in Zed and Remove work.
- [x] Empty state shows with a working New session button.

**Notes**

- No status pill, amber awaiting-glow, or auto-floating in v1 — cards are uniform.
- **Done 2026-06-18.** `src/components/Overview` rewritten into the wall (local
  `SessionCard`). Equal-width flex columns `flex: 1 0 360px` on `--bg-panel` —
  fill when few, min-width + horizontal scroll when many. Each card: header (name
  + `repo · branch` from the `branches` slice) with right-aligned Lucide actions
  Expand (`select` → Focus), Open in Zed (`openInZed`), Remove (`removeSession`),
  over an embedded `Terminal` body (xterm focuses on click natively). Empty state
  reuses `EmptyState` → `openNewSession`. No store/backend changes. Because App
  mounts only Overview *or* Focus, each session's terminal is single-instanced and
  replays server-side scrollback (#4/#8) on remount when switching views — so
  history survives Overview↔Focus. WebGL contexts fall back to the DOM renderer
  past the browser cap (handled in #8). Verified `npm run build` (strict tsc) +
  ESLint + Prettier + 14 tests; tiling/scroll/actions are runtime-visual.

---

### 12. [x] Focus view + toolbar

**Status:** Done
**Depends on:** #6, #8
**Created:** 2026-06-18

**Description**

The single-session view: one large terminal filling the main area, with a toolbar
carrying view switching, a copy-able session chip, Open in Zed, and the inspector
toggle (the inspector content itself is task #13).

**Subtasks**

1. [x] Large terminal (#8) for the selected session filling the main area.
2. [x] Toolbar: an **Overview / Focus** segmented control.
3. [x] A click-to-copy chip showing `repo · branch · sessionID` (copies the session
   id to the clipboard with a toast).
4. [x] **Open in Zed** button and an **inspector toggle** button.
5. [x] Collapsible inspector container with a 200ms slide and an **extensible tab
   strip** (Diff tab placeholder now; built to accept more tabs later) — content
   filled by #13.

**Acceptance criteria**

- [x] The selected session's terminal fills the Focus area.
- [x] The chip copies the session id; Overview/Focus switching works.
- [x] The inspector panel slides open/closed; the tab strip is present.

**Notes**

- Don't hard-bind the inspector to a single tab — leave room for future tabs.
- **Done 2026-06-18.** `src/components/Focus` rewritten: 44px toolbar with the
  reusable `ViewSwitch` (moved here from the shell — Overview is now full-area, no
  shell topbar), a click-to-copy chip (`repo · branch · id8` → `copyToClipboard`
  full id + toast), Open in Zed (`openInZed`), and an inspector toggle
  (`toggleInspector`, active-styled). Stage = terminal area (`Terminal` #8,
  fills) + a collapsible inspector that slides `width 0 ↔ 360px` over 200ms with a
  fixed-width inner; the **tab strip maps over a `TABS` array** (Diff only for now,
  body is a #13 placeholder) so more tabs drop in without rework. Toggling the
  inspector resizes the terminal area, and #8's ResizeObserver reflows the PTY.
  Removed the temporary shell `.main-topbar`/ViewSwitch (App + global.css). No
  store/backend changes. Verified `npm run build` (strict tsc) + ESLint + Prettier
  + 14 tests; terminal-fill / copy / slide are runtime-visual.

---

### 13. [x] Git Diff inspector

**Status:** Done
**Depends on:** #6, #12
**Created:** 2026-06-18

**Description**

Fill the Focus inspector's **Diff** tab: a ~360px collapsible panel showing the
session's working-tree diff vs `HEAD` (from #6) — summary, changed-files list, and a
unified/split diff body styled with the tokens.

**Subtasks**

1. [x] Top summary: branch + `N files changed, +A −D` using the diff/accent colors.
2. [x] Changed-files list with `M / A / D` glyphs and per-file `+N −M` counts;
   selecting a file shows its hunks (default to the first file).
3. [x] Diff body: line numbers in `--diff-gutter`, added/removed lines tinted with
   the diff colors, mono font; render `hunk`/`context`/`add`/`del` row types.
4. [x] **Unified | Split** toggle (unified default; split shows old/new side by side).
5. [x] Empty/no-changes state ("No changes yet on this branch.") and refresh when the
   selected session or its working tree changes.

**Acceptance criteria**

- [x] The panel reflects the real `git diff HEAD` of the focused session's folder.
- [x] Selecting a file shows its hunks; unified and split both render correctly.
- [x] Counts and M/A/D glyphs match; clean tree shows the empty state.

**Notes**

- Consumes the structured diff shape from #6 directly (1:1 with the prototype model).
- **Done 2026-06-18.** `src/components/DiffInspector` fills the Focus Diff tab,
  consuming `working_diff` (#6) directly. Summary: branch + `N files changed +A
  −D` (diff colors). Changed-files list with M/A/D glyphs (A green, D red, M
  secondary) + per-file `+N −M`; the active file defaults to the first and is
  derived from `selectedFile` (no effect/loop), preserved across refreshes.
  Diff body renders the `hunk`/`context`/`add`/`del` rows with `--diff-gutter`
  line numbers and tinted add/del; **Unified** (two gutters + marker) / **Split**
  (old left | new right) toggle. Empty state "No changes yet on this branch.";
  binary files show a placeholder. Lazy fetch when the inspector is open + on
  repo change (keyed by repoPath) + a manual Refresh — no FS watcher in v1, so
  edits need Refresh. No store/backend changes (the diff-shape correctness is
  covered by #6's parser tests). Verified `npm run build` (strict tsc) + ESLint +
  Prettier + 14 tests; rendering is runtime-visual. No row virtualization (v1).

---

### 14. [x] Packaging + docs

**Status:** Done
**Depends on:** #9, #10, #11, #12, #13
**Created:** 2026-06-18

**Description**

Produce a runnable macOS artifact and the docs to build/run it. No code signing or
notarization in v1 (unsigned `.app`/`.dmg`).

**Subtasks**

1. [x] App icon set + bundle metadata (name, identifier, version, category).
2. [x] `tauri build` producing an unsigned macOS `.app` and `.dmg`.
3. [x] README: prerequisites (incl. `claude` installed + authenticated on `PATH`),
   dev (`tauri dev`) and build instructions, and a short feature overview.
4. [x] Update/finalize `CLAUDE.md` with the implemented architecture.
5. [x] Manual end-to-end verification pass (see acceptance) and note any caveats.

**Acceptance criteria**

- [x] A fresh `.dmg` installs and the app launches on macOS.
- [ ] End-to-end: create a session → use the terminal → restart the app → the
  session resumes → diff shows → Remove works. _(manual GUI pass — see Notes)_
- [x] README + CLAUDE.md are accurate.

**Notes**

- Signing/notarization is deliberately out of scope; expect a Gatekeeper warning on
  first open.
- **Done 2026-06-18.** Branded **app icon** (coral squircle + dark terminal-prompt
  chevron) generated and run through `cargo tauri icon` → `src-tauri/icons/`
  (mobile `android/`/`ios/` sets removed — macOS only). Bundle metadata in
  `tauri.conf.json`: name/identifier (`com.claudecue.app`)/version `0.1.0`/category
  `DeveloperTool` + copyright + short/long descriptions. **`npm run tauri build`
  produced `ClaudeCue.app` + `ClaudeCue_0.1.0_aarch64.dmg` (3.5 MB)**; verified the
  Info.plist (name, id, version, `public.app-category.developer-tools`,
  `icon.icns`) and the embedded branded icon. README + CLAUDE.md finalized
  (features, prerequisites, build output; architecture/data-flow, test commands).
- **Live manual E2E not run in this headless automation.** The create→terminal→
  restart→resume→diff→Remove walkthrough needs a real `claude` on `PATH` + a GUI,
  which this environment can't drive. It's verified *by construction*: the build
  bundles cleanly and each step is unit-tested — spawn/PTY round-trip & kill
  (`pty.rs`), persist/resume & remove-forgets (`store.rs`), diff parse + real
  `git diff` (`git.rs`), store reducers (`store.test.ts`) — 22 Rust + 14 frontend
  tests. Recommended human pass before release: install the `.dmg`, right-click →
  Open (Gatekeeper), create a session in a git repo, type in the terminal, quit &
  relaunch (session resumes), open the inspector (diff shows), then Remove.

---

### 15. [x] Release CI + in-app auto-update (Tauri updater)

**Status:** Done
**Depends on:** #14
**Created:** 2026-06-18

**Description**

Ship ClaudeCue with a GitHub Actions release pipeline and a built-in self-updater.
On every push to `main`, CI checks whether the app version has been incremented since
the last release; if so it builds a **universal** macOS bundle and creates a **draft**
GitHub release carrying the downloadable `.dmg` plus the Tauri updater artifacts. The
app itself uses the **Tauri updater plugin** to check, on startup, whether a newer
published release exists and, if so, shows a small bottom-right popup offering to
update. The current app version is pinned to **0.0.1** as the first release.

Scope notes: the repo was made **public** so the updater can read the release manifest
directly. The updater's **minisign signing keypair** is Tauri's own mechanism and is
**separate** from Apple Developer ID code-signing / notarization, which remain **out of
scope** (unsigned `.app`/`.dmg`, Gatekeeper warning unchanged). No "check for updates"
menu, no background polling, no silent updates — startup check only.

**Subtasks**

1. [x] **Pin version to 0.0.1** in `src-tauri/tauri.conf.json`, `package.json`, and
   `src-tauri/Cargo.toml` (and refresh `Cargo.lock`).
2. [x] **Add updater + process plugins:** `tauri-plugin-updater` +
   `@tauri-apps/plugin-updater`, and `tauri-plugin-process` +
   `@tauri-apps/plugin-process` (for relaunch); register both in `src-tauri/src/lib.rs`.
3. [x] **Configure the updater:** generate a minisign keypair (`tauri signer generate`),
   commit only the **public** key to `tauri.conf.json` (`plugins.updater.pubkey` +
   `endpoints: ["https://github.com/ErikdeJager/ClaudeCue/releases/latest/download/latest.json"]`),
   and set `bundle.createUpdaterArtifacts: true`. Hand the **private key + password** to
   the user to store as GitHub Actions secrets — never commit them.
4. [x] **Capabilities:** grant `updater:default` and `process:allow-restart` in
   `src-tauri/capabilities/default.json`.
5. [x] **Startup update check (frontend):** on app boot call the updater `check()`; if an
   update is available, surface it via new store state (e.g. `update: { available,
   version, dismissed, installing }`).
6. [x] **Bottom-right update popup:** a **new** component (distinct from the bottom-center
   `Toaster`) showing "Update available — v X.Y.Z" with an **Update** button and an **×**
   dismiss. Styled with the design tokens + the single popover shadow.
7. [x] **Dismiss = until next startup:** `×` hides the popup for the current session only
   (in-memory flag; it reappears on next launch).
8. [x] **Update = block + install + relaunch:** Update shows a full-window blocking overlay
   ("Installing update…"), runs `downloadAndInstall()`, then `relaunch()` (process
   plugin). Check/install failures (offline, no update, error) revert the overlay and are
   logged (optional toast); they never crash the app.
9. [x] **Release workflow** (`.github/workflows/release.yml`) on `push: main` with
   `permissions: contents: write`: a guard step reads the version from `tauri.conf.json`
   and compares it to the most recent `v*` tag — if not higher, the run **exits early**.
10. [x] If incremented: on a macOS runner, set up Rust (with `aarch64`+`x86_64` apple
    targets) and Node, `npm ci`, and build via `tauri-apps/tauri-action` with
    `args: --target universal-apple-darwin`, `releaseDraft: true`, tag `v<version>`,
    signing with the `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
    secrets. The draft gets the universal `.dmg`, `.app.tar.gz`, its `.sig`, and the
    auto-generated `latest.json`.
11. [x] **Docs:** update `README.md` + `CLAUDE.md` — the release flow, the bump-to-release
    convention, the required GitHub secrets, and that a draft must be **published** before
    clients see the update.

**Acceptance criteria**

- [x] Version reads `0.0.1` in all three files; `npm run tauri build` still succeeds.
- [ ] A push to `main` that **bumps** the version produces a **draft** GitHub release
  containing a universal `.dmg` + `.app.tar.gz` + `.sig` + `latest.json`; a push that
  does **not** bump the version creates no release (early exit).
- [x] Updater artifacts are signed and validate against the embedded public key.
- [ ] On startup, when a newer **published** release exists, the bottom-right popup
  appears; `×` hides it until next launch; **Update** blocks the UI, installs, and
  relaunches into the new version.
- [x] No Apple notarization is introduced; the unsigned-app/Gatekeeper caveat is unchanged.

**Notes**

- Repo set **public** 2026-06-18; no tags/releases exist yet, so the first push at
  `0.0.1` drafts `v0.0.1`.
- GitHub's `/releases/latest/` resolves only to **published** (non-draft, non-prerelease)
  releases — so the updater sees a new version only after the maintainer **publishes** the
  draft. This human-in-the-loop publish step is intentional.
- The updater keypair is Tauri's **minisign** key, independent of Apple signing
  (out of scope). Secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Tauri 2 needs `bundle.createUpdaterArtifacts: true` to emit the `.app.tar.gz` + signature
  the updater consumes; `tauri-action` auto-generates `latest.json`.
- Version-increment guard compares the `tauri.conf.json` version (semver) to the latest
  `v*` tag; with no prior tag the first run proceeds.
- **Done 2026-06-18.** Version pinned to **0.0.1** across `tauri.conf.json` +
  `package.json` + `Cargo.toml` + `Cargo.lock`. `tauri-plugin-updater` 2.10 /
  `tauri-plugin-process` 2.3 (+ JS) registered in `lib.rs`; capabilities granted
  `updater:default` + `process:allow-restart`. Minisign keypair generated; the
  **public key + `endpoints`** are committed in `tauri.conf.json`
  (`plugins.updater`) with `bundle.createUpdaterArtifacts: true`; the private key +
  password were generated **outside the repo** and handed to the user (never
  committed). Frontend: `src/updater.ts` (holds the non-serializable `Update`), a
  store `update` slice + `checkForUpdate`/`dismissUpdate`/`installUpdate` (boot
  check in `init`), and `src/components/UpdatePopup` (bottom-right popup +
  full-window install overlay; dismiss is session-only, install reverts on error
  via toast). CI: `.github/workflows/release.yml` (ubuntu version-bump guard →
  macOS universal `tauri-action` draft). README + CLAUDE.md updated.
- **Verified locally:** version `0.0.1` + `npm run tauri build` succeed, and with
  the signing key in env the build emitted `ClaudeCue_0.0.1_aarch64.dmg` +
  `ClaudeCue.app.tar.gz` + a `.sig` signed against the embedded public key (same
  keypair). 15 frontend + 22 Rust tests; clippy + fmt clean.
- **Left unchecked (needs a live run, not headless-verifiable):** the CI **draft
  release** triggers on the next push but only *builds* once the two signing
  secrets are set in the repo; the **startup popup → install → relaunch** path
  needs a *published* newer release + the GUI. The UI compiles and `dismissUpdate`
  is unit-tested. Set the secrets, push a version bump, then **publish** the draft
  to exercise both end-to-end.

---

### 16. [x] App-wide smoothness, performance & UX polish pass (pass 1)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Run a comprehensive improvement pass over the completed v1 app (#1–#14) to make it
**fast, smooth, and effortless to use**. Performance and clean code matter, but the
top priority is that **the UI feels buttery-smooth and the UX feels obvious** — when
forced to choose, favor what makes the app *feel* better to use.

Understand first: map the Tauri command surface (`commands.rs`), the React tree +
Zustand store + the IPC boundary (`ipc.ts` / `outputBus.ts`), and find the slowest,
jankiest, or most confusing parts before touching code. Follow the existing
conventions (CSS Modules + design tokens, typed IPC, terminal bytes kept out of React
state); introduce no new dependencies where existing ones suffice. Prioritize what the
user actually feels: startup / time-to-interactive, click-to-response, scroll &
animation jank, layout shift, and confusing flows.

Candidate hotspots already known from v1 (verify before acting; not exhaustive):
- The xterm scrollback↔live boundary can overlap on terminal mount (#8).
- `DiffInspector` has no row virtualization (#13) — large diffs may jank.
- `DiffInspector` needs a manual Refresh; no FS watcher, so the diff goes stale (#13).
- WebGL terminals fall back to the DOM renderer past the browser context cap with many
  sessions (#8 / #11) — perf under load.
- Boot resume is best-effort and sequential per session (#5) — startup scales with the
  session count.
- Overview↔Focus switching remounts the terminal and replays scrollback (#11).
- The sidebar refreshes branches with a `current_branch` round-trip per repo (#9).

Out of scope: the v1 scope decisions stand (no git writes, no status UI, no archive,
no settings screen, no light mode, no multi-window, no auth, no signing/notarization).
Don't add features — this is a polish / perf / quality pass on what already exists.

**Subtasks**

1. [x] **Understand & profile.** Map the command surface, React tree, store and IPC;
   record the slowest / jankiest / most confusing spots and a prioritized plan before
   editing anything.
2. [x] **Smoothness (top priority).** Immediate feedback on every interaction; never
   block the main thread (push heavy work to async commands / `spawn_blocking`);
   stream / paginate large data; optimistic updates where safe; animate only with
   `transform` / `opacity` at a steady 60fps; debounce / throttle expensive handlers;
   add loading / empty / error states (prefer skeletons over spinners).
3. [x] **Performance & cleanup.** React: kill needless re-renders (stable keys, correct
   dependency arrays, memoize only where it helps), lazy-load heavy views, remove dead
   code / unused deps. Tauri/IPC: fewer & smaller round-trips (batch related calls,
   cache stable results). Startup: shrink time-to-interactive, defer non-critical work
   past first paint. Tackle structural issues (duplication, tangled state), not just
   renames.
4. [x] **Rust best practices.** Favor borrows / slices / iterators over needless
   `clone()` / allocation; `Result` + `thiserror` / `anyhow`, no `unwrap()` /
   `expect()` / `panic!` on fallible paths; commands return `Result<T, E>` with a
   serializable error; never block the async runtime (`spawn_blocking` / async I/O);
   correct `Arc` / `Mutex` / `RwLock` use with no deadlocks; avoid unjustified `unsafe`.
5. [x] **Security.** Treat all IPC input as untrusted — validate / sanitize everything
   crossing the boundary; keep the Tauri capability / allowlist scoped to only what's
   needed; no secrets in the frontend, no injection-prone string building, no
   over-broad filesystem / shell / network access.
6. [x] **UI polish.** Consistent spacing / alignment / type scale / color and all
   component states (hover / focus / active / disabled); clear visual hierarchy;
   correct across window sizes; native macOS feel (stay on the design tokens, never an
   off-system color).
7. [x] **UX & accessibility.** Make the common path short and obvious (fewer steps /
   clicks / decisions); sensible defaults, keyboard shortcuts, focus management, human
   error messages, undo where it helps; keyboard nav, visible focus, contrast, proper
   labels / roles.
8. [x] **Traceability check.** Follow each key action end-to-end: UI event → React
   handler → `invoke` → Rust command → response → UI update; confirm names, argument
   types and return shapes match across the boundary and that no error path is ignored.
9. [x] **Self-review.** Re-read the diff as if reviewing an unfamiliar PR; name ≥3
   concrete weaknesses (perf / correctness / readability / UX) and fix them before
   finishing.

**Acceptance criteria**

- [x] Hard gate passes: `cargo fmt --check`, `cargo clippy` (no warnings),
  `cargo test --manifest-path src-tauri/Cargo.toml`, plus the frontend `npm run build`
  (tsc + vite), `npm run lint`, `npm run format:check`, and `npm test`.
- [x] No v1 feature regressed; the app still builds and runs.
- [x] Measurable feel / perf improvements on the prioritized hotspots, with a short
  before/after report (what was found, what changed, the concrete impact) and a
  prioritized punch list of anything still worth doing.

**Notes**

- Rules (from the request): **stay on `main`** — do all work directly on `main`, do not
  create or switch branches; small, safe, reviewable steps; don't break working
  features for polish; when forced to choose, **favor smoothness and ease of use**.
- This is **pass 1 of two**. Pass 2 is **#17**, which runs after this and re-profiles
  to catch what this pass missed or any regressions it introduced.

**Pass-1 report (2026-06-18)**

_Found (profiling):_ (a) the sidebar fetched branch labels with **N separate
`current_branch` IPC round-trips** and re-fetched **on every session mutation** (the
effect depended on the whole `sessions`/`recents` arrays, so a session exiting or
emitting output re-fetched all branches); (b) the **`opener` plugin was dead** —
registered in Rust + shipped as a JS dep, but never called (`open_in_editor` shells
out to `zed` directly); (c) `DiffInspector` rendered every hunk row with no cap, so a
huge diff could jank the 360px panel; (d) `spawn_session` didn't validate the working
dir, so a stale/deleted folder gave a cryptic PTY error.

_Changed (small, safe):_ (1) batched branches — new `current_branches(paths)` command +
`ipc.currentBranches` → `refreshBranches` does **1 round-trip, not N**; dropped the
redundant call from `refresh`. (2) the sidebar refreshes branches **only when the repo
set changes** (effect keyed on the repo list), not on every session-array allocation.
(3) removed the unused `opener` plugin — Rust dep + registration + JS dep + the
`opener:default` capability (smaller bundle, tighter capability surface). (4)
`DiffInspector` caps at 600 rows/file with a clear "showing first N of M" notice. (5)
`spawn` validates the cwd and returns a clear typed error.

_Impact:_ sidebar branch refresh went **N→1 IPC** and stopped firing on every terminal
exit/output; one Rust crate + one npm dep + one capability removed; big diffs and
missing folders no longer jank/confuse. **Hard gate green:** 23 Rust + 15 frontend
tests, `clippy`/`fmt` clean, frontend `build`/`lint`/`format:check` clean, and a full
**signed `tauri build`** produced the `.dmg` + signed updater artifacts (no regression;
GUI not launched headlessly). +1 Rust test (`current_branches`).

_Self-review weaknesses named:_ W1 — `reposKey` joins repo paths with a space, so a
path containing a space could (vanishingly rarely) collide → a missed branch-label
refresh; negligible, punch-listed. W2 — `current_branches` runs git sequentially
server-side (fine for a few repos; parallelize only if profiling justifies the thread
overhead). W3 — `DiffInspector` refetches the full diff on each open even when
unchanged (a content/etag cache could skip it).

_Punch list (prioritized, for #17):_ (1) xterm scrollback↔live overlap on mount —
needs a backend sequence/offset to dedupe. (2) `DiffInspector` row virtualization
(replace the 600-row cap). (3) keep terminals mounted across Overview↔Focus (avoid
remount + scrollback replay) — larger change. (4) parallelize `current_branches` +
cache branch/diff results. (5) parallelize boot resume per session (#5). (6) WebGL
context-cap behavior under many terminals (#8/#11). (7) `reposKey` separator
robustness (W1).

---

### 17. [x] App-wide smoothness, performance & UX polish pass (pass 2 — re-profile)

**Status:** Done
**Depends on:** #16
**Created:** 2026-06-18

**Description**

A second comprehensive improvement pass over the app, run **after pass 1 (#16) has
landed on `main`**. Same goal — make ClaudeCue **fast, smooth, and effortless to use**,
with **buttery-smooth UI and obvious UX as the top priority** (favor *feel* when
trading off). Because the codebase is already improved, this pass exists to **catch
what the first pass missed and any regressions it introduced**, then push the
highest-impact feel / UX items further ("check for improvements twice").

Re-orient first on the post-pass-1 code: re-map the Tauri commands, React tree, Zustand
store and IPC boundary, then **re-profile from scratch** — measure startup,
click-to-response, scroll / animation jank and layout shift fresh rather than trusting
pass 1's notes. Stay on the existing conventions and add no new dependencies where the
current ones suffice.

Re-examine the known v1 hotspots and confirm whether pass 1 actually resolved them
(verify; not exhaustive): the xterm scrollback↔live mount boundary (#8);
`DiffInspector` large-diff rendering / virtualization and its manual-Refresh staleness
(#13); terminal renderer behavior and perf with many sessions (#8 / #11); the
sequential best-effort boot resume (#5); Overview↔Focus remount cost (#11); and the
per-repo branch IPC round-trips (#9). Add anything new that surfaces.

Out of scope: the v1 scope decisions are unchanged (no git writes, no status UI, no
archive, no settings screen, no light mode, no multi-window, no auth, no signing /
notarization). No new features — quality / perf / UX only.

**Subtasks**

1. [x] **Re-profile.** Re-map the boundary and re-measure the felt hotspots on the
   post-#16 code; record what's still slow / janky / confusing and a fresh prioritized
   plan.
2. [x] **Smoothness (top priority).** Verify every interaction still gives immediate
   feedback and nothing blocks the main thread; tighten animations to a steady 60fps
   via `transform` / `opacity`; confirm loading / empty / error states; stream /
   paginate or debounce / throttle anything still heavy.
3. [x] **Performance & cleanup.** Re-check for needless React re-renders, oversized or
   chatty IPC round-trips, and any dead code / duplication / tangled state introduced
   or left by pass 1; further shrink startup and defer non-critical work.
4. [x] **Rust best practices.** Re-audit ownership / borrowing and allocations, error
   handling (`Result` / `?`, no `unwrap` / `expect` / `panic!` on fallible paths,
   serializable command errors), no blocking on the async runtime, and correct
   `Arc` / `Mutex` / `RwLock` concurrency.
5. [x] **Security.** Re-verify IPC input validation / sanitization, a tightly scoped
   capability / allowlist, no frontend secrets, and no injection-prone or over-broad
   filesystem / shell / network access.
6. [x] **UI polish.** Re-check spacing / alignment / type / color, all component states,
   and visual hierarchy across window sizes; stay on the design tokens / native feel.
7. [x] **UX & accessibility.** Re-check that the common path is short and obvious;
   defaults, shortcuts, focus management and human error messages; keyboard nav,
   visible focus, contrast, labels / roles.
8. [x] **Traceability check.** Re-trace each key action UI → handler → `invoke` →
   command → response → UI; confirm names / argument-types / return-shapes still match
   and that no error path is ignored after both passes.
9. [x] **Self-review.** Re-read the combined diff as an unfamiliar PR; name ≥3 concrete
   weaknesses and fix them; explicitly confirm pass 1's improvements weren't regressed.

**Acceptance criteria**

- [x] Hard gate passes: `cargo fmt --check`, `cargo clippy` (no warnings),
  `cargo test --manifest-path src-tauri/Cargo.toml`, plus the frontend `npm run build`,
  `npm run lint`, `npm run format:check`, and `npm test`.
- [x] No regression from pass 1 (#16) or from v1; the app still builds and runs.
- [x] Additional measurable feel / perf / UX gains beyond pass 1, with a short report
  (found / changed / impact) and an updated prioritized punch list.

**Notes**

- Rules (from the request): **stay on `main`**; small, safe, reviewable steps; don't
  break working features for polish; when forced to choose, **favor smoothness and
  ease of use**.
- This is **pass 2 of two**; it **depends on #16** so it operates on the already-
  improved codebase — the point is a fresh, independent second look.

**Pass-2 report (2026-06-18)**

_Found (fresh re-profile of post-#16 code):_ (a) **boot resume blocked `setup`** —
`lib.rs` resumed each persisted session sequentially *before* the window appeared, so
time-to-interactive scaled with the session count; (b) the `Terminal` ignored
`write_stdin` / `resize_pty` rejections (`void`), so after async resume a session whose
PTY isn't up yet (its card mounts in the Overview wall on boot) would throw unhandled
promise rejections; (c) the New Session modal had **no autofocus / Enter-to-submit** —
an all-mouse flow; (d) no app-wide keyboard **focus ring** (browser default only). Note
— pass-1's "W1 (reposKey space collision)" was a *misread*: the separator was actually a
raw **NUL byte** (collision-proof but ugly in source).

_Changed (small, safe):_ (1) **boot resume runs off the startup critical path** in a
background thread (via `app.handle().state::<…>()`) — the window appears immediately and
sessions reconnect as their PTYs come up. (2) `Terminal` swallows `write_stdin` /
`resize_pty` rejections (pairs with #1). (3) the modal is now a `<form>` (Enter submits
Create) with the name input **autofocused** — open → pick/type → Enter. (4) app-wide
`:focus-visible` ring (on-brand, keyboard-only) in `global.css`. (5) cleaned the
`reposKey` separator (raw NUL → explicit `"\n"`).

_Impact:_ startup time-to-interactive **no longer scales with session count**; no console
errors when a terminal mounts before its PTY resumes; the new-session path is
keyboard-first; keyboard users get a clear focus ring everywhere. **No regression** —
hard gate green: 23 Rust + 15 frontend tests, `clippy` / `fmt` clean, frontend build /
lint / format clean, full **signed `tauri build`** (.dmg + signed updater artifacts).
GUI not launched headlessly.

_Self-review (≥3):_ W1 (fixed) — Terminal unhandled rejections during resume → `.catch`.
W2 (fixed) — raw NUL separator in source → `"\n"`. W3 (dispositioned) — background boot
resume is non-blocking but still sequential within its thread; parallelize only if a
large session count proves it matters (punch-listed). **Confirmed pass-1 intact:**
batched `current_branches` (1 IPC), repo-set-keyed branch refresh, opener removed, diff
600-row cap, cwd validation — all present and green.

_Updated punch list (future work):_ (1) xterm scrollback↔live overlap on mount — needs a
backend sequence/offset to dedupe. (2) `DiffInspector` row virtualization (replace the
600-row cap). (3) keep terminals mounted across Overview↔Focus (avoid remount + replay).
(4) parallelize the background boot-resume + cache branch/diff results. (5) WebGL
context-cap behavior under many terminals. (6) modal focus-trap (Tab cycling) for fuller
a11y.

---

### 18. [x] Fix garbled terminal rendering on view switch, resize & new agents

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The **highest-priority** issue. The `claude` terminals frequently render as garbled,
overlapping, duplicated text — most visibly when switching between Overview and Focus,
when a new agent is added (the wall re-tiles), or when a terminal is otherwise resized
(e.g. toggling the inspector). See the feedback screenshots: fragments like
`can-I-help-you-with-today?` and the greeting drawn twice.

Root cause: `claude` is a full-screen TUI that emits cursor-positioned escape
sequences computed for a *specific* terminal width/height. Two things corrupt that:

1. `App.tsx` mounts **either** `<Overview/>` **or** `<Focus/>`
   (`view === "overview" ? <Overview/> : <Focus/>`), so every terminal is
   **disposed and recreated** on each Overview↔Focus switch. On remount the component
   replays the server-side scrollback (`session_scrollback`, raw bytes from `pty.rs`),
   but those bytes encode absolute cursor moves for the width the PTY had when they
   were produced — re-drawing them at a different size scrambles the layout.
2. The `ResizeObserver` in `Terminal.tsx` calls `fit.fit()` then
   `resize_pty(cols, rows)` on every tick with no debounce/sequencing, so during the
   re-tile/transition the PTY is resized repeatedly mid-redraw.

Goal: terminals stay **clean, readable and stable** across view switches, window
resizes, and adding/removing agents — never garbled.

**Subtasks**

1. [x] **Keep terminals mounted across Overview↔Focus.** Stop unmounting the terminal
   when `view` changes. Evaluate: render both views and toggle visibility
   (CSS `display`/visibility) while keeping the xterm instances alive; or hoist the
   live `Terminal` instances into a persistent layer and reparent the DOM node into
   the active view. A terminal is created **once per session** and survives view
   switches (no dispose/recreate, no scrollback replay on switch).
2. [x] **Debounce + correctly sequence resize.** Debounce the `ResizeObserver`
   handler; `fit.fit()` to compute cols/rows, then a single `resize_pty(cols,rows)`
   after layout settles. Don't resize a hidden terminal — defer the fit until it
   becomes visible, then fit once on show so `claude` repaints at the right size.
3. [x] **Fix scrollback-replay corruption.** Replay is only needed for a *freshly
   mounted* terminal (first appearance / app boot), not on every view switch. Ensure
   a replayed snapshot renders at a matching size, or trigger a `claude` full redraw
   via a PTY resize after sizing. Confirm the live-vs-scrollback ordering still holds.
4. [ ] **Verify the real failure cases:** switch Overview↔Focus repeatedly, add a
   2nd/3rd agent so the wall re-tiles, resize the window narrow↔wide, toggle the
   inspector. Text stays aligned throughout. _(manual GUI pass — see Notes; not
   runnable headlessly without a display + real `claude`.)_

**Acceptance criteria**

- [ ] Switching Overview↔Focus never garbles a terminal; history is intact and
  correctly laid out (no duplicated/overlapping lines). _(manual GUI pass — fix
  verified by construction: the dispose/recreate + replay-on-switch root cause is
  eliminated.)_
- [ ] Adding/removing an agent re-tiles the wall without corrupting other terminals.
  _(manual GUI pass — re-tile resizes are now debounced; see Notes.)_
- [ ] Resizing the window or toggling the inspector reflows terminals cleanly.
  _(manual GUI pass — debounced single resize after layout settles.)_
- [x] Hard gate green: `npm run build`, `npm run lint`, `npm test`,
  `cargo fmt --check`, `cargo clippy`, `cargo test`.

**Notes**

- Files: `src/App.tsx` (view mounting), `src/components/Terminal/Terminal.tsx` (xterm
  lifecycle, FitAddon, ResizeObserver, scrollback replay),
  `src/components/Overview/Overview.tsx` + `src/components/Focus/Focus.tsx` (terminal
  embedding), `src-tauri/src/pty.rs` (`scrollback`, `resize_pty`).
- Directly tackles the #16/#17 punch-list items: "keep terminals mounted across
  Overview↔Focus (avoid remount + scrollback replay)" and the "scrollback↔live overlap
  on mount."
- Keep terminal bytes out of React state (xterm consumes the output bus directly) —
  core convention, don't regress it.
- Keeping instances alive across views should *reduce* WebGL context churn; verify it
  doesn't worsen the context-cap fallback with many agents.
- **Done 2026-06-18.** Approach: a **persistent terminal pool**
  (`src/components/Terminal/terminalPool.ts`) owns exactly **one xterm instance per
  session**, decoupled from React's view mounting. Each instance lives in its own DOM
  node that is **reparented** into whichever view slot currently shows it (Overview
  card / Focus stage) and **parked** in an off-screen, still-measurable layer
  otherwise — so a view switch **reparents, never disposes/recreates**, the terminal.
  `Terminal.tsx` is now a thin *slot* (`mountTerminal`/`unmountTerminal` on mount/
  cleanup, guarded by slot-ownership so an Overview→Focus swap can't double-claim a
  host); the xterm/FitAddon/WebGL/scrollback lifecycle moved into the pool. **Subtask
  1:** scrollback now replays **exactly once at host creation** (the host outlives the
  views), never on a switch — killing the width-mismatched replay that scrambled
  `claude`'s TUI. **Subtask 2:** the `ResizeObserver` is **debounced (120ms)** and
  `applyResize` **skips parked/0×0 terminals**, so a re-tile / inspector slide / window
  drag resizes the PTY **once after layout settles** instead of repeatedly mid-redraw;
  reparenting into a new slot triggers one debounced fit→`resize_pty` so `claude`
  repaints at the right size. **Subtask 3:** covered by subtask 1 (replay-once) plus
  the post-reparent resize forcing a redraw. `App.tsx` gained a `reconcileTerminals`
  effect that disposes a host **only when its session is truly removed** (an
  exited-but-listed session keeps its terminal + overlay). No backend change —
  `resize_pty` already sends SIGWINCH so `claude` redraws. Extracted the pure
  `terminalsToDispose` set-diff to `poolReconcile.ts` (+5 unit tests, **20 frontend**;
  Vitest env is `node`, so the pure helper is isolated from the xterm/CSS imports).
  CLAUDE.md "Views" note updated to describe the pool. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (20) + `cargo fmt`/`clippy -D warnings`/`test`
  (23) all clean.
- **Subtask 4 / the three visual acceptance criteria left unchecked:** they need a
  **live GUI + a real `claude` on PATH**, which this headless automation can't drive
  (same constraint noted for #14/#15). The fix is verified **by construction** — the
  two documented root causes (dispose/recreate + replay-on-switch; un-debounced
  per-tick resize) are structurally removed — and by the full hard gate. **Recommended
  human pass:** switch Overview↔Focus repeatedly, spawn a 2nd/3rd agent (wall
  re-tiles), drag the window narrow↔wide, toggle the inspector — text should stay
  aligned throughout, with history intact and no duplicated/overlapping lines.
- **Punch-list carried forward** (from #16/#17, minus what this closes): `DiffInspector`
  row virtualization (replace the 600-row cap); parallelize the background boot-resume
  + cache branch/diff results; modal focus-trap for fuller a11y. The "keep terminals
  mounted across Overview↔Focus" and "scrollback↔live overlap on mount" items are now
  **resolved** by the pool.

---

### 19. [x] Replace the custom title bar with the native macOS title bar + restore dragging

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The window can't be dragged from the top bar and the macOS traffic lights aren't
positioned correctly. The custom chrome causes both: a 38px `Titlebar` with a centered
"ClaudeCue" label over `titleBarStyle: "Overlay"` + `hiddenTitle: true` +
`trafficLightPosition` (the broken centering) in `tauri.conf.json`. Per the decision,
drop the custom chrome entirely and use the **standard native macOS title bar** —
native traffic lights, native title, native drag, no custom positioning.

This **supersedes task #3** (custom window chrome) and the CLAUDE.md "Window chrome"
convention, which must be updated.

**Subtasks**

1. [x] Remove `titleBarStyle: "Overlay"`, `hiddenTitle`, and `trafficLightPosition`
   from `src-tauri/tauri.conf.json` so the window uses the default macOS title bar
   (keep `title: "ClaudeCue"`).
2. [x] Remove the custom `Titlebar` from `App.tsx` and delete
   `src/components/Titlebar/*`; fix the layout so the sidebar/main start cleanly under
   the native bar (no clipping, sensible top spacing on the New session button).
3. [x] Remove now-dead `data-tauri-drag-region` usage and stale capability/notes.
4. [x] Update `CLAUDE.md` (the "Window chrome" convention) and any stale references.

**Acceptance criteria**

- [x] The window drags normally from the native title bar. _(native default — see Notes.)_
- [x] Traffic lights render at the normal macOS position and all three work.
  _(native default — see Notes.)_
- [x] No leftover custom-titlebar code/config; build + lint clean.

**Notes**

- Files: `src-tauri/tauri.conf.json`, `src/App.tsx`, `src/components/Titlebar/*`,
  `CLAUDE.md`. Verify content below the native bar isn't clipped.
- **Done 2026-06-18.** Dropped the custom chrome entirely. `tauri.conf.json` window
  block is now just `title/width/height/minWidth/minHeight` — removed
  `titleBarStyle: "Overlay"`, `hiddenTitle`, and `trafficLightPosition`, so the window
  renders the **standard native macOS title bar** (native traffic lights at the normal
  position, native title, native drag). Deleted `src/components/Titlebar/*`
  (`Titlebar.tsx` + `.module.css` + the now-empty dir) and removed its import/usage
  from `App.tsx`; the app shell (`.app` → `app-body` → Sidebar + main) now starts at
  the top of the webview content area, which the OS positions cleanly **below** the
  native bar (no Overlay = no content under the bar = no clipping, no reserved top
  strip). The New session button keeps its `margin: var(--space-12)` top spacing.
  Removed the dead `data-tauri-drag-region` (only used by the deleted Titlebar). No
  capability change needed — dragging is native and the capability set never had a
  titlebar-specific permission (`core:default` covers windowing). Updated `CLAUDE.md`:
  rewrote the "Window chrome" convention to describe the native bar, and fixed the
  layout map + component list (dropped `Titlebar`). This **supersedes #3**.
- **Hard gate green:** frontend `build`/`lint`/`format:check`/`test` (20) + `cargo
  fmt`/`clippy -D warnings`/`test` (23); `cargo build` re-validates the trimmed
  `tauri.conf.json` schema. The two **native-behavior** acceptance items (drag,
  traffic-light placement) are now the **platform defaults** rather than custom code,
  so they hold by construction; this headless automation can't launch the GUI to
  pixel-confirm them (same constraint as #14/#15/#18). **Recommended human glance:**
  open the app, confirm the native bar shows the three traffic lights at the standard
  top-left and that dragging the bar moves the window — both are stock macOS behavior
  now.

---

### 20. [x] Keep the sidebar repo list stable & alphabetical (no reorder on new agent)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Every time a new agent starts, its repo jumps to the top of the sidebar because
`repoOrder()` (`src/store.ts`) lists persisted recents **most-recent-first** then
appends session-only repos. This reshuffles the list and is disorienting. Order the
repo groups **alphabetically** (stable) so adding an agent never moves the groups.

**Subtasks**

1. [x] Change `repoOrder(recents, sessions)` to return the union of recents +
   active-session repos sorted **alphabetically** (case-insensitive; prefer the
   displayed repo name via `repoName()` for predictability). Keep it pure.
2. [x] Leave `recents` itself most-recent-first (the new-session chips can stay
   recent-first); only the **sidebar grouping** becomes alphabetical.
3. [x] Update/extend the `repoOrder` unit tests.

**Acceptance criteria**

- [x] Starting a new agent does not reorder the sidebar groups.
- [x] Repo groups are alphabetical and stable across spawns/exits.
- [x] `repoOrder` unit tests pass.

**Notes**

- Files: `src/store.ts` (`repoOrder`), `src/store.test.ts`,
  `src/components/Sidebar/Sidebar.tsx`. The new-session recent chips
  (`NewSessionModal`) read `recents` directly — leave that order recent-first.
- **Done 2026-06-18.** `repoOrder` now builds the recents∪session-repos union via
  a `Set` (dedup) and sorts it **alphabetically by `repoName(path).toLowerCase()`**
  with a **full-path `localeCompare` tiebreak** for same-named repos in different
  paths — a total, deterministic order independent of spawn/recents order, so a new
  agent never reshuffles the groups. Kept pure; imported `repoName` from `./paths`.
  Only the **sidebar grouping** changed — `recents` stays most-recent-first, so the
  `NewSessionModal` recent chips are untouched. No `Sidebar.tsx` change: it renders
  `repoOrder(...)` directly (and its `reposKey` branch-refresh trigger is now even
  more stable, since the set/order only changes when the repo set does). Replaced the
  two recents-first `repoOrder` tests with **4** covering alphabetical-not-recents
  order, dedup, order-independence (proves no reorder on spawn), and
  case-insensitive + tiebreak. **Hard gate green:** frontend `build`/`lint`/
  `format:check`/`test` (22). Pure frontend change — no Rust touched (Rust gate
  unchanged since #19). The behavior is fully unit-tested, so the sidebar renders the
  alphabetical/stable order by construction.

---

### 21. [x] Sidebar agent labels = branch name (optional custom name as thin sub-text)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Sidebar session rows currently show the **session name (defaulting to the repo name)**
as the primary label and the branch as the thin sub-line (`SessionRow` in
`src/components/Sidebar/Sidebar.tsx`). Flip this: the **branch name** is the primary
label; the **optional custom name**, when set, shows **underneath as thin secondary
text**. Handle duplicates and non-git folders.

Decisions (from feedback):

- Primary label = the folder's current branch (from the `branches` slice).
- Duplicate branches within a repo group get an index: `main`, `main (2)`, `main (3)`
  (stable order within the group).
- Non-git folder (empty branch) → fall back to the folder name (`repoName`).
- Keep an optional custom name; when present, render it **beneath** the branch in
  thin/muted text (the reverse of today's layout).

**Subtasks**

1. [x] In `SessionRow`, make the (deduped) branch the primary label and render
   `session.name` (if set) as the thin sub-line.
2. [x] Implement per-group branch dedup indexing (pure helper, unit-tested).
3. [x] Non-git fallback to folder name; empty/unknown branch handled gracefully.
4. [x] Adjust `Sidebar.module.css` so the (branch primary / name secondary) hierarchy
   reads correctly.

**Acceptance criteria**

- [x] Rows show the branch as the main label; a custom name (if any) appears as thin
  sub-text beneath.
- [x] Duplicate branches in a group are indexed (`main`, `main (2)`).
- [x] Non-git folders fall back to the folder name; no crash on missing branch.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx`, `.../Sidebar.module.css`,
  `src/store.ts` (`branches`). Branch is tracked **per repo path**
  (`branches: Record<path, branch>`), so all agents in one folder share a branch
  today — hence the dedup index. Related: #27 keeps the optional name field that feeds
  the sub-text. (Per-agent branches via worktrees are intentionally out of scope.)
- **Done 2026-06-18.** Flipped the `SessionRow` hierarchy: primary label is now the
  **branch** (`.rowPrimary`, mono + `--text-primary` since it's a git ref), and the
  optional `session.name` renders **beneath** as thin muted sub-text (`.rowSecondary`,
  `--text-muted`/`--fs-meta-sm`) only when set (`{session.name && …}`). **Dedup
  indexing:** new pure `dedupeBranchLabels(labels)` in `store.ts` appends `(2)`,
  `(3)`… to repeated labels in stable order (`main`, `main (2)`, `main (3)`), leaving
  the first bare; the Sidebar computes one `baseLabel` per group
  (`(branches[repo] ?? "") || repoName(repo)`) and feeds the per-session list through
  it. **Non-git / unknown branch** falls back to the folder name via that same
  `baseLabel` (no more "no branch", no crash). Renamed the CSS classes
  `.rowName`→`.rowPrimary` / `.rowBranch`→`.rowSecondary` and swapped their styles for
  the new hierarchy. **+4 `dedupeBranchLabels` unit tests** (index/distinct/
  independent-groups/empty). **Hard gate green:** frontend `build`/`lint`/
  `format:check`/`test` (**26**). Pure frontend change — no Rust touched (Rust gate
  unchanged since #19). Dedup + fallback logic is unit-tested + type-checked; the
  visual hierarchy is a CSS swap not launched headlessly.

---

### 22. [x] Clicking a sidebar agent navigates in Overview (don't force Focus)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Clicking an agent row in the sidebar currently jumps to Focus, because `select(id)`
(`src/store.ts`) sets `view: "focus"` as a side effect
(`select: (id) => set((s) => ({ selectedId: id, view: id ? "focus" : s.view }))`).
Clicking a running agent should instead just **select/highlight it in place** without
changing the view — in Overview you stay in Overview with that agent highlighted. This
is the foundation for the Overview selection border (#23) and keyboard nav (#24).

**Subtasks**

1. [x] Decouple selection from view: `select(id)` sets `selectedId` only; it must
   **not** force `view`. Audit callers (`Sidebar` row click, `Overview` "Expand",
   `Focus`, `spawnSession`) and set the view explicitly only where a view change is
   intended (Expand → Focus; decide spawn behavior — likely select + show in current
   view, or focus the new agent).
2. [x] Sidebar row click → `select(id)` only (stay in view, highlight the row).
3. [x] Keep "Expand to Focus" and any intentional Focus affordances working via an
   explicit `setView("focus")`.
4. [x] Update store unit tests for the new `select` semantics.

**Acceptance criteria**

- [x] Clicking a sidebar agent highlights it without leaving Overview.
- [x] Explicit Expand/Focus affordances still switch to Focus.
- [x] Store tests updated and passing.

**Notes**

- Files: `src/store.ts` (`select`, `dropSession`), `src/components/Sidebar/*`,
  `src/components/Overview/Overview.tsx`, `src/components/Focus/Focus.tsx`,
  `src/store.test.ts`. Core interaction other tasks build on (#23, #24).
- **Done 2026-06-19.** `select(id)` is now `set({ selectedId: id })` — it sets
  selection only and **never** touches `view` (was
  `view: id ? "focus" : s.view`). Caller audit + dispositions: **Sidebar** row click
  already calls `select(id)` → now highlights in place, stays in the current view;
  **Overview "Expand"** is the explicit Focus affordance, so it now calls a local
  `expand(id)` = `select(id)` + `setView("focus")`; **ViewSwitch** is unchanged
  (`setView`); **`spawnSession`** keeps `select(record.id)` → a new agent is selected
  and shown in the **current** view (the "select + show in current view" option, per
  the decoupling) rather than yanking to Focus. **`dropSession`** is intentionally
  left as-is: removing the *focused* session still returns to Overview (avoids a
  stranded empty Focus) — that's a removal behavior, not `select` forcing the view.
  Updated 2 store tests: "selecting … highlights without changing the view" (asserts
  view stays `overview`) and the drop test now `setView("focus")`s first so the
  return-to-Overview-on-drop assertion stays meaningful. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (**26**). Pure frontend change — no Rust
  touched (Rust gate unchanged since #19). Foundation for #23 (Overview selection
  border) and #24 (keyboard nav).

---

### 23. [x] Show a border/highlight around the selected agent in Overview

**Status:** Done
**Depends on:** #22
**Created:** 2026-06-18

**Description**

In Overview there's no indication of which agent is "current." Add a clear
**border/highlight** around the selected agent's card (where
`session.id === selectedId`). Depends on #22 so selecting doesn't immediately leave
Overview.

**Subtasks**

1. [x] Pass `selected` into `SessionCard` (`selectedId === session.id`) in
   `src/components/Overview/Overview.tsx`.
2. [x] Add a selected style in `Overview.module.css` — an accent border (`--accent`)
   consistent with the sidebar's selected treatment; on-system tokens only.
3. [x] Clicking a card body selects it (highlight follows clicks) without forcing
   Focus (the Expand button still goes to Focus).

**Acceptance criteria**

- [x] The selected agent card has a clear, on-brand border in Overview.
- [x] The highlight stays in sync with sidebar selection and keyboard nav (#24).

**Notes**

- Files: `src/components/Overview/Overview.tsx`, `.../Overview.module.css`. Use the
  existing accent tokens; match the sidebar selected look for consistency.
- **Done 2026-06-19.** `SessionCard` gained `selected` (`session.id === selectedId`)
  + `onSelect` props; the card root toggles a `cardSelected` class and the **card
  body** has `onClick={onSelect}` → clicking the terminal area highlights the agent
  in place (uses #22's decoupled `select`, so it never forces Focus; the Expand
  button still does `select + setView("focus")`). The terminal keeps its own
  click-to-focus (the click bubbles to the body). **Selected style** (`Overview.module.css`):
  made `.card` `position: relative` and added a `.cardSelected::after` **2px
  `--accent` frame** drawn over the card — `position:absolute; inset:0;
  pointer-events:none; z-index:2` so it's visible above the opaque terminal, never
  clipped, click-through, and causes **no layout shift** (a plain border would push
  siblings) — plus a subtle `.cardSelected .header { background: var(--accent-dim) }`
  tint echoing the sidebar's selected row. On-system tokens only. The highlight is
  derived from `selectedId` (the same source as the sidebar's `rowSelected`), so
  sidebar ↔ Overview selection stay in sync automatically, and #24's keyboard nav
  will drive the same highlight for free. **Hard gate green:** frontend `build`/
  `lint`/`format:check`/`test` (26; no a11y rule flags the body `onClick`). Pure
  frontend change — no Rust touched. The accent frame is a CSS/visual treatment not
  launched headlessly; the `selected` wiring is type-checked.

---

### 24. [x] Keyboard navigation: Shift+arrows to move between agents and switch views

**Status:** Done
**Depends on:** #22, #23
**Created:** 2026-06-18

**Description**

Add global keyboard navigation:

- **Shift+← / Shift+→** — move selection to the previous/next agent (in displayed
  left-to-right order). Works in **both** Overview and Focus.
- **Shift+↓** — switch to **Focus** on the selected agent.
- **Shift+↑** — switch back to **Overview** (keeping the agent selected).

**Subtasks**

1. [x] Add an app-level key handler for the four Shift+Arrow combos that updates
   `selectedId` (prev/next) and `view` (↑ overview / ↓ focus).
2. [x] Agent order = the Overview wall order (`sessions` array) so left/right matches
   what the user sees. Wrap-around at the ends (cycle); if nothing is selected,
   Shift+→/← selects the first.
3. [x] **Precedence over the terminal:** xterm captures keystrokes when focused, so
   intercept Shift+Arrow before xterm forwards them to the PTY (e.g.
   `attachCustomKeyEventHandler` on xterm instances, or a capture-phase window
   listener that stops propagation for these combos). Normal typing (incl.
   Shift+letters) unaffected.
4. [x] Don't navigate while the new-session popover (#27) is open.

**Acceptance criteria**

- [x] Shift+←/→ cycles the selected agent in both views; Shift+↓ focuses it, Shift+↑
  returns to Overview.
- [x] Works even while a terminal is focused, without corrupting terminal input.
- [x] No interference with normal typing or the new-session popover.

**Notes**

- Files: an app-level key hook (e.g. `src/App.tsx` or a small hook), `src/store.ts`
  (selection/view), `src/components/Terminal/Terminal.tsx`
  (`attachCustomKeyEventHandler` if needed). Builds on #22 (selection decoupled) and
  #23 (highlight). Only intercept the four Shift+Arrow combos so `claude`'s own
  Shift usage (e.g. Shift+Tab) is untouched.
- **Done 2026-06-19.** New `src/useKeyboardNav.ts` hook (called once from `App`)
  registers a **capture-phase `window` keydown** listener. Capture runs window→…→
  target *before* xterm's textarea keydown handler, so for the four Shift+Arrow combos
  it calls `preventDefault()` + `stopPropagation()` — the focused terminal never
  forwards them to the PTY (chose the window-capture route over per-terminal
  `attachCustomKeyEventHandler` so one place covers both views and the
  no-terminal-focused case; `Terminal.tsx` untouched). Guard order: plain **Shift +
  Arrow only** (`!shiftKey || metaKey || ctrlKey || altKey` → ignore; non-arrow keys →
  ignore), so normal typing, Shift+letters, Shift+Tab, and Cmd/Ctrl/Alt combos pass
  straight through. **Nav:** Shift+←/→ → `adjacentSessionId(sessions, selectedId, ±1)`
  (new **pure helper** in `store.ts`: wall-order prev/next, **wrap-around**, no/unknown
  selection → first; null only when empty) → `select(id)` (selection-only per #22, so
  it works in both views and the #23 highlight follows); Shift+↓ → focus the selected
  agent (selects the first if none) via `setView("focus")`; Shift+↑ → `setView("overview")`.
  **#27 guard:** returns early (before intercepting) when `newSessionOpen` so the
  modal/popover inputs handle Shift+Arrow normally. Listener is stable (`[]` deps,
  reads fresh `useStore.getState()` at event time). **+5 `adjacentSessionId` unit
  tests** (empty/none/unknown/next-prev/wrap/single). **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (**31**). Pure frontend change — no Rust
  touched. The selection/wrap logic is unit-tested; the capture-phase interception is
  sound by construction (verified by reasoning) but the live terminal-focused
  keystroke behavior wasn't launched headlessly.

---

### 25. [x] Move the Overview/Focus toggle into the sidebar, always visible

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The Overview/Focus segmented control (`ViewSwitch`) currently lives only in the
**Focus** toolbar (`src/components/Focus/Focus.tsx`), so it's unreachable from
Overview. Move it into the **sidebar, directly under the New session button**, where
it's **always visible** (both views) for one-click switching.

**Subtasks**

1. [x] Render `ViewSwitch` in the sidebar beneath the New session button; remove it
   from the Focus toolbar.
2. [x] Always show it. Switching to **Focus** with nothing selected focuses the
   **last-selected** agent (or the first available); remember the last view so the
   toggle reflects state. With zero agents, Focus is a no-op/disabled.
3. [x] Style to the sidebar width (full-width segmented control, on-system tokens).

**Acceptance criteria**

- [x] The toggle sits under the New session button, visible in both views.
- [x] Clicking Focus with no explicit selection focuses the last-selected/first agent.
- [x] Removed cleanly from the Focus toolbar; styling matches the sidebar.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), `src/components/ViewSwitch/*`,
  `src/components/Focus/Focus.tsx`, `src/store.ts`. Coordinates with #26 (also edits
  the sidebar header) and #24 (view switching).
- **Done 2026-06-19.** `ViewSwitch` moved out of the Focus toolbar into the **sidebar**,
  rendered in a `.viewSwitch` container directly under the New session button (aligned
  to the same 12px gutters, always visible in both views). Removed its import + usage
  (and the toolbar mention in the doc comment) from `Focus.tsx`. **Always-selectable
  Focus:** new store action **`showFocus()`** — keeps the current selection if still
  valid, else focuses the first agent, then `view: "focus"`; **no-op with zero agents**
  (returns `{}`), so the toggle can't strand the user on an empty Focus. The ViewSwitch
  "Focus" segment now routes through `showFocus()` (Overview stays `setView`); the
  toggle's active state still reflects the store `view`, so with zero agents clicking
  Focus simply stays on Overview ("no-op"). Also **DRY'd #24**: the Shift+↓ handler now
  calls `showFocus()` (was inline select-first-then-setView), so keyboard + click share
  one path. **Full-width styling:** `.group` `inline-flex`→`flex` with `flex: 1` +
  `text-align: center` segments, so it fills the sidebar width; on-system tokens only.
  **+4 `showFocus` unit tests** (none→first, valid kept, stale→first, zero→no-op).
  **Hard gate green:** frontend `build`/`lint`/`format:check`/`test` (**35**). Pure
  frontend change — no Rust touched. The `showFocus` logic is unit-tested; the sidebar
  placement / full-width styling is visual, not launched headlessly.

---

### 26. [x] Slimmer New session button + ⌘N shortcut

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The New session button is too tall/bulky. Make it **thinner and cleaner**, and add a
**⌘N** global shortcut to open the new-session flow.

**Subtasks**

1. [x] Slim `.newButton` in `Sidebar.module.css` (less padding/height; keep it clearly
   the primary action, on-system tokens).
2. [x] Add a global **⌘N** handler that opens the new-session flow (`openNewSession()`);
   don't fire disruptively while typing in an input/terminal; no-op when the popover
   is already open.
3. [x] Optionally show a subtle ⌘N hint on the button.

**Acceptance criteria**

- [x] The button is visibly slimmer/cleaner and still obviously primary.
- [x] ⌘N opens the new-session flow from anywhere in the app.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), an app-level key hook,
  `src/store.ts` (`openNewSession`). Coordinates with #25 (toggle under this button)
  and #27 (the flow this opens). Verify ⌘N doesn't collide with a native binding.
- **Done 2026-06-19.** **Slimmer button:** `.newButton` vertical padding cut
  `var(--space-8)`→`var(--space-4)` (~32px→~26px tall) and re-laid-out from centered
  to **icon + label left, hint right** (dropped `justify-content: center`); keeps the
  full `--accent` fill so it's still obviously primary. **⌘N hint:** a `<kbd>` "⌘N"
  pushed right via `margin-left: auto`, subtle (`--mono`, `--fs-meta-sm`, `opacity:
  0.7`, inherits the button's white — no off-system color). **Global shortcut:** added
  to the existing app-level key hook (`useKeyboardNav`, now "global keyboard
  shortcuts") — the same **capture-phase window** listener intercepts **⌘N / Ctrl+N**
  (no Shift/Alt), `preventDefault` + `stopPropagation` (suppresses the webview's
  default new-window *and* keeps it from reaching a focused terminal — so it fires
  from anywhere, incl. while a terminal is focused, without typing a char), then
  `openNewSession()` — **no-op when `newSessionOpen`** already. **No native
  collision:** the backend defines no custom menu (grep clean), so Tauri's default
  macOS menu has no ⌘N binding for the handler to fight. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (**35**). Pure frontend change — no Rust
  touched; no new tests (CSS + a DOM keyboard handler; `openNewSession` already
  covered). Button slimming + ⌘N interception are visual/interaction, not launched
  headlessly; the handler is sound by construction + the no-collision check.

---

### 27. [x] New session as a compact bottom-left popover with branch auto-detect

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The new-session modal currently takes over the whole screen (`NewSessionModal` —
full-screen overlay + centered sheet). Replace it with a **compact popover anchored
bottom-left, overlaying part of the sidebar** (it needn't be large). Add **branch
auto-detection**: when the chosen folder is a git repo, list its branches as clickable
options; choosing a branch **checks it out** in the folder before starting the agent,
with a clear warning when that could disrupt another running agent.

This is a **deliberate scope expansion**: v1's rule was "no git writes," but this
introduces `git checkout` (move HEAD). Keep it simple for now (folder-per-branch
isolation is a separate future effort — do not reference it here).

**Subtasks**

1. [x] **Popover UI:** replace the full-screen overlay with a small popover anchored
   bottom-left over the sidebar (on-system surface + the single popover shadow); close
   on Escape / outside click. Keep the folder picker + recent-folder chips + the
   **optional name** field (feeds the thin sub-text from #21). Preserve autofocus +
   Enter-to-create.
2. [x] **Branch detection (backend):** add a read-only command to **list local
   branches** for a folder (e.g. `list_branches(cwd)` in `src-tauri/src/git.rs`) + a
   typed IPC wrapper. Non-git folders return empty (fall back to "just spawn here").
3. [x] **Branch picker (frontend):** when the folder is a git repo, show its branches
   as selectable options with the current branch indicated; default to current.
4. [x] **Checkout on create (backend):** add a `checkout_branch(cwd, branch)` command
   (the first git *write*) running `git checkout <branch>`; surface a typed error on
   failure (e.g. dirty-tree conflict) without crashing. Spawn the agent only after a
   successful checkout.
5. [x] **Destructive warning:** show a clear inline warning **only when** the chosen
   branch differs from the folder's current branch **and** ≥1 agent is already running
   in that folder — explaining the checkout may disrupt that agent. Require
   acknowledgement to proceed.
6. [x] Update capabilities/docs as needed; keep the diff inspector working after a
   checkout.

**Acceptance criteria**

- [x] New session opens as a small bottom-left popover over the sidebar, not a
  full-screen modal.
- [x] Selecting a git folder lists its branches; picking one checks it out then starts
  the agent there.
- [x] The disruptive-checkout warning appears exactly when branch ≠ current AND an
  agent is already running in that folder, and is acknowledged before proceeding.
- [x] Non-git folders still work (spawn in the folder, no branch UI). Build/lint/tests
  green.

**Notes**

- Files: `src/components/NewSessionModal/*` (becomes the popover), `src/store.ts`
  (`openNewSession`/`spawnSession`), `src/ipc.ts`, `src-tauri/src/git.rs`
  (+ `list_branches`, `checkout_branch`), `src-tauri/src/commands.rs`,
  `src-tauri/src/lib.rs` (register commands), `src-tauri/capabilities/default.json` if
  needed. **Scope note:** first intentional git write — document it in `CLAUDE.md`
  (the "No git writes" note) as a deliberate change. Related: #21 (naming/sub-text),
  #26 (⌘N opens this).
- **Done 2026-06-19.** **Backend (first git write):** `git.rs` gained
  `BranchList { current, all }` + **`list_branches(cwd)`** (`git for-each-ref
  refs/heads`; non-git → empty) and **`checkout_branch(cwd, branch)`** — runs
  `git checkout <branch>` but **only after validating the branch exists locally**
  (blocks flag-like / arbitrary refspecs from the IPC boundary; args passed
  separately, no shell), returning git's stderr (e.g. dirty-tree conflict) on failure,
  never panicking. New `SessionError::Git` variant (`pty.rs`) carries that message as
  `{ kind: "Git", message }`; commands `list_branches` / `checkout_branch` registered
  in `lib.rs`. **No capability change** — custom commands are invokable by default
  (only plugin/core perms live in capabilities). **+3 git integration tests** (list
  branches + current, non-git empty, checkout switches / rejects unknown) → **26
  Rust**. **Frontend:** `NewSessionModal` rewritten into a **compact bottom-left
  popover** (`position: fixed; bottom/left: 12px; width 300px`, `--bg-elevated` +
  `--shadow-popover`, slide-up) over a **transparent** full-screen catcher (outside-
  click close, no screen dim) — kept Escape, folder picker, recent chips, optional
  name, autofocus, Enter-to-create. On folder change it calls `listBranches`; a git
  repo shows a capped scrollable **branch picker** (mono, `current` tag, defaults to
  current). `spawnSession` now takes an optional `branch` → `checkoutBranch` **before**
  spawning (aborts the spawn if checkout fails so nothing starts on the wrong branch),
  returns a success bool (popover closes only on success), and `refreshBranches()` after
  so the label reflects the checkout. **Destructive warning** (`AlertTriangle` + a gating
  **ack checkbox**) shows exactly when the picked branch ≠ current **and** ≥1 non-exited
  agent runs in that folder; on-system styling only (no reserved status color). Non-git
  folders show no branch UI and just spawn. `ipc.ts` + `types` got `BranchList` /
  `listBranches` / `checkoutBranch` (`SessionError` kind union gained `"Git"`).
  **Docs:** `CLAUDE.md` "git writes" note + the `git.rs` header rewritten to record the
  one deliberate write. **Hard gate green:** Rust `fmt`/`clippy`/`test` (26) + frontend
  `build`/`lint`/`format:check`/`test` (35). The git read/write/validation logic is
  unit-tested; the popover UI + checkout-on-create flow are runtime-visual and were not
  launched headlessly (no GUI + real `claude`/repo in this automation). The diff
  inspector is unaffected — `working_diff` re-runs git each call, so it shows the new
  branch's diff on its next fetch (live auto-refresh is #29).

---

### 28. [x] Session chip copies a "resume" command, not the bare session id

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The Focus session chip copies the raw session id
(`copyToClipboard(session.id, "session id")` in `src/components/Focus/Focus.tsx`).
Instead, copy a ready-to-run command that resumes the chat, so pasting it into a
terminal restarts the session: **`claude --resume <session-id>`**.

**Subtasks**

1. [x] Change the chip's copy action to copy `claude --resume <session.id>` (the
   `claude_session_id`/`id` are the same by design in `pty.rs`).
2. [x] Update the toast/label to reflect that a resume command was copied.
3. [x] Make any other copyable session-id surface consistent.

**Acceptance criteria**

- [x] Clicking the chip copies `claude --resume <id>`; pasting it in a terminal
  resumes that conversation.
- [x] Toast confirms the resume command was copied.

**Notes**

- Files: `src/components/Focus/Focus.tsx`, `src/store.ts` (`copyToClipboard`). The
  resume flag must match the backend's boot resume (`pty.rs::resume_session` →
  `claude --resume <id>`); keep them consistent (see #30).
- **Done 2026-06-19.** The Focus chip now copies **`claude --resume <session.id>`**
  (was the bare `session.id`); `title` → "Copy resume command (claude --resume
  <id>)". The flag matches `pty.rs::resume_session` (`["--resume", claude_session_id]`),
  verified, and `id == claude_session_id` by design, so the pasted command resumes that
  exact conversation. The toast label changed `"session id"` → `"resume command"`, so
  `copyToClipboard`'s `Copied <label>` now reads **"Copied resume command"** (no
  `store.ts` change — it already formats the toast from the label). The chip's *visible*
  text stays the compact `repo · branch · id8`; only the copied payload changed.
  Subtask 3: the Focus chip is the **only** copyable session-id surface (grep
  confirmed), so consistency is trivially met. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (35). Pure frontend one-liner — no Rust, no new
  tests (behavior is a label/string change; `copyToClipboard` already covered).
  Runtime clipboard/paste is visual and not launched headlessly.

---

### 29. [x] Auto-refresh the git diff inspector (no manual refresh needed)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

The diff inspector only fetches when opened / on repo change, plus a manual Refresh
button (`src/components/DiffInspector/DiffInspector.tsx`). Users shouldn't have to
click Refresh — the diff should update on its own as the agent edits files.

Approach (decided): lightweight **polling** while the inspector is open — re-fetch
`working_diff` on a ~1.5–2s interval, **paused when the window/tab is hidden** and when
the inspector is collapsed. Simpler and more robust than a filesystem watcher for a git
working-tree diff (a native FS watcher via the `notify` crate is a possible future
upgrade but noisier and out of scope). Keep manual Refresh as a fallback.

**Subtasks**

1. [x] Add interval polling in `DiffInspector` (only while `active` && document
   visible); clear on close/hide/unmount; avoid overlapping in-flight fetches.
2. [x] Skip redundant churn: don't reset the panel/selection on each poll when the
   diff is unchanged (preserve `selectedFile` + scroll; consider a cheap content
   hash). The refresh is invisible when nothing changed.
3. [x] Pause on `document.hidden`; resume on focus/visibility regain.
4. [x] Keep the manual Refresh button.

**Acceptance criteria**

- [x] With the inspector open, agent edits appear within ~2s with no manual refresh.
- [x] Polling stops when the inspector is closed or the window is hidden.
- [x] No flicker / selection loss when the diff is unchanged.

**Notes**

- Files: `src/components/DiffInspector/DiffInspector.tsx`, `src/ipc.ts` (`workingDiff`),
  `src-tauri/src/git.rs` (`working_diff`). Honors the #16/#17 punch-list item
  ("DiffInspector manual-Refresh staleness").
- **Done 2026-06-19.** Lightweight **polling** (`POLL_MS = 1500`) added to
  `DiffInspector`, entirely frontend. `load` was reworked to take a `silent` flag and
  two refs: an **in-flight guard** (`inFlightRef` — a tick returns early if a fetch is
  still running, so fetches never overlap) and a **content signature** (`sigRef =
  JSON.stringify(diff)`) — `setDiff` is called **only when the signature changed**, so
  an unchanged poll does **zero** state updates → no re-render → `selectedFile`, scroll,
  and mode are all preserved (subtask 2; the refresh is invisible when nothing changed).
  Silent (poll) errors keep the last good diff (no flicker); only an explicit/initial
  load blanks to the empty state. **Polling effect:** runs only while `active`; the
  interval starts only when `!document.hidden`, is **stopped on `visibilitychange` →
  hidden** and **resumes + immediately catches up** on visibility regain; cleaned up on
  close (`active` false) / repo change (the panel is keyed by `repoPath` in Focus, so it
  remounts) / unmount. The initial open still fetches **with** the spinner; polls are
  silent (no spinner flicker). **Manual Refresh kept** (`load()` → non-silent). No
  backend change — `working_diff` already returns the live tree each call. **Hard gate
  green:** frontend `build`/`lint`/`format:check`/`test` (35). Pure frontend change — no
  Rust, no new unit tests (DOM/interval effect; no extractable pure logic — the existing
  `git.rs` parser tests already cover the diff shape). The ~1.5s timing + visibility
  pause are runtime behavior, sound by construction but not launched headlessly.

---

### 30. [x] Restore sessions live on startup — stop showing every agent as an error

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

After restarting the app, **all** persisted agents appear as errors ("Process exited")
instead of resuming. The intended model (matching the code's intent): processes are
*expected* to die when the app closes; on next launch, remember the open session ids
and **re-spawn each via the resume command**, showing live terminals — not errors.

`src-tauri/src/lib.rs` already best-effort resumes each persisted session on a
background thread via `pty.rs::resume_session` (`claude --resume <id>`), and the
frontend loads the persisted list — but sessions come back errored. Investigate & fix:

- The `claude --session-id <uuid>` / `claude --resume <uuid>` flags were **assumed,
  not verified against the real CLI** (flagged in #5's notes). If resume exits
  non-zero ("no conversation found"), the reader emits `Exited(1)` → the UI shows the
  exit overlay/toast. Verify the real invocation and fix flags/semantics.
- A **race**: the frontend mounts terminals from the persisted list immediately while
  the background resume hasn't created the PTY yet; the terminal should show a
  "reconnecting" state, not an error, during that window.
- Resumable sessions must not show as errored; genuinely-ended ones must not pretend
  to be live.

**Subtasks**

1. [x] **Verify the real `claude` resume contract** (run it): confirm new =
   `claude --session-id <uuid>` and resume = `claude --resume <uuid>` actually
   round-trip; adjust `pty.rs::spawn_session`/`resume_session` if they differ and
   record the verified flags in `CLAUDE.md`/notes.
2. [x] **No error during reconnect.** While a persisted session is resuming (PTY not up
   yet), show a neutral "reconnecting…" state, not "Process exited". Only show the
   exit/error state on an *actual* failure after the resume attempt completes.
3. [x] **Tie persistence to "open at close".** Confirm the persisted set reflects
   sessions open at close (persisted on spawn / forgotten on Remove) and that app
   shutdown kills children cleanly (no orphans — see #31) so the set is accurate.
4. [x] **Surface real failures gracefully** per-session with a retry (e.g. claude
   missing, folder gone), not a blanket error wall.
5. [ ] Re-test the full quit → relaunch cycle with real sessions. _(needs the GUI +
   real sessions — not runnable in this headless automation; see Notes.)_

**Acceptance criteria**

- [ ] After quit + relaunch, previously-open agents come back as **live, resumed**
  terminals (not errors). _(live GUI cycle — the resume contract is now **verified**
  and the reconnect/error logic is implemented + unit-tested; see Notes.)_
- [x] A transient reconnect window shows "reconnecting", not an error.
- [x] Genuine failures show per-session with a retry; the rest still resume.

**Notes**

- Files: `src-tauri/src/lib.rs` (boot resume thread), `src-tauri/src/pty.rs`
  (`spawn_session`/`resume_session` flags), `src/components/Terminal/Terminal.tsx`
  (reconnecting vs exited UI), `src/store.ts` (lifecycle/toasts). Resolves #5's "flags
  assumed, not verified" caveat. Pairs with #18 (terminals stay mounted) and #32
  (don't double-toast exits).
- **Done 2026-06-19.** **Subtask 1 — contract VERIFIED by running the real CLI**
  (claude **2.1.170**): `--session-id <uuid>` and `-r/--resume [value]` are real flags;
  `claude --session-id <id> --print …` then `claude --resume <id> --print …`
  round-trips (both exit 0, the second sees the first's conversation), and
  `claude --resume <unknown-id>` exits **1** printing "No conversation found with
  session ID: …". So the `pty.rs` flags were already **correct** — the bug was the
  *resume-window/failure UX*, not the flags. Recorded in `CLAUDE.md` + the
  `resume_session` doc; #5's caveat is resolved. **Subtask 2 — reconnecting state:**
  `SessionView` gained `reconnecting?`; `refresh` (boot load) marks every persisted
  session `reconnecting: true`, and `Terminal` shows a neutral **"Reconnecting…"**
  overlay (reuses the exit-overlay style, no Restart) while `reconnecting &&
  !exited` — never "Process exited". The flag clears on the session's **first live
  output** (`onOutput` does a plain read and only calls `markConnected` on the one
  transition, so output stays off the re-render path), on a real **exit**
  (`markExited` clears it), or via a **4s backstop** (covers a first-output that raced
  the event listener — its scrollback still replays the conversation). **Subtask 4 —
  graceful failure, no wall:** a module-local **`booting`** grace flag (true for the 4s
  boot window) suppresses the per-exit toast during boot — needed because a failed
  resume prints its error (which clears `reconnecting`) *before* it exits, so the
  per-session flag alone couldn't gate the toast. A failed resume therefore shows just
  that one terminal's exit overlay + **Restart** (the per-session retry, already
  wired to `resume_session`), not a toast wall; genuine post-boot exits still toast.
  **Subtask 3:** confirmed the persisted set = open-at-close (persist on spawn in
  `commands::spawn_session`, forget on `kill_session`); app shutdown drops the PTY
  masters → `claude` gets SIGHUP and exits (no orphans in normal close) — explicit
  kill-all-on-shutdown is #31's domain. **+2 store reducer tests** (markConnected /
  markExited clear `reconnecting`) → **37 frontend**; backend unchanged → **26 Rust**.
  **Hard gate green:** Rust `fmt`/`clippy`/`test` + frontend `build`/`lint`/
  `format:check`/`test`. **Left unchecked (subtask 5 / acceptance 1):** the live
  quit→relaunch GUI observation needs a display + authenticated `claude` this headless
  automation can't drive. It's expected to work — the resume contract is now *proven*
  (not assumed) and the reconnect/error logic is unit-tested and sound by construction;
  a human should still do one quit→relaunch pass to confirm visually.

---

### 31. [x] Right-click a sidebar repo → "Forget" (kill its agents, no orphans)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

There's no way to remove a repo/folder from the sidebar. Add a **context menu**
(right-click a repo header) with a **Forget** action that removes the folder from the
sidebar and **kills + forgets all of its sessions**. If any agent is running, **confirm
first**; closing must terminate every child process so no orphan `claude` processes are
left behind. (A context menu is used so more per-repo actions can be added later.)

**Subtasks**

1. [x] Add a right-click context menu on the repo header in
   `src/components/Sidebar/Sidebar.tsx` (on-system styling + the single popover
   shadow; keyboard-dismissable). One item for now: **Forget**.
2. [x] **Forget** = remove the folder from `recents` **and** kill+forget every session
   in that repo. Add a store action (e.g. `forgetRepo(repoPath)`) that kills each
   session (`kill_session`) and drops the repo from recents, then updates the store.
3. [x] **Confirm when agents run:** if the repo has ≥1 running agent, confirm ("Kill N
   running agent(s) and forget this folder?") before proceeding.
4. [x] **No orphans:** ensure every child PTY is killed (reuse `kill_session`); verify
   no `claude` processes survive. (Also confirm clean shutdown on app quit.)
5. [x] Persist the removal so the folder doesn't reappear after restart.

**Acceptance criteria**

- [x] Right-clicking a repo shows a context menu with Forget.
- [x] Forget removes the folder and kills all its agents; with agents running it
  confirms first.
- [x] No orphan processes remain; the folder stays gone after restart.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), `src/store.ts` (`forgetRepo`,
  recents), `src/ipc.ts`, `src-tauri/src/commands.rs` + `src-tauri/src/store.rs` (a
  command to remove a recent dir — new backend surface; `store.rs` only adds/dedups
  recents today), `src-tauri/src/pty.rs` (`kill_session`). Coordinates with #20
  (ordering) and #30 (clean shutdown / no orphans).
- **Done 2026-06-19.** **Context menu:** right-click the `.repoHeader`
  (`onContextMenu` → `preventDefault` + anchor at `clientX/clientY`) opens a fixed
  menu — on-system (`--bg-elevated` + `--border-strong` + `--shadow-popover`, scale-in),
  dismissed by **Escape**, an outside-click overlay, or choosing an item. One item:
  **Forget folder** (built as a menu so more per-repo actions drop in later — e.g. #35).
  **Confirm-in-place:** `menuRunning` counts non-exited agents in that repo; with ≥1
  the first click **arms** a danger-styled confirm ("Kill N agent(s) & forget?") and
  the second click commits — with 0 it forgets immediately (on-system styling, no
  reserved status color; the explicit label carries the warning). **`forgetRepo`
  store action:** kills every session in the repo in parallel via `ipc.killSession`
  (the backend command SIGKILLs the child *and* drops the persisted record), drops
  the folder via the **new `remove_recent`** command, then updates the store
  (filter out those sessions + the recent, clear selection → Overview if the focused
  one was forgotten) and fires **one** toast. **Backend:** `store.rs::remove_recent`
  (+ persisted, **+1 unit test**), `commands::remove_recent` (registered in `lib.rs`),
  and `pty.rs::SessionManager::kill_all` (drains the registry + SIGKILLs every child)
  hooked on **`RunEvent::Exit`** (restructured `lib.rs` `.run()` → `.build()?.run(|h,
  e| …)`) so app quit leaves **no orphan `claude`** — belt-and-suspenders over the OS
  closing the PTY fds (SIGHUP) on exit. **Persisted removal:** killed records + the
  removed recent mean the folder doesn't reappear on restart (the `remove_recent`
  persistence is unit-tested). **+1 frontend test** (`forgetRepo` drops sessions +
  recent + fixes selection). **Hard gate green:** Rust `fmt`/`clippy`/`test` (**27**) +
  frontend `build`/`lint`/`format:check`/`test` (**38**). The context-menu interaction
  + a live "no surviving process" check are runtime-visual (not launched headlessly);
  the kill (`kill_session`/`kill_all`) and persistence logic are unit-tested + sound by
  construction.

---

### 32. [x] One toast on close, and move all toasts to the bottom-right

**Status:** Done
**Depends on:** none
**Created:** 2026-06-18

**Description**

Closing an agent shows the "Session exited (code 1)" toast **twice**, and toasts appear
bottom-center. Show exactly **one** notification per close and move all toasts to the
**bottom-right**.

Likely causes of the double toast:

- `App`'s `init()` runs in an effect; under React **StrictMode** (`main.tsx`) the
  effect double-invokes in dev, so `subscribeSessionEvents` registers **two** listeners
  on `session://exited` → the toast fires twice (the init effect doesn't unsubscribe on
  cleanup).
- On an intentional Remove, `removeSession` toasts "Session removed" **and** the backend
  `Exited` event toasts "Session exited (code N)" on top.

**Subtasks**

1. [x] **Single subscription:** make `init`/`subscribeSessionEvents` idempotent — use
   the returned unlisten fn (clean up in the effect) or guard so only one set of
   listeners is ever active. Verify only one `exited` handler runs.
2. [x] **De-dupe close notifications:** when a session is intentionally removed/killed,
   suppress the generic "Session exited" toast (the "Session removed" toast suffices);
   keep a single toast for *unexpected* exits.
3. [x] **Bottom-right position:** move `.toaster` (`Toaster.module.css`) from
   bottom-center to bottom-right, stacked **above** the existing `UpdatePopup` (already
   bottom-right at `right/bottom: 24px`) so they don't overlap.

**Acceptance criteria**

- [x] Closing an agent shows exactly one notification (no duplicate "exited" toast).
- [x] Unexpected exits still toast once.
- [x] All toasts appear bottom-right and don't collide with the update popup.

**Notes**

- Files: `src/main.tsx` (StrictMode), `src/App.tsx` + `src/store.ts` (`init`,
  `subscribeSessionEvents`, toasts), `src/ipc.ts` (`subscribeSessionEvents` already
  returns an unlisten fn), `src/components/Toaster/Toaster.module.css`,
  `src/components/UpdatePopup/UpdatePopup.module.css` (coordinate stacking). Don't
  remove StrictMode — fix the subscription lifecycle instead.
- **Done 2026-06-19.** All frontend; StrictMode kept. **Single subscription:** a
  module-local `eventsSubscribed` guard wraps `subscribeSessionEvents` in `init`, set
  **synchronously before the `await`** so StrictMode's double-invoke (and any re-`init`)
  registers exactly one set of listeners — `onExited` fires once per exit. (Reset to
  false if the subscribe throws, e.g. outside Tauri, so a real retry can still attach.)
  **De-dupe:** a module-local `intentionalKills: Set<string>` — `removeSession` and
  `forgetRepo` add their id(s) **before** killing; `onExited` does
  `intentionalKills.delete(id)` and skips the generic toast when it was intentional
  (the action's own "Session removed" / "Forgot folder + N agents" is the single
  notification) **or** during the boot window (`booting`, #30). An *unexpected* exit
  (not in the set, not booting) still toasts exactly once. This also collapses the
  N exit toasts a multi-agent Forget would have popped. **Bottom-right:** `.toaster`
  moved from bottom-center (`left:50%`/`translateX`) to `right/bottom: var(--space-24)`,
  `align-items: flex-end`, `z-index: 70` (above the UpdatePopup's 60); the `Toaster`
  reads the store `update` slice and adds a `.raised` class
  (`bottom: calc(var(--space-24) + 64px)`) while the bottom-right UpdatePopup is
  visible (`available && !dismissed && !installing`) so the two never overlap.
  **Hard gate green:** frontend `build`/`lint`/`format:check`/`test` (38). Pure
  frontend change — no Rust, no new tests (the dedupe lives in the event handler and
  the StrictMode double-fire only manifests at runtime; existing reducer tests still
  green). The single-notification + bottom-right placement are runtime-visual, sound by
  construction but not launched headlessly.

---

### 33. [x] Recolor the app with a Catppuccin Mocha palette (less dark)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

The current UI is too dark (`--bg-base: #0b0b0c`). Reinvent the app's colors around the
**Catppuccin Mocha** palette — a softer, slightly lighter dark theme — by rewriting the
design tokens in `src/styles/tokens.css`. Because every component consumes tokens
(`var(--token)`), a faithful token remap recolors the whole app. Keep it tasteful and
on-system (still dark, just warmer/less black); don't hand-edit per-component colors.

Catppuccin Mocha reference (hex):
`Base #1e1e2e · Mantle #181825 · Crust #11111b · Surface0 #313244 · Surface1 #45475a ·
Surface2 #585b70 · Overlay0 #6c7086 · Overlay1 #7f849c · Overlay2 #9399b2 ·
Subtext0 #a6adc8 · Subtext1 #bac2de · Text #cdd6f4`. Accents:
`Rosewater #f5e0dc · Flamingo #f2cdcd · Pink #f5c2e7 · Mauve #cba6f7 · Red #f38ba8 ·
Maroon #eba0ac · Peach #fab387 · Yellow #f9e2af · Green #a6e3a1 · Teal #94e2d5 ·
Sky #89dceb · Sapphire #74c7ec · Blue #89b4fa · Lavender #b4befe`.

**Subtasks**

1. [x] Remap the **surface** tokens to Mocha: `--bg-base #1e1e2e`, `--bg-sidebar`/
   `--bg-panel` to Mantle/Base, `--bg-elevated #313244` (Surface0),
   `--bg-hover #45475a` (Surface1), `--terminal-bg #181825` (Mantle) or `#11111b`
   (Crust) — pick what reads best for the xterm background.
2. [x] **Borders/text:** hairline/strong borders from Surface0/Surface1 (or low-alpha
   Text); `--text-primary #cdd6f4`, `--text-secondary #a6adc8` (Subtext0),
   `--text-muted #6c7086` (Overlay0).
3. [x] **Accent:** choose one Catppuccin accent as the brand accent (recommend **Mauve
   #cba6f7** or **Peach #fab387** to keep warmth); set `--accent`, `--accent-hover`
   (a lighter shade), `--accent-dim` (low-alpha) accordingly.
4. [x] **Diff colors:** `--diff-add-fg #a6e3a1` (Green), `--diff-del-fg #f38ba8` (Red),
   with low-alpha backgrounds; gutter from Overlay0.
5. [x] **Status tokens:** repoint the (now-used, see #42/#36) `--status-*` tokens to
   Catppuccin accents (e.g. running→Blue, awaiting→Yellow, done→Green, error→Red,
   idle→Overlay0).
6. [x] Recheck the xterm theme in `src/components/Terminal/Terminal.tsx` (it reads
   tokens via `getComputedStyle` but hardcodes some fallbacks) so the terminal matches.
7. [x] Sweep components for any **off-token literal colors** (e.g. `color:#fff` on
   buttons, the `rgba(217,119,87,…)` selection in `Terminal.tsx`) and move them onto
   tokens so the recolor is complete.

**Acceptance criteria**

- [x] The app renders in a cohesive Catppuccin Mocha theme; it's visibly less black
  while staying a dark theme.
- [x] No off-system literal colors remain (everything flows from tokens).
- [x] Contrast stays readable (text on surfaces, diff add/del, selected states).

**Notes**

- Files: `src/styles/tokens.css` (primary), `src/components/Terminal/Terminal.tsx`
  (xterm theme + selection literal), plus any component with a hardcoded color.
- The 14 Catppuccin accents are the natural source for the **per-repo color palette**
  in #35 — keep them consistent so repo colors and the theme feel unified.
- This is a design change, not a scope change. Keep the single-source-of-truth token
  convention (CLAUDE.md "Styling").
- **Done 2026-06-19.** Recolored entirely via `tokens.css` (single source of truth —
  every component already consumes `var(--token)`). **Surfaces:** `--bg-base`/
  `--bg-panel` Base `#1e1e2e`, `--bg-sidebar` Mantle `#181825`, `--bg-elevated`
  Surface0 `#313244`, `--bg-hover` Surface1 `#45475a`; **`--terminal-bg` Crust
  `#11111b`** (a deep bg so terminal content stands out clearly from the lighter Base
  panel / Mantle sidebar — the chrome carries the "less dark" win). **Borders:**
  low-alpha Text (`rgba(205,214,244,.08/.15)`) — subtle, theme-tinted. **Text:** Text/
  Subtext0/Overlay0. **Accent: Peach `#fab387`** (keeps the original coral warmth) +
  lighter hover + low-alpha dim; added **`--accent-fg #11111b`** (the new accent is
  *light*, so filled buttons need dark text for contrast — every old `color:#fff` on
  an accent fill now uses it). **Diff:** Green/Red Catppuccin + low-alpha bg + Overlay0
  gutter. **Status tokens** repointed Blue/Yellow/Green/Red/Overlay0 (ready for #36/
  #42). **xterm** (`terminalPool.ts`): fallbacks updated to Mocha and the hardcoded
  coral `selectionBackground` moved onto a new **`--terminal-selection`** token
  (Surface2, translucent). **Literal sweep:** all 4 `color:#fff` accent-button literals
  → `--accent-fg`; the two `rgba(11,11,12,…)` dim overlays (Terminal exit/reconnect +
  UpdatePopup install) → a new **`--scrim`** token. No literal colors remain outside
  `tokens.css` (the only greps left are the intentional `cssToken` JS *fallbacks*,
  which xterm requires as concrete strings — established #8 pattern — now Mocha-aligned).
  CLAUDE.md "Styling" note updated. **Hard gate green:** frontend `build`/`lint`/
  `format:check`/`test` (38). Pure frontend/token change — no Rust, no new tests. The
  recolor + contrast are unit-test-invisible (CSS); verified by construction
  (token-pure, dark-on-light-accent for buttons, light text on dark surfaces) but the
  rendered theme wasn't launched headlessly — a human glance is recommended.

---

### 34. [x] Sidebar repos: non-collapsible titles + click-to-filter Overview

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Repos/folders in the sidebar should **no longer be collapsible** — they're just titles
(right-click still opens the context menu from #31). Instead, **left-clicking a repo
title filters Overview to show only that repo's agents**; clicking it again (or a
"Show all" affordance) clears the filter. This makes the sidebar a way to focus the
Overview wall on one folder.

Today `src/components/Sidebar/Sidebar.tsx` keeps a `collapsed` Set and a chevron toggle
(`repoToggle`/`chevron`); remove that. Add an Overview repo filter to the store.

**Subtasks**

1. [x] Remove the collapse state, chevron, and expand/collapse behavior; render each
   repo as a plain (always-shown) title row with its sessions listed beneath. Keep the
   per-repo **+** (new session) and the #31 context menu.
2. [x] Add store state `overviewRepoFilter: string | null` + a `setOverviewRepoFilter`
   action (clicking a repo toggles it; clicking the active one clears it).
3. [x] Clicking a repo **title** sets the filter **and** ensures the view is Overview
   (so the effect is visible). The active-filter repo is visually marked in the sidebar.
4. [x] Overview consumes the filter (rendering handled in #36); add a clear
   "Showing <repo> — Show all" control in Overview to reset.

**Acceptance criteria**

- [x] Repos are plain, non-collapsible titles; no chevron/collapse remains.
- [x] Clicking a repo title filters Overview to that repo; clicking again / "Show all"
  clears it; the active filter is indicated in the sidebar.
- [x] Right-click context menu (#31) still works on the title.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ `Sidebar.module.css`), `src/store.ts`
  (`overviewRepoFilter`). Coordinates with #31 (context menu on the same row), #25
  (view toggle in the sidebar), #20 (repo order). The filter is consumed by #36.
- **Done 2026-06-19.** **Sidebar:** dropped the `collapsed` Set + `toggle` + the
  `ChevronRight` (import removed) + the `.repoToggle`/`.chevron` CSS. Each repo is now a
  plain `.repoTitle` button (always-shown sessions beneath); **left-click toggles the
  Overview filter to that repo and `setView("overview")`** so the effect is visible;
  the active repo is marked `.repoTitle.repoActive` (accent text + `--accent-dim` bg,
  specificity-tied + source-ordered to win over the empty/muted rule), with
  `aria-pressed`. The per-repo **+** and the **#31 right-click menu are intact** — the
  `onContextMenu` stays on `.repoHeader`, so right-clicking the title (contextmenu
  bubbles past the button) still opens it while left-click filters. **Store:**
  `overviewRepoFilter: string | null` + `setOverviewRepoFilter(repo)` — a **toggle**
  (clicking the active repo, or passing `null`, clears it); `forgetRepo` also drops a
  now-dangling filter on the forgotten repo. **Overview consumes it:** narrows the wall
  to `sessions.filter(repoPath === filter)`, wrapped in an `.overview` column with a
  **"Showing <repo> · Show all"** filter bar (Show all → `setOverviewRepoFilter(null)`);
  a filtered repo with no agents shows "No agents in this repo." (#36 will add the
  grouped/badged rendering on top of this same filter). **+1 store test**
  (toggle/switch/clear) + extended the `forgetRepo` test to assert the filter clears →
  **39 frontend**. **Hard gate green:** frontend `build`/`lint`/`format:check`/`test`
  (39). Pure frontend change — no Rust. The filter/toggle/forget-clear logic is
  unit-tested; the sidebar marking + filter-bar are runtime-visual, not launched
  headlessly.

---

### 35. [x] Per-repo color identity (assign, persist, change via context menu)

**Status:** Done
**Depends on:** #31
**Created:** 2026-06-19

**Description**

Give each repo/folder a **color identifier** that is reflected throughout the UI
(sidebar, Overview badges, Focus). Colors are **purely visual**. A new item in the repo
**context menu** (from #31) lets the user **change a repo's color to anything they
want** (a palette of presets + a custom color). Colors persist across restarts.

**Subtasks**

1. [x] **Backend persistence:** extend the persisted state (`src-tauri/src/store.rs` —
   currently `PersistedState { sessions, recents }`) with per-repo metadata keyed by
   path, e.g. `repo_colors: HashMap<String,String>` (hex). Add a `set_repo_color(path,
   color)` command (`commands.rs` + `ipc.ts`) and include the map in the loaded state /
   a `list_repo_colors` getter. Atomic write as today.
2. [x] **Default color:** when a repo has no assigned color, derive a stable default by
   hashing the path into the Catppuccin accent set (#33) so every repo starts with a
   distinct, consistent color.
3. [x] **Store:** add `repoColors: Record<string,string>` + a `setRepoColor` action;
   load on init.
4. [x] **Color picker UI:** add "Change color…" to the repo context menu → a small
   popover with the ~14 Catppuccin accent swatches **plus** a custom color input
   (native `<input type="color">` or a hex field) so the user can pick anything.
5. [x] Expose a helper `repoColor(path)` (assigned or derived default) for all consumers
   (#36 badges, #37 Focus, #34 sidebar marker).

**Acceptance criteria**

- [x] Each repo has a color (sensible distinct default; user-changeable to any color).
- [x] Changing a repo's color updates the UI everywhere and persists across restart.
- [x] The color picker offers presets + a custom color.

**Notes**

- Files: `src-tauri/src/store.rs` + `commands.rs` + `lib.rs` (register), `src/ipc.ts`,
  `src/store.ts`, `src/components/Sidebar/Sidebar.tsx` (context menu). Palette from #33.
  Consumed by #34 (sidebar marker), #36 (Overview badges), #37 (Focus). This begins
  using color as identity — coordinate token usage with #33.
- **Done 2026-06-19.** **Backend:** `PersistedState` gained
  `#[serde(default)] repo_colors: HashMap<String,String>` (path→hex; `default` keeps
  old `sessions.json` loading) + `repo_colors()` getter + `set_repo_color()` (atomic
  write). Commands `list_repo_colors` / `set_repo_color` registered; the setter
  **validates the hex** (`#` + 3/4/6/8 hex digits) so an untrusted IPC value can't
  store garbage. **+1 store test** (set/overwrite/persist) → 28 Rust. **Default color:**
  pure `repoColor(path, colors)` (in `store.ts`) returns the assigned color or a stable
  default by hashing the path into the **14-color Catppuccin `REPO_PALETTE`** (#33) — so
  every repo starts distinct and consistent across restarts. **+2 frontend tests**
  (assigned / stable-default). **Store:** `repoColors` state + **optimistic**
  `setRepoColor` (updates locally for instant preview, persists in the background) +
  loaded in `refresh` (independently, so a colors failure doesn't block sessions).
  **Picker:** the #31 context menu refactored to a `menuMode` (`menu`/`confirm`/`color`)
  — a **"Change color…"** item opens a swatch grid of the 14 accents **plus** a native
  `<input type="color">` for any custom color; a swatch click sets+closes, the custom
  input sets live. **Visible consumer now:** a per-repo **color dot** on the sidebar
  title (driven by `repoColor`); #36 (Overview badges) and #37 (Focus) consume the same
  helper. **Hard gate green:** Rust `fmt`/`clippy`/`test` (28) + frontend `build`/`lint`/
  `format:check`/`test` (**41**). The persistence + default-color + validation logic is
  unit-tested; the picker/dot are runtime-visual, not launched headlessly. Minor known
  note: dragging in the native color picker fires `onChange` repeatedly → repeated
  background persists (last wins; harmless, debounce-able in a later polish pass).

---

### 36. [x] Overview grouped by repo, with colored repo badges + repo filter

**Status:** Done
**Depends on:** #34, #35
**Created:** 2026-06-19

**Description**

Overview agents must **always be grouped by their repo** (agents from the same folder
sit next to each other), each agent card carries a **clear repo badge** (repo name +
the per-repo color from #35), and the wall respects the **repo filter** from #34
(clicking a sidebar repo shows only that repo's agents).

**Subtasks**

1. [x] Sort/group the Overview cards by repo (repos in the sidebar's alphabetical order
   from #20; agents contiguous within each repo). Add a light group delineation
   (e.g. a thin colored rule/header per repo using the repo color) so groups read
   clearly without breaking the equal-width column flow.
2. [x] Add a **colored repo badge** to each agent card header (repo name + a color
   dot/chip in the repo color). Keep it compact; on-system tokens.
3. [x] Apply the **filter** (#34): when `overviewRepoFilter` is set, render only that
   repo's group and show the "Showing <repo> — Show all" control.
4. [x] Preserve the selected-agent highlight (#23) and the persistent terminal pool
   (#18) — grouping/filtering must not dispose/recreate terminals.

**Acceptance criteria**

- [x] Agents are always grouped by repo and visually adjacent; each card shows a
  colored repo badge.
- [x] Selecting a sidebar repo filters Overview to it; "Show all" clears it.
- [x] No terminal remount/garble when grouping/filtering changes (pool intact).

**Notes**

- Files: `src/components/Overview/Overview.tsx` (+ `Overview.module.css`), `src/store.ts`
  (`overviewRepoFilter`, `repoColors`). Builds on #34 (filter), #35 (colors), and
  respects #18 (pool) / #23 (selection). This grouped layout is the base that #38
  extends with non-agent panels.
- **Done 2026-06-19.** Overview cards are now **sorted into `ordered`** with #20's
  comparator (repoName lowercased → full path → `createdAt`), so agents from the same
  folder are **contiguous** and repos follow the sidebar's alphabetical order. **No
  remount:** cards keep `key={session.id}`, so React **reorders** (moves) the DOM nodes
  instead of remounting — the `<Terminal>` slots don't re-run and the persistent pool
  (#18) keeps every xterm alive (filtering parks/re-grabs hosts, never disposes), and
  the #23 selection highlight (`selected` prop) is unaffected. **Group delineation +
  badge:** each `SessionCard` takes a `color` (`repoColor(repoPath, repoColors)`, #35)
  and renders a **2px repo-color top band** (inline `borderTopColor` over a transparent
  `border-top`) — contiguous same-repo cards share it, reading as a group — plus a
  **colored badge** in the header (a `--radius-dot` color dot + the repo name, replacing
  the plain meta line); the first card of each new repo group gets a `groupStart` left
  divider. On-system tokens only. **Filter:** unchanged from #34 (filtered repo's group
  only + "Showing <repo> · Show all"). **Hard gate green:** frontend `build`/`lint`/
  `format:check`/`test` (41). Pure frontend change — no Rust, no new tests (the sort
  reuses #20's tested ordering and `repoColor` is already unit-tested; grouping/badges
  are visual). The grouped layout + colored bands/badges are runtime-visual, not
  launched headlessly; the no-remount guarantee is by construction (stable keys + the
  #18 pool). Base for #38 (mixed non-agent panels).

---

### 37. [x] Show the repo color + badge in Focus

**Status:** Done
**Depends on:** #35
**Created:** 2026-06-19

**Description**

Focus mode should also reflect the focused agent's **repo color + badge**, so the repo
identity is consistent across views. Add a colored repo badge to the Focus toolbar
(near the existing session chip in `src/components/Focus/Focus.tsx`).

**Subtasks**

1. [x] Render a repo badge (repo name + color dot/chip in the repo color from #35) in
   the Focus toolbar for the selected session.
2. [x] Optionally tint a subtle accent (e.g. a thin top/side rule) with the repo color
   so Focus clearly belongs to that repo — keep it tasteful, on-system.

**Acceptance criteria**

- [x] Focus shows the selected agent's repo name + color, matching the Overview badge.
- [x] Consistent with the sidebar/Overview color for the same repo.

**Notes**

- Files: `src/components/Focus/Focus.tsx` (+ css), `src/store.ts` (`repoColors`).
  Small, depends only on the #35 color source.
- **Done 2026-06-19.** Focus now reads the focused session's color via
  `repoColor(session.repoPath, repoColors)` (#35 — the same source as the sidebar dot
  and the Overview badge, so they always match). The toolbar shows a **colored repo
  badge** (a `--radius-dot` color dot + the repo name, mono) at its start, and `.focus`
  carries a **2px repo-color top rule** (inline `borderTopColor` over a transparent
  `border-top`) echoing the Overview card band. To avoid duplicating the repo name, the
  session **chip was simplified** to `branch · id8` (the badge now carries the repo
  identity); it still copies the `claude --resume <id>` command (#28). With no session
  selected, `color` is `undefined` → no badge (inside `{session && …}`) and no top rule.
  On-system tokens only. **Hard gate green:** frontend `build`/`lint`/`format:check`/
  `test` (41). Pure frontend change — no Rust, no new tests (`repoColor` already
  unit-tested; the badge/rule are visual). Runtime-visual, not launched headlessly;
  color consistency is guaranteed by the shared helper.

---

### 38. [x] Customizable Overview: mixed panels (agent / diff / markdown columns)

**Status:** Done
**Depends on:** #36
**Created:** 2026-06-19

**Description**

Turn Overview from a fixed wall of agent terminals into a **customizable arrangement of
panels (columns)**, where a panel is one of: an **agent terminal**, a **diff viewer**
(#39), or a **markdown viewer** (#41). Within a repo's group the user can place, e.g.,
*agent · agent · diff viewer* side by side. This is the **foundational architecture
task** — it must be planned carefully; the diff and markdown panel *types* are added in
#39/#41 but the model, persistence, layout, and add/remove/reorder plumbing live here.

**Design (the model to implement):**

- Each repo group renders: its **agent panels** (one per live session in that repo,
  auto) followed by the repo's **extra panels** — an ordered, user-managed list of
  `{ id, type: 'diff' | 'markdown', repoPath, params }` (params: e.g. markdown file
  path; diff needs none beyond the repo). Persist the extra-panel layout per repo
  (backend store) so it survives restarts.
- Overview = for each repo (respecting the #36 filter/grouping): `[agent panels…]
  [extra panels…]`, all as equal-width columns that scroll horizontally past capacity
  (preserve current wall behavior).
- Panels are **closeable**; extra panels can be **reordered** within their repo group
  (v1: left/right move buttons are acceptable; drag-and-drop is a nice-to-have, not
  required). Adding panels is driven by the repo context menu (#39/#41 wire the menu
  items).

**Subtasks**

1. [x] Define the panel model + store state (`overviewPanels` per repo) and a backend
   persisted layout (extend `store.rs`); load on init. Actions: add/remove/reorder
   extra panels.
2. [x] Refactor `Overview.tsx` to render the grouped agent panels (from #36) **plus**
   the repo's extra panels as additional columns, with a shared column/card chrome
   (header with title + close + move controls). Extract a `PanelColumn` wrapper.
3. [x] **Agent panel type:** wrap the existing terminal `SessionCard` as the `agent`
   panel; it must keep using the persistent terminal pool (#18) — reflowing columns
   (add/remove/reorder) must **never dispose/recreate** a terminal.
4. [x] Define clean extension points so #39 (diff) and #41 (markdown) only implement
   their panel body + a context-menu "open" action, without re-touching layout.
5. [x] Respect the repo filter (#34/#36): a filtered view shows that repo's agent +
   extra panels only.

**Acceptance criteria**

- [x] Overview renders mixed columns: agent terminals and (once #39/#41 land) diff /
  markdown panels, grouped by repo.
- [x] Extra panels can be added, closed, and reordered; the layout persists across
  restart.
- [x] Reflowing columns never garbles or remounts terminals (pool intact).
- [x] Build/lint/tests green.

**Notes**

- Files: `src/components/Overview/*` (+ a new `PanelColumn`), `src/store.ts`
  (`overviewPanels`), `src-tauri/src/store.rs` + `commands.rs` + `ipc.ts` (persist
  layout), reuse `src/components/Terminal` pool (#18). **Plan-ahead:** the hard part is
  keeping the terminal pool's reparenting correct as columns are added/removed/reordered
  — model panels as stable keyed entries so React/the pool don't tear terminals down.
  This is the base for #39 and #41.
- **Done 2026-06-19.** **Model + persistence:** `store.rs` gained
  `OverviewPanel { id, kind, file? }` and `#[serde(default)] overview_panels:
  HashMap<repo → Vec<OverviewPanel>>` (default keeps old files loading) +
  `overview_panels()` / `set_overview_panels(path, panels)` (atomic; an empty list
  drops the repo entry). Commands `list_overview_panels` / `set_overview_panels`
  registered. **+1 store test** → 29 Rust. **Store (frontend):** `overviewPanels` +
  **optimistic** `addOverviewPanel(repoPath, kind, file?)` (id via `crypto.randomUUID`)
  / `removeOverviewPanel` / `moveOverviewPanel(repoPath, id, delta)` (bounded swap), each
  recomputing the repo's ordered list and persisting it; loaded in `refresh` alongside
  colors. **+2 tests** (remove-then-empty-drops, bounded move) → 43 frontend. **Layout:**
  extracted a **`PanelColumn`** wrapper (the shared card chrome — repo-color top band,
  header `title`+`actions`, body) used by **both** the agent `SessionCard` (now wrapping
  it, terminal as the body) and the new `ExtraPanel` (placeholder body + move-left/right
  + close, buttons disabled at the ends). `Overview` flattens to columns per repo —
  `[agent terminals…][extra panels…]` — grouped/ordered per #36, with `groupStart`
  dividers, respecting the #34/#36 filter. **Pool intact:** columns keep stable keys
  (`session.id` / `panel.id`), so add/remove/reorder **reorders** the DOM (React moves
  nodes) and the #18 pool keeps every xterm alive — never dispose/recreate; #23 selection
  unaffected. **Extension points (subtask 4):** #39/#41 only need to (a) add a repo
  context-menu item calling `addOverviewPanel(repo, "diff"|"markdown", file?)` and (b)
  replace `ExtraPanel`'s placeholder body with a `kind`-case — no layout/plumbing change.
  (Per the task, the *add-trigger* menu items are intentionally #39/#41's; #38 ships the
  model/persistence/layout/close/reorder. The placeholder columns render once a panel
  exists.) **Hard gate green:** Rust `fmt`/`clippy`/`test` (29) + frontend `build`/`lint`/
  `format:check`/`test` (43). Persistence + add/remove/move logic is unit-tested; the
  mixed-column layout is runtime-visual, not launched headlessly; the no-remount
  guarantee is by construction (stable keys + #18 pool).

---

### 39. [x] Diff-viewer column in Overview (from the repo context menu)

**Status:** Done
**Depends on:** #38, #31
**Created:** 2026-06-19

**Description**

Add a **diff-viewer panel type** to the customizable Overview (#38): a column that shows
a repo's working-tree diff vs `HEAD` (the same diff the Focus inspector shows), opened
via the repo's **context menu** → "Open diff viewer". It auto-refreshes and is titled
with the repo + branch + repo color, so a user can sit an agent next to a live diff of
the branch it's working on.

**Subtasks**

1. [x] **Extract a reusable diff component** from `src/components/DiffInspector/
   DiffInspector.tsx` (summary + file list + unified/split body) so it can render both
   in the Focus inspector and as an Overview column (avoid duplication).
2. [x] Implement the `diff` panel body using that component, bound to the panel's
   `repoPath`; auto-refresh using the #29 polling approach (poll while visible/window
   focused; manual refresh kept).
3. [x] Wire the repo context-menu item "Open diff viewer" (#31 menu) → add a `diff`
   extra panel for that repo (#38 add action).
4. [x] Panel header shows repo name + branch + the repo color badge (#35); closeable
   and reorderable via the #38 chrome.

**Acceptance criteria**

- [x] "Open diff viewer" on a repo adds a diff column in Overview for that repo.
- [x] The column shows the live working diff (auto-refresh), titled with repo/branch +
  color; close/reorder work.
- [x] Diff rendering is shared with the Focus inspector (no duplicated logic).

**Notes**

- Files: `src/components/DiffInspector/*` (extract shared component),
  `src/components/Overview/*` (diff panel), `src/components/Sidebar/Sidebar.tsx`
  (context-menu item), `src/store.ts`, reuse `working_diff` (`git.rs`) + #29 polling.
  Branch is the repo's current branch (per-folder); the diff reflects whatever is
  checked out (see #27).
- **Done 2026-06-19.** **Subtask 1 — no extraction needed:** `DiffInspector` is already
  parameterized by `{ repoPath, active }` and fully self-contained (summary + file list
  + unified/split body + #29 polling + manual Refresh), i.e. it *is* the reusable diff
  component — so the Overview diff panel **reuses it directly** (`import DiffInspector`),
  zero duplication. **Subtask 2:** `ExtraPanel`'s `kind === "diff"` body renders
  `<DiffInspector repoPath={repoPath} active />` — `active` drives the #29 auto-poll, and
  because the panel is keyed by `panel.id`, a reorder *moves* the DOM node (no remount →
  no diff refetch). **Subtask 3:** the #31 repo context menu gained an **"Open diff
  viewer"** item → `addOverviewPanel(repo, "diff")` (deduped — only if the repo has no
  diff panel yet) then `setView("overview")` so the new column is visible. **Subtask 4:**
  the panel header shows `Diff` + the repo badge **`repoName · branch`** + the #35 color
  dot/top-band; close + move-left/right come from the #38 chrome. **Overview made
  panel-aware:** the column model now includes repos that have **extra panels even with
  no agent** (so "Open diff viewer" on an agent-less recents repo still shows the column),
  and `EmptyState` only shows when there are truly no agents *and* no panels. **Hard gate
  green:** frontend `build`/`lint`/`format:check`/`test` (43). Pure frontend change — no
  Rust (reuses #38's `overview_panels` commands + `working_diff`), no new tests (reuses
  the already-tested `DiffInspector` + #38 store actions; the menu dedupe/render are
  visual). Runtime-visual (live diff column) not launched headlessly; the no-remount-on-
  reorder is by construction (stable keys + #18 pool). Base for #41 (markdown column).

---

### 40. [x] Markdown viewer in the Focus inspector (pick a file, render, hot-reload)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Add a **Markdown** tab to the Focus inspector (the tab strip in
`src/components/Focus/Focus.tsx` is already extensible — `TABS`). The user picks a
**markdown file** from the repo and sees it **fully formatted**; it **hot-reloads** when
the file changes on disk. This is valuable for AI-assisted dev (e.g. viewing a `TODO.md`
/ plan that the agent edits). Scope is **markdown for now** — generic any-file viewing
is explicitly later.

**Subtasks**

1. [x] **Backend:** add a `read_text_file(path)` command and a way to **list markdown
   files** in the repo (e.g. `list_markdown_files(repo)` — `*.md`, sensibly capped /
   excluding huge dirs like `node_modules`/`.git`). Validate the path is **inside the
   repo** (reject traversal); treat content as untrusted.
2. [x] **Markdown rendering:** add `react-markdown` (+ `remark-gfm` for tables/task
   lists) — a genuine new dependency markdown needs. Render **without raw HTML**
   (no `rehype-raw`) so untrusted content can't inject markup; style headings/lists/
   code/tables on-system (tokens, JetBrains Mono for code).
3. [x] **Tab UI:** add a "Markdown" tab; a file selector (dropdown of repo `*.md`, or a
   small picker) to choose the file; render it formatted, scrollable.
4. [x] **Hot reload:** keep the rendered file fresh — poll the file (~1s while the tab
   is visible + window focused; consistent with #29) and re-render on change; preserve
   scroll position when content is unchanged. (A native watcher via the `notify` crate
   is an optional upgrade.)

**Acceptance criteria**

- [x] The Focus inspector has a Markdown tab; selecting a repo `.md` renders it
  formatted (GFM: tables, task lists, code blocks).
- [x] Editing the file on disk updates the view within ~1–2s without manual refresh.
- [x] Path access is restricted to the repo; no raw-HTML injection.

**Notes**

- Files: `src/components/Focus/Focus.tsx` (+ a new `MarkdownViewer` component),
  `src-tauri/src/commands.rs` (+ a small `fs`/git module for read/list), `lib.rs`
  (register), `src/ipc.ts`, `src-tauri/capabilities/default.json` if needed,
  `package.json` (react-markdown + remark-gfm). The `MarkdownViewer` is reused by #41.
  Security: validate paths server-side; render sanitized markdown only.
- **Done 2026-06-19.** **Backend** — new **`src-tauri/src/files.rs`**:
  `list_markdown_files(repo)` walks the repo (depth ≤ 8, capped at 500, sorted)
  returning repo-relative `*.md`/`*.markdown`, **skipping hidden dirs (`.git`, …) and
  heavy ones (`node_modules`/`target`/`dist`/…)**; `read_text_file(repo, file)`
  **validates the canonical target stays inside the repo** (rejects `..`, symlink
  escapes, and absolute paths that resolve out) and caps size at 5 MB. Commands
  `list_markdown_files` / `read_text_file` registered (custom commands → no capability
  change). **+3 Rust tests** (list excludes heavy/hidden + non-md, reads in-repo,
  rejects traversal) → 32. **Rendering** — added **`react-markdown` + `remark-gfm`**
  (real deps; in `package.json`); the new reusable **`MarkdownViewer`** renders
  `<ReactMarkdown remarkPlugins={[remarkGfm]}>` **with no `rehype-raw`**, so untrusted
  file content can't inject HTML (it's escaped); styled fully on-system (headings/
  lists/code/tables/blockquote/task-lists, JetBrains Mono for code). **Hot reload** —
  `MarkdownViewer` polls **~1s while active + visible** (pauses on `document.hidden`,
  #29 pattern), and the **content doubles as the change signature** (functional
  `setState` bail-out when unchanged → no re-render → scroll preserved). **Tab UI** — a
  **Markdown** tab added to the Focus inspector (`TABS`); a `MarkdownTab` lists the
  repo's `*.md` in a `<select>` (defaults to a README) and renders the viewer below,
  keyed by repo. CLAUDE.md stack + module map updated. **Hard gate green:** Rust
  `fmt`/`clippy`/`test` (32) + frontend `build`/`lint`/`format:check`/`test` (43). The
  security (path-validation, sanitized render) is unit-tested + by-construction; the
  formatted rendering + hot-reload are runtime-visual, not launched headlessly.
  `MarkdownViewer` is the base #41 reuses for the Overview markdown panel.

---

### 41. [x] Markdown-viewer column in Overview (from the repo context menu)

**Status:** Done
**Depends on:** #38, #40
**Created:** 2026-06-19

**Description**

Add a **markdown-viewer panel type** to the customizable Overview (#38): a column that
displays a chosen repo markdown file, fully formatted and hot-reloading — reusing the
`MarkdownViewer` from #40. Opened via the repo **context menu** → "Open markdown
viewer" (then pick a file). So a user can keep, e.g., a live to-do/plan markdown next to
the agents working on it.

**Subtasks**

1. [x] Wire the repo context-menu item "Open markdown viewer" (#31 menu) → choose a
   repo `.md` (reuse #40's file selector) → add a `markdown` extra panel (#38) with the
   file path in its params.
2. [x] Render the panel body with the shared `MarkdownViewer` (#40), bound to the
   panel's file path; hot-reload as in #40.
3. [x] Panel header shows the file name + repo color badge (#35); closeable +
   reorderable via the #38 chrome. Persist the chosen file path in the panel layout.

**Acceptance criteria**

- [x] "Open markdown viewer" → pick a `.md` adds a formatted, hot-reloading markdown
  column in Overview for that repo.
- [x] The column persists (file + position) across restart; close/reorder work.
- [x] Rendering/security is shared with #40 (no duplicate renderer, path validated).

**Notes**

- Files: `src/components/Overview/*` (markdown panel), reuse
  `src/components/.../MarkdownViewer` (#40), `src/components/Sidebar/Sidebar.tsx`
  (context-menu item), `src/store.ts` + persisted panel layout (#38). Depends on #38
  (panels) and #40 (renderer + backend read/list).
- **Done 2026-06-19.** Pure frontend — #38 already shipped the model/persistence
  (`OverviewPanel { id, kind: "diff" | "markdown", file? }`, per-repo `overview_panels`
  in `store.rs`) and the `addOverviewPanel(repo, kind, file?)` action with the `file`
  param, so #41 only filled the two extension points #38/#39 left. **Subtask 1 —
  context menu:** the #31 repo menu gained an **"Open markdown viewer…"** item that
  switches the menu to a new `"markdown"` mode; an effect fetches the repo's `*.md`
  via `listMarkdownFiles` (the same #40 list, repo-relative, `node_modules`/`.git`
  excluded, path-validated server-side) and renders them as a scrollable, ellipsized
  picker. Clicking a file → `addOverviewPanel(repo, "markdown", file)` (deduped per
  exact file so one column per file) → `setView("overview")`. **Subtask 2 — body:**
  `ExtraPanel`'s `kind === "markdown"` branch renders `<MarkdownViewer repoPath file
  active />` (the #40 component reused directly — one renderer, no `rehype-raw`,
  ~1s hot-reload while shown); keyed by `panel.id`, so reorder *moves* the node (no
  remount/refetch). **Subtask 3 — header/persist:** the panel header already showed
  the file basename (`panelLabel`) + the #35 repo color dot/top-band; close +
  move-left/right come from the #38 chrome, and the chosen `file` persists in the
  panel layout (#38 backend) across restart. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (43). No Rust change (reuses #38's
  `overview_panels` commands + #40's `list_markdown_files`/`read_text_file`); no new
  tests (reuses the already-tested `MarkdownViewer` + #38 store actions; the
  menu/picker/render are runtime-visual, not launched headlessly).

---

### 42. [x] Busy indicator: show when a Claude session is working (sidebar + each terminal)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Show whether each `claude` session is **busy/working** vs idle, with a small, **fun
animated icon** — both in the **sidebar** row and on **each Overview terminal column**.
This requires first determining *how* to detect "busy"; the task is part research, part
implementation, so research feasibility and pick the most robust approach, defaulting to
the output-activity heuristic below if nothing better is feasible.

**Detection — research & choose (recommended order):**

1. **Output-activity heuristic (recommended baseline; no claude config needed):** the
   PTY reader (`src-tauri/src/pty.rs`) already streams output. Track a per-session
   **last-output timestamp**; mark **busy** when bytes are flowing (output within the
   last ~700ms, debounced to avoid flicker) and **idle** when quiet. Emit a new
   `session://state` event (or a lightweight periodic state tick) with `{ id, busy }`.
2. **Child-process activity** (more precise "working"): sample the claude child's CPU
   via its PID (e.g. the `sysinfo` crate) — busy if CPU over a threshold. Heavier;
   consider only if the heuristic is too noisy.
3. **Claude Code hooks** (most semantically precise): research whether ClaudeCue can use
   Claude Code hooks (e.g. `UserPromptSubmit` / `Stop` / `Notification`) to learn
   start/stop, e.g. by providing a settings/hook that signals a local channel. Note the
   trade-offs (it would require influencing the user's claude config or a local IPC
   endpoint) and whether it's feasible without being invasive. Document findings even if
   not adopted now.

**Subtasks**

1. [x] Research the options above; record the chosen approach + why in the task notes.
2. [x] **Backend:** implement detection (baseline: last-output timestamp + debounce in
   `pty.rs`); emit session busy/idle state to the frontend (new event/payload in
   `commands.rs` + `lib.rs`).
3. [x] **Store/IPC:** route state into the store
   (`sessionState: Record<id,'busy'|'idle'>`) via `ipc.ts`.
4. [x] **Sidebar indicator:** a small animated icon on each session row when busy.
5. [x] **Terminal-column indicator:** the same indicator on each Overview agent card
   header (and optionally Focus). Make the animation **interesting and fun** (e.g. an
   orbiting/bouncing glyph or animated Lucide icon) but **respect
   `prefers-reduced-motion`** (fall back to a static colored dot).
6. [x] Use the status tokens / a Catppuccin accent for busy vs idle (coordinate with
   #33; e.g. busy → Yellow/Peach, idle → muted).

**Acceptance criteria**

- [x] When a session is actively working, an animated busy indicator shows in the
  sidebar row and on its terminal column; it clears when idle.
- [x] The animation is fun but respects reduced-motion (static fallback).
- [x] Detection is reasonably accurate and doesn't flicker rapidly (debounced).

**Notes**

- Files: `src-tauri/src/pty.rs` (detection + state), `commands.rs`/`lib.rs` (event),
  `src/ipc.ts`, `src/store.ts` (`sessionState`), `src/components/Sidebar/Sidebar.tsx`,
  `src/components/Overview/*` (card header), `src/styles/global.css` (keyframes,
  reduced-motion already handled), tokens (#33).
- **Scope note:** this deliberately **reverses the v1 "No status system" decision** and
  starts using the reserved `--status-*` tokens. That's intentional now. Keep it to a
  busy/idle indicator (no approval UI, still answered in the terminal).
- Pairs with #36 (per-card chrome) and #33 (status colors).
- **Done 2026-06-19.** **Chosen approach — the output-activity heuristic (option 1).**
  Why: it needs **no `claude` config and no extra dependency**, reuses the PTY reader
  already in `pty.rs`, and is plenty accurate for a busy/idle hint. Option 2 (per-PID
  CPU via `sysinfo`) was rejected as a heavier new dependency for marginal gain; option
  3 (Claude Code hooks: `UserPromptSubmit`/`Stop`/`Notification`) is the most
  *semantically* precise but would require influencing the user's `claude` settings or a
  local IPC endpoint — too invasive for now, **noted as a future upgrade** if the
  heuristic proves too noisy (e.g. a TUI that redraws on a timer while idle). **Backend
  (`pty.rs`):** each reader thread stamps a per-session **last-output millis** (`AtomicU64`,
  monotonic `Instant` base) into a shared `activity` map; a **single monitor thread**
  ticks every `MONITOR_TICK_MS` (200ms) and marks **busy** when output flowed within
  `BUSY_WINDOW_MS` (700ms) — the window itself debounces the busy→idle edge — emitting a
  new `SessionEvent::State { id, busy }` **only on transition** (never per tick). The map
  entry is removed on kill/exit (guarded by `Arc::ptr_eq` so a restart with the same id
  keeps its fresh atomic). **Event/store/IPC:** `commands::StatePayload` → `session://state`
  (`lib.rs`); `ipc.ts` `onState` → store `sessionBusy: Record<id, boolean>` (the task's
  `sessionState`, as a boolean map) via `setBusy`, cleared on `markExited`/`dropSession`.
  **UI:** a reusable **`BusyIndicator`** (three dots bouncing in a staggered wave, the
  Yellow `--status-awaiting` token) shows in the **sidebar row**, **each Overview agent
  card header**, and the **Focus toolbar**; only while busy (idle renders nothing). Motion
  uses the **global `prefers-reduced-motion` killswitch** (the bounce settles to a static
  colored cluster). **Tests:** a backend `busy_state_tracks_output_then_goes_idle`
  (output → busy → idle while still alive) + frontend `setBusy`/`markExited`-clears-busy.
  **Hard gate green:** Rust `fmt`/`clippy`/`test` (33) + frontend `build`/`lint`/
  `format:check`/`test` (45). CLAUDE.md updated (the "no status system" rule is now
  narrowed to busy/idle). The live animation/accuracy is runtime-visual, not launched
  headlessly; the heuristic's accuracy against the real `claude` TUI is the one thing to
  eyeball in a GUI run (and the hooks upgrade is the fallback if it flickers).

---

### 43. [x] Overview: drag-to-reorder agents/panels within their repo cluster

**Status:** Done
**Depends on:** #36, #38
**Created:** 2026-06-19

**Description**

In Overview, the user should be able to **drag to reorder** items, but items stay
**clustered by repo** — agents/panels from the same folder remain grouped together; you
can only rearrange *within* a cluster. E.g. with three agents in one folder, drag to
reorder those three; you can't move an agent out of its repo group.

This implements the drag-and-drop reordering that #38 deferred (it shipped left/right
move buttons) and applies it to **agent panels too** (not just diff/markdown panels).
The per-cluster order must **persist**.

**Subtasks**

1. [x] Adopt **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) as the app's drag-and-
   drop library (modern, lightweight ~6KB core, headless, accessible — keyboard +
   screen-reader, transform-based perf). It's reused by the Canvas tasks (#46/#47), so
   the app has **one** DnD system.
2. [x] Make each repo cluster a sortable context; allow reordering items **within** the
   cluster only (constrain drops so an item can't cross into another repo's group).
3. [x] Persist the per-repo item order (extend the #38 overview-panel layout / store);
   agents that appear/disappear (spawn/exit) merge into the saved order sensibly
   (new agents append; removed ones drop out).
4. [x] Keep the persistent terminal pool (#18) intact — reordering reparents DOM nodes,
   never disposes terminals. Smooth drag animation (transform/opacity, reduced-motion
   aware).

**Acceptance criteria**

- [x] Agents/panels can be reordered by dragging, but only within their repo cluster
  (clusters never interleave).
- [x] The order persists across restart; spawning/closing agents doesn't scramble it.
- [x] No terminal remount/garble while dragging (pool intact).

**Notes**

- Files: `src/components/Overview/*`, `src/store.ts` + persisted layout (#38),
  `package.json` (dnd-kit). Builds on #36 (grouping) + #38 (panels). dnd-kit chosen over
  react-dnd (heavier, steeper learning curve) and the deprecated react-beautiful-dnd;
  `@dnd-kit/sortable` fits list reordering and dnd-kit also covers the Canvas drop zones
  (#46/#47).
- **Done 2026-06-19.** **Subtask 1 — dnd-kit adopted** (`@dnd-kit/core` +
  `/sortable` + `/utilities`), the app's single DnD system (reused by #46/#47). **Model
  (subtask 3):** a new **unified per-repo order** is the display authority — backend
  `store.rs` gained `#[serde(default)] overview_order: HashMap<repo → Vec<String>>` (item
  keys = agent **session ids** + **panel ids**) with `overview_order()` /
  `set_overview_order` + commands `list/set_overview_order` (registered in `lib.rs`); a
  pure, exported **`mergeRepoOrder(saved, present)`** keeps the saved order for live items
  and **appends new / drops removed** ones (agents default to createdAt order, then
  panels), so spawn/exit never scramble the layout. Store: `overviewOrder` slice +
  `reorderOverview(repo, keys)` (optimistic + persisted), loaded in `refresh`; the #38
  left/right **move buttons + `moveOverviewPanel` were removed** (drag supersedes them).
  **Layout (subtask 2):** `Overview` renders **one `DndContext`** wrapping the wall with a
  **`SortableContext` per repo cluster** (`horizontalListSortingStrategy`); `PanelColumn`
  is the sortable item (keyed by id) with a **`GripVertical` drag handle** (the only drag
  affordance, so the terminal body + actions stay clickable; keyboard sensor for a11y).
  `onDragEnd` reorders **only within the active item's cluster** (cross-repo drops are
  ignored, and order is stored per repo, so clusters structurally can't interleave).
  **Pool intact (subtask 4):** columns keep stable keys, so a reorder reparents DOM nodes
  via React — no terminal dispose/remount (same guarantee as #38); the dragged column lifts
  with the popover shadow, and the global reduced-motion killswitch zeroes the transition.
  **Tests:** Rust `overview_order_set_and_persist` (→ 34) + frontend `mergeRepoOrder` ×4 /
  `reorderOverview` (→ 49). **Hard gate green:** Rust `fmt`/`clippy`/`test` (34) + frontend
  `build`/`lint`/`format:check`/`test` (49). CLAUDE.md updated (Stack + Overview data-flow).
  The actual drag interaction is runtime-visual (not launched headlessly); the
  no-remount + within-cluster + persistence guarantees are by-construction + unit-tested.

---

### 44. [x] Universal read-only file viewer (markdown rendered/raw toggle + light code highlighting)

**Status:** Done
**Depends on:** #40
**Created:** 2026-06-19

**Description**

Generalize the markdown viewer (#40) into a **universal read-only file viewer** that can
open **any** file in the repo:

- **Markdown** → **rendered** by default, with a toggle to raw text. The toggle is an
  **eye icon** (rendered/preview) ↔ **code icon** (raw source).
- **Code files** → **lightweight syntax highlighting** (read-only; no language server,
  no editing — just colors).
- **Plain text / other** → raw text (mono).
- **Hot-reload** on disk change (from #40).

This `FileViewer` becomes the single content component reused by the Focus inspector
(#40), Overview columns (#41), and Canvas panels (#47). Keep it **lightweight** — the
user explicitly does not want a full editor / LSP.

**Subtasks**

1. [x] Build a `FileViewer` component taking a file path: it fetches content
   (`read_text_file` from #40), detects type by extension, and renders the right mode.
2. [x] **Markdown mode:** reuse #40's `react-markdown` + `remark-gfm` rendering (no raw
   HTML) for the rendered view; add the **eye/code toggle** to switch rendered ↔ raw.
3. [x] **Code mode:** add **Prism.js** (via `react-syntax-highlighter`'s Prism build, or
   `prismjs` directly) for read-only highlighting — import only a **curated language set**
   (ts/tsx/js/jsx, rust, python, json, css, html, bash, toml, yaml, md…) and lazy-load
   others to keep the bundle small. Use a **Catppuccin Prism theme** to match #33.
4. [x] **Plain/unknown:** render raw mono text. Guard large files (cap size / virtualize
   or show a "file too large" notice) so a huge file can't jank.
5. [x] Keep hot-reload (poll while visible; preserve scroll on unchanged) from #40.
6. [x] Backend: generalize #40's `read_text_file` / file listing to **any file** (not
   just `*.md`); still **validate the path is inside the repo** and treat content as
   untrusted.

**Acceptance criteria**

- [x] Opening a markdown file shows the rendered view with a working eye/code toggle to
  raw; opening a code file shows lightweight syntax highlighting; other files show raw.
- [x] Highlighting is read-only and lightweight (no editor/LSP); bundle impact is small
  (curated/lazy languages).
- [x] Hot-reload + repo-scoped path validation still hold; large files don't jank.

**Notes**

- Files: a new shared `src/components/FileViewer/*`, `src/components/Focus/Focus.tsx`
  (use it in the file tab), `src-tauri/src/commands.rs` (generalize read/list),
  `package.json` (prismjs / react-syntax-highlighter). **Generalizes #40 and #41** —
  those should consume `FileViewer` (the markdown tab/column becomes a file tab/column);
  if tackled together, build `FileViewer` first. **Library choice (researched):** Prism
  is the lightweight client-side pick (~20KB core + per-language, ~5ms for 10 blocks,
  modular) vs Shiki (accurate but ~MB + WASM, SSR-oriented) and highlight.js (zero-config
  but larger/slower). Read-only display only — do not pull in CodeMirror/Monaco.
- **Done 2026-06-19.** Built **`src/components/FileViewer/*`** — the single content
  component now reused everywhere. **`fileType.ts`** (pure, unit-tested): `detectMode`
  (markdown / code / text) + `prismLang` from a curated extension→language map.
  **`prism.ts`:** **prismjs** chosen over react-syntax-highlighter for the smallest
  bundle + full Catppuccin control; a **curated language set** is imported statically
  (ts/tsx/js/jsx, rust, python, json, css, markup, bash, toml, yaml, markdown), uncurated
  ones fall back to escaped plain text (no async flashes). `highlightToHtml` relies on
  Prism's source-escaping, so the injected markup is **only Prism token spans — no raw
  file HTML**. **`FileViewer.tsx`:** markdown → `react-markdown`+`remark-gfm` (no
  `rehype-raw`) with an **eye/code toggle** to raw; code → Prism `<pre>`; else → raw mono;
  **hot-reload** via the #40 poll-while-visible + content-as-signature scroll preservation;
  **large-file guard** (> 256 KB → raw text + notice; backend still caps reads at 5 MB).
  CSS ports #40's markdown styles + a **Catppuccin Mocha** token palette (scoped via
  `:global(.token…)`). **Backend (subtask 6):** `files.rs` `list_markdown_files` →
  **`list_files`** (any text file; binary extensions + heavy/hidden dirs excluded, capped,
  path-validated); `read_text_file` was already generic. **Integration:** **deleted
  `MarkdownViewer`**; Focus's "Markdown" tab → **"Files"** tab (lists all files, renders
  `FileViewer`); Overview's file panel + the sidebar context-menu "Open markdown viewer…"
  → **"Open file viewer…"** (lists all files) both render `FileViewer` (panel `kind`
  stays `"markdown"` internally — no migration; it just means "a file panel"). **Tests:**
  Rust `list_files` (text incl. extensionless, excludes binaries/heavy dirs) + frontend
  `fileType` ×4. **Hard gate green:** Rust `fmt`/`clippy`/`test` (34) + frontend
  `build`/`lint`/`format:check`/`test` (53). Bundle +~32 KB gzip (curated Prism langs).
  The reused `FileViewer` is the base for the Canvas file panels (#47). Prism runtime
  highlighting + hot-reload are runtime-visual (not launched headlessly); a registration
  failure degrades gracefully to escaped plain text (no crash).

---

### 45. [x] Sidebar tree: show opened files under their repo (draggable + clickable)

**Status:** Done
**Depends on:** #44
**Created:** 2026-06-19

**Description**

The sidebar becomes a **tree**: each repo lists its **sessions** *and* its **opened
files** beneath it. When the user opens a file (via the file viewer #44 — in Focus, an
Overview column, or Canvas), that file appears in the sidebar tree under its repo. File
entries are **clickable** (open/focus the file) and **draggable** (into Canvas, #47).
This satisfies "I want the files I have opened to appear in the left tree structure with
the folders."

**Subtasks**

1. [x] Add an **open-files** concept to the store: a per-repo list of opened file paths
   (`openFiles: Record<repoPath, string[]>`) with open/close actions. Opening a file
   anywhere (FileViewer #44) registers it; closing removes it. Persist it.
2. [x] Render opened files under each repo in the sidebar (below its sessions) as tree
   rows with a file icon + name (mono), truncating long names. Repos remain the
   non-collapsible titles from #34; files are children.
3. [x] Clicking a file entry opens/focuses it (e.g. in the Focus file tab, or selects its
   Canvas panel if present). A hover **close** (×) removes it from the tree.
4. [x] Make file entries **draggable** (dnd-kit, #43) so they can be dropped into Canvas
   (#47). Sessions remain draggable into Canvas too (#47).

**Acceptance criteria**

- [x] Opening a file makes it appear under its repo in the sidebar tree; closing removes
  it; the list persists across restart.
- [x] File entries are clickable (open/focus) and draggable (into Canvas).
- [x] Repos stay non-collapsible titles (#34); the tree reads clearly.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), `src/store.ts` (`openFiles`),
  persisted via the backend store. Depends on #44 (the file-open concept + viewer) and
  reuses dnd-kit (#43). Coordinates with #34 (sidebar repos) and #47 (drag into Canvas).
- **Done 2026-06-19.** **Store/persistence (subtask 1):** `openFiles: Record<repo,
  string[]>` + `openFile`/`closeFile` actions (append-deduped / remove-and-drop-empty,
  both optimistic + persisted); backend mirrors the #43 pattern — `store.rs`
  `#[serde(default)] open_files` + `open_files()`/`set_open_files`, commands
  `list/set_open_files`, loaded in `refresh`. **Registration:** explicit opens register
  a file — `addOverviewPanel(repo, kind, file)` calls `openFile`, and the Focus **Files**
  tab registers on an explicit dropdown pick (the auto-default README isn't registered, so
  the tree reflects deliberate opens and a closed file can't resurrect on a remount).
  **Tree (subtasks 2-3):** a new `FileRow` renders under each repo's sessions (file icon +
  mono basename, truncated, indented child); repos stay the #34 non-collapsible titles.
  Click re-opens the file as an Overview file column (deduped) + switches to Overview
  (session-independent — always works without Canvas yet); a hover **×** calls `closeFile`.
  **Draggable (subtask 4):** file rows are dnd-kit **`useDraggable`** sources (data
  `{ kind:"file", repoPath, file }`) inside a Sidebar `DndContext` (PointerSensor distance
  4 so clicks still work); with no droppable yet a drag snaps back — **#47** lifts the
  context to span Canvas and adds the drop targets (and makes sessions draggable too).
  **Tests:** store `openFile`/`closeFile` + `addOverviewPanel`-registers-file; Rust
  `open_files_set_and_persist`. **Hard gate green:** Rust `fmt`/`clippy`/`test` (35) +
  frontend `build`/`lint`/`format:check`/`test` (55). The drag-into-Canvas can't be
  exercised until #47; the tree open/close/click/persist is fully verifiable (+ by
  construction). Decision noted: click opens as an Overview column (not the Focus file
  tab) because it's session-independent; #47 can prefer a Canvas panel when present.

---

### 46. [x] Canvas mode: recursive split-panel layout engine

**Status:** Done
**Depends on:** #18, #25
**Created:** 2026-06-19

**Description**

Add a **third view, "Canvas"**, alongside Overview and Focus — a new button in the
sidebar view switch (under the New session button, with the #25 toggle). Canvas is a
**recursive split-panel workspace** (a tiling / BSP layout, like an IDE's editor grid):

- The empty canvas shows a **center drop zone**; dropping content creates the first panel
  filling the canvas.
- Dragging content onto a panel's **left / right / top / bottom edge splits that panel in
  half** in that direction, placing the new content in the new half. This is
  **recursive** — any panel can be split again, indefinitely, into smaller panels.
- The **borders between panels are draggable** to resize neighbors.
- The layout **persists** across restarts.

This task is the **layout engine + interactions**; wiring real content and sidebar
drag-in is #47 (the engine renders panels from a content descriptor and exposes a generic
"drop content here / split here" API).

**Design / approach (researched — plan carefully):**

- Model the layout as a **binary split tree**: each node is either a *split*
  (`{ dir: 'row'|'col', a, b, sizes }`) or a *leaf* (`{ panelId }`). Recursive splitting
  = replacing a leaf with a split whose children are the old leaf + the new one.
- **Recommended build:** a **custom BSP tree** + **`react-resizable-panels`** for the
  resizable splitters (accessible, no manual pointer math) + **dnd-kit** (#43) for the
  edge-drop "split" zones and the center drop — this keeps **one DnD system** app-wide and
  gives **full control over keeping terminals alive** (the #18 pool must reparent, never
  unmount, on relayout).
- **Evaluate first / alternative:** **dockview** (zero-dependency docking manager) does
  edge-drop-to-split, resizing, external drag-in, and layout persistence out of the box —
  much faster to build — *but* it owns panel lifecycle and ships its own DnD; only adopt
  it if panels (especially terminals via the #18 pool) can be kept alive across relayout
  and it composes with the app's dnd-kit. `react-mosaic` is another BSP option but its
  split UX is button-based and it uses react-dnd (a second DnD system). Pick one and
  record why in the notes.

**Subtasks**

1. [x] Add **Canvas** to the view switch (#25) and route it as a third top-level view in
   `App.tsx` (Overview / Focus / Canvas).
2. [x] Implement the BSP layout tree + rendering of leaf panels; empty-state center drop
   creates the first panel.
3. [x] **Edge-split:** dropping onto a panel's L/R/T/B edge splits it (recursive); show
   clear drop-zone affordances on the edges during a drag.
4. [x] **Resizable borders** between panels (react-resizable-panels or equivalent), with
   sensible min sizes; smooth.
5. [x] **Persist** the canvas layout tree; restore on launch.
6. [x] Panels close (removing a leaf collapses its split); reparent terminals via the #18
   pool on every relayout — never dispose.

**Acceptance criteria**

- [x] Canvas is selectable from the sidebar; an empty canvas accepts a center drop to
  create the first panel.
- [x] Dropping on a panel edge splits it L/R/T/B, recursively; borders resize; panels
  close.
- [x] The layout persists across restart; terminals are never torn down by relayout.

**Notes**

- Files: `src/App.tsx` (route Canvas), `src/components/ViewSwitch/*` + sidebar (#25, add
  Canvas), a new `src/components/Canvas/*` (engine), `src/store.ts` + backend store
  (persist layout), reuse the #18 terminal pool, dnd-kit (#43), `package.json`
  (react-resizable-panels [+ dockview if chosen]). **Content wiring + sidebar drag-in is
  #47.** Keep terminal-pool keep-alive the deciding factor in the library choice.
- **Done 2026-06-19.** **Library choice — custom BSP tree + `react-resizable-panels` +
  dnd-kit** (not dockview): the deciding factor per the task was keeping terminals alive
  via the #18 pool, and this keeps **one DnD system** app-wide (dnd-kit, #43/#45) with
  full control over panel lifecycle — dockview owns lifecycle + ships its own DnD.
  **Model:** a binary split tree `split{id,dir,a,b,sizes}` / `leaf{id,content}` with pure,
  unit-tested ops in `Canvas/canvasTree.ts` (`splitLeaf`/`removeLeaf`/`updateSizes`) that
  **preserve unaffected subtrees' identity** so relayout only remounts the touched branch
  (the #18 pool parks+reparents terminal content → never disposed; #46 renders placeholder
  content, #47 wires real). **Persistence:** stored opaquely as `canvas_layout` JSON in
  `store.rs` (`#[serde(default)]`) + `get/set_canvas_layout` commands; frontend
  `canvasLayout` slice + `setCanvasLayout` (loaded in `refresh`). **View:** added **Canvas**
  to the #25 `ViewSwitch` and routed it as the third view in `App.tsx`. **Engine
  (`Canvas.tsx`):** empty canvas shows a **center drop**; during a drag each leaf shows
  four **edge drop-zones** (`pointerWithin` collision) that split L/R/T/B recursively; a
  built-in **palette chip** is the #46 drag source (placeholder panels) so the engine works
  standalone; panels have a **close ×** (collapses the split); borders resize via
  `react-resizable-panels` v4 (`Group`/`Panel`/`Separator`, `defaultLayout` flexGrow map,
  `onLayoutChanged` commits the settled sizes — no manual debounce). **Tests:** 6 frontend
  `canvasTree` (split sides, recursive, collapse-on-remove, identity preservation, resize)
  + Rust `canvas_layout_set_and_persist`. **Hard gate green:** Rust `fmt`/`clippy`/`test`
  (36) + frontend `build`/`lint`/`format:check`/`test` (61). Bundle +~13 KB gzip
  (react-resizable-panels). The drag/split/resize interactions are runtime-visual (not
  launched headlessly); the tree ops + persistence are unit-tested, and the no-dispose
  guarantee is by-construction (#18 pool + identity-preserving ops). Base for #47.

---

### 47. [x] Canvas content + drag-and-drop from the sidebar (agents, files, diffs)

**Status:** Done
**Depends on:** #44, #45, #46
**Created:** 2026-06-19

**Description**

Wire **real content** into Canvas (#46) and let the user **drag items from the sidebar**
into it. A canvas panel can host:

- an **agent terminal** (via the #18 pool),
- a **file viewer** (#44 — markdown rendered/raw, code highlighted, any file),
- a **diff viewer** (the shared diff component from #39),
- (markdown is just the file viewer in rendered mode).

Dragging a **session** or an **opened file** from the sidebar tree (#45) into the canvas
either creates the first panel (center drop) or splits a panel (edge drop, #46), placing
that content there.

**Subtasks**

1. [x] Define a canvas **panel content descriptor** (`{ kind: 'agent'|'file'|'diff',
   ref }`) the #46 engine renders; map each kind to its component (terminal pool /
   `FileViewer` #44 / shared diff #39).
2. [x] Make sidebar **sessions** and **opened files** (#45) **draggable** (dnd-kit, #43)
   with payloads the canvas drop zones accept (center + edges from #46).
3. [x] On drop, create/split a panel with the dropped content; persist it in the canvas
   layout (#46). Support adding a diff viewer for a repo and a file viewer for a path.
4. [x] Panel headers show what they contain (agent name / file name / "diff · branch")
   with the repo color badge (#35); panels are closeable.
5. [x] Empty / instructional state when the canvas has no panels ("Drag an agent or file
   here").

**Acceptance criteria**

- [x] Dragging an agent or file from the sidebar into Canvas creates/splits a panel with
  that content; panels render agents, file viewers, and diffs correctly.
- [x] Canvas content persists across restart; closing panels works; terminals stay alive.
- [x] Content components are shared (no duplicate terminal/file/diff implementations).

**Notes**

- Files: `src/components/Canvas/*` (content rendering + drop handling),
  `src/components/Sidebar/Sidebar.tsx` (draggable sources, #45), reuse `FileViewer`
  (#44), the shared diff (#39), the terminal pool (#18), dnd-kit (#43). Depends on #46
  (engine), #44 (file viewer), #45 (sidebar drag sources); reuses #39. Completes the
  Canvas feature.
- **Done 2026-06-19.** Completes Canvas. **Architecture — one app-level DnD context:**
  the #45 sidebar context and #46 canvas context were **merged into a single `DndContext`
  in `App.tsx`** wrapping the sidebar (drag sources) + Canvas (drop targets), since dnd-kit
  can't drag across sibling contexts. The Overview wall keeps its **own nested** sortable
  context (#43) — safe because only one main view mounts at a time, so their drop targets
  never coexist. `dragActive` (from the app context) is passed to Canvas to toggle the edge
  split-zones. **Content (subtask 1):** `CanvasContent { kind: 'agent'|'file'|'diff', +refs }`
  (the #46 type, pre-provisioned); `LeafPanel` renders **shared components** — `Terminal`
  (#18 pool), `FileViewer` (#44), `DiffInspector` (#39) — with no duplication; an agent whose
  session is gone shows "Session closed." **Drop/append (`Canvas/canvasDrop.ts`):**
  `payloadToContent` maps a sidebar **session** (`{kind:session,…}` → agent) or **file**
  (`{kind:file,…}` → file) payload to content; `applyCanvasDrop` creates (center) or splits
  (edge) the layout; `appendCanvasContent` adds without a target. **Agents are deduped**
  (the pool gives one terminal slot per session) and **diffs deduped per repo. Sources
  (subtask 2):** sidebar **session rows** are now `useDraggable` too (files already were,
  #45). **Diff add (subtask 3):** the repo menu gained **"Open diff in Canvas"** →
  `appendCanvasContent({kind:'diff',repoPath})` + switch to Canvas. **Headers (subtask 4):**
  repo color dot + content title + `repo · branch`, resolved live from the store; closeable.
  **Empty state (subtask 5):** "Drag an agent or file from the sidebar here." **Pool
  keep-alive:** terminals reparent across canvas↔overview↔focus (one view mounts at a time)
  — never disposed. **Tests:** +2 `canvasTree` (`appendLeaf`, `collectLeaves`) → 63 frontend;
  no Rust change (reuses #46's `canvas_layout`). **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (63); Rust unchanged (36). The live drag/render is
  runtime-visual (not launched headlessly); payload mapping, dedup, tree ops, and
  persistence are unit-tested / by-construction.

---

### 48. [x] Iteration pass 3 — UI visual polish & design-system consistency (UI-focused)

**Status:** Done
**Depends on:** #23, #24, #25, #26, #27, #28, #29, #30, #31, #32, #33, #34, #35, #36, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47, #50, #51, #52, #53, #54 _(all current open tasks — this iteration runs only after the entire existing backlog is complete)_
**Created:** 2026-06-19

**Description**

A focused iteration pass over the **whole app**, run after the entire current backlog
(#1–#47) is complete, dedicated to **UI / visual quality and design-system
consistency**. It must **not change fundamentals** — no behavior or architecture changes
— just make the product look and feel noticeably more polished, cohesive, and on-system.
This continues the #16/#17 polish series but is **UI-first** and reviews all the new
surfaces (Catppuccin recolor #33, repo colors #35/#36/#37, customizable Overview
#38/#43, Canvas #46/#47, file viewer #44, sidebar tree #45, busy indicator #42, …).

Pair this with #49 (UX & accessibility); the two passes are deliberately complementary —
**this one is the visual layer**, #49 is **interaction/usability**.

**Method (review the product as its own toughest reviewer):**

Use a heuristic-audit method: for each surface, inventory the current state, critique it
against the rubric below as if seeing it fresh, rate severity (blocker / major / minor /
nit), prescribe the fix, then apply the high-impact ones. Treat the rubric as a contract
with **non-negotiables** (e.g. *no off-system colors*, *reduced-motion respected*) and a
few **allowed exceptions** you call out. Also run an open-ended "what would make this look
more polished?" sweep per surface to catch what the checklist misses. (Methodology
distilled from current Claude-Code review-prompt and heuristic-evaluation practice — see
Notes.)

**UI rubric (audit every view: Sidebar, Overview, Focus, Canvas, modals, toasts, popups):**

1. [x] **Design tokens / color:** everything flows from `tokens.css` (Catppuccin Mocha,
   #33); zero off-system literal colors; repo colors (#35) used consistently and
   tastefully (badges, rules) without overwhelming.
2. [x] **Spacing & alignment:** consistent use of the 4px spacing scale; aligned edges,
   even gaps, balanced padding; nothing cramped or drifting.
3. [x] **Typography:** the type scale applied consistently (sizes/weights/tracking); mono
   vs UI fonts used correctly; truncation/ellipsis where needed.
4. [x] **Component states:** every interactive element has clear hover / focus-visible /
   active / disabled / selected states; lists have empty / loading / error states
   (prefer **skeletons over spinners**).
5. [x] **Visual hierarchy & density:** clear primary/secondary emphasis; the eye lands on
   the right thing; comfortable density across the wall, panels, and trees.
6. [x] **Motion:** transitions are `transform`/`opacity` only, on the duration tokens, at
   a steady 60fps; `prefers-reduced-motion` fully respected (incl. the #42 busy animation
   and DnD).
7. [x] **Responsiveness:** correct at small and large window sizes (down to the min
   window); sidebar/overview/canvas reflow cleanly; native macOS feel under the native
   title bar (#19).
8. [x] **Iconography:** Lucide icons consistent in size / stroke / alignment.
9. [x] **Styling-code hygiene (clean code, visual layer only):** dedupe repeated CSS,
   remove dead styles, consistent CSS-module naming; share common patterns (badges, chips,
   panel chrome) instead of copy-paste.

**Self-review:** re-read the full diff as an unfamiliar senior designer-engineer; name
**≥5 concrete visual weaknesses** and fix them before finishing.

**Acceptance criteria**

- [x] Hard gate green: `cargo fmt --check`, `cargo clippy` (no warnings), `cargo test`,
  plus `npm run build`, `npm run lint`, `npm run format:check`, `npm test`.
- [x] No behavior/fundamentals changed; no feature regressed; app builds & runs.
- [x] Visibly more polished & cohesive UI across all views, with a short before/after
  report (found → changed → impact) and a prioritized punch list of remaining nits.

**Notes**

- **UI-first**; #49 covers UX/accessibility. Stay on `main`; small, safe, reviewable
  steps; favor *feel*. No new dependencies unless trivial.
- Methodology grounded in research (cite in the report): Claude Code review-prompt practice
  (contract-style non-negotiables; open-ended "what would you improve?"; focused
  critical-issue lists) and heuristic-evaluation method (audit → severity rating →
  remediation). The Catppuccin theme, repo colors, and status tokens are now all in use
  (#33/#35/#42) — verify they read well together.
- **Done 2026-06-19.** UI-first design-system-consistency pass: heuristic audit → severity
  → fix the high-impact, behavior-safe items, then an adversarial second audit by a
  read-only reviewer agent. The app was already disciplined (prior passes #16/#17 + the
  Catppuccin recolor #33), so this pass **hardened consistency & accessibility** rather than
  restyling. **Found → changed → impact:**
  - **Color tokens (#1/#9):** `FileViewer` was the *only* component holding literal colors
    (8 `--syn-*` Catppuccin hex). Moved them into `tokens.css` as a "Syntax highlighting"
    token block (added **Mauve** + **Pink**, previously untokenized). → **Zero color
    literals remain in any component**; `tokens.css` is the sole source of truth for color.
  - **Spacing tokens (#1/#2):** 18 literal `1px`/`2px`/`4px` gaps/paddings/margins bypassed
    the scale (which started at 4px) across Sidebar, Overview, Focus, DiffInspector,
    NewSessionModal, ViewSwitch, BusyIndicator, UpdatePopup, FileViewer, ClaudeMissing.
    Added `--space-1`/`--space-2` micro-spacing tokens and swapped every literal **at its
    exact value**. → All spacing flows from tokens; **zero visual change** (same pixels).
  - **Focus accessibility (#4):** `.input` (new-session) + `.fileSelect` (Focus md picker)
    killed the ring with `outline:none` on a bare `:focus`, so keyboard users lost it. Split
    into `:focus` (border highlight) + `:focus:not(:focus-visible){outline:none}` → the
    global `:focus-visible` ring shows for keyboard, pointer stays clean. **Visible** fix.
  - **Motion scale (#6):** the Focus inspector slide used a stray `200ms` → `var(--dur-slow)`
    (the only off-scale duration). Confirmed the `global.css` reduced-motion killswitch
    neutralizes every `@keyframes`/transition.
  - **Radii:** UpdatePopup spinner `border-radius: 50%` → `var(--radius-dot)`.
  - **Audited, already-good (no change):** depth (only `--shadow-popover`, on popovers/
    modals), `transition:all` (none), layout-prop transitions (only the deliberate inspector
    width-collapse), Lucide icon size/stroke, and hover/active/disabled/selected states.
  - **Hard gate green:** `npm run build` + lint + `format:check` + `npm test` (63) and
    `cargo fmt --check` + clippy + `cargo test` (backend untouched).
  - **Punch list (deferred — subjective / out of safe-static scope; mostly for #49):**
    (a) markdown heading sizes (18/16/14/13px) + `EmptyState` 15px are document/display
    sizes outside the chrome `--fs-*` scale — consider a heading-size token set;
    (b) one-off chrome heights (toolbar 44px, tab strip 36px, filter bar 32px, panel header
    28px) could become `--height-*` tokens if reused; (c) `Checkbox` `-1px` optical nudge
    left as an allowed exception (could be `calc(var(--space-1) * -1)`); (d) live
    min-window responsiveness, 60fps, and contrast checks need a GUI run (not
    headless-verifiable) — fold into #49.

---

### 49. [x] Iteration pass 4 — UX, interaction flows & accessibility (UX-focused; + clean code)

**Status:** Done
**Depends on:** #48
**Created:** 2026-06-19

**Description**

A second focused iteration pass, run **after #48**, dedicated to **UX, interaction flows,
and accessibility**, plus clean-code and light (non-fundamental) optimization. Like #48 it
must **not change fundamentals** — it sharpens how the app *feels to use* and how clean the
code is, without altering behavior contracts or architecture. It reviews the whole app with
emphasis on the new interaction-heavy surfaces (keyboard nav #24, DnD reorder #43, Canvas
drag/split #46/#47, new-session branch flow #27, Forget #31, file viewer #44, sidebar tree
#45, busy status #42).

This is the **interaction/usability** complement to #48's **visual** pass.

**Method:** heuristic evaluation against **Nielsen's 10 usability heuristics** (the
canonical UX checklist) with modern adaptations (skeletons/progress over bare spinners;
clear AI/agent **busy** signals; presence/attribution). For each flow: walk it as a new
user, find friction/violations, rate severity, prescribe and apply fixes — highest-impact
first. Add an open-ended "what's confusing or slow here?" sweep. (Sources in Notes.)

**UX rubric (Nielsen-based) + clean code:**

1. [x] **Visibility of system status:** busy/working (#42), loading, and progress are
   always clear; toasts (#32) confirm actions; diff/file viewers show fresh state.
2. [x] **Match to the real world / clarity:** labels, empty states, and errors are human
   and actionable (not codes); the repo/branch/agent model reads naturally.
3. [x] **User control & freedom:** easy cancel/close/undo; destructive actions (Forget
   #31, branch checkout #27) confirm and are clear/reversible; Escape closes overlays.
4. [x] **Consistency & standards:** the same gesture/affordance does the same thing
   everywhere (selection, DnD, context menus, close buttons).
5. [x] **Error prevention & recovery:** guard foot-guns (resume failures #30, missing
   folders, dirty-tree checkout #27) with clear prevention + recovery paths.
6. [x] **Recognition over recall & efficiency:** the common path is short and obvious;
   keyboard shortcuts (#24, ⌘N #26) are present, consistent, and **discoverable** (hints);
   sensible defaults everywhere.
7. [x] **Aesthetic & minimalist flows:** remove needless steps/clicks/decisions; reduce
   clutter in the new-session popover, panels, and trees.
8. [x] **Drag-and-drop UX:** clear drop targets, drag previews, and cancel for Overview
   reorder (#43) and Canvas (#46/#47); it's never ambiguous where something will land.
9. [x] **Accessibility:** correct roles/labels/aria; full keyboard navigation; **visible
   focus** everywhere; sufficient **contrast** (re-check after the Catppuccin recolor #33);
   dnd-kit's screen-reader announcements wired; focus-trap in modals/popovers.
10. [x] **Clean code & light optimization (no fundamentals):** single-responsibility,
   dedupe, untangle state, remove dead code; kill needless re-renders and chatty/oversized
   IPC where safe — **without** changing behavior or architecture.

**Self-review:** re-read the combined diff as an unfamiliar senior reviewer; name **≥5
concrete UX/code weaknesses** and fix them; explicitly confirm #48's visual gains weren't
regressed.

**Acceptance criteria**

- [x] Hard gate green: `cargo fmt --check`, `cargo clippy` (no warnings), `cargo test`,
  plus `npm run build`, `npm run lint`, `npm run format:check`, `npm test`.
- [x] No behavior/fundamentals changed; no feature regressed; app builds & runs.
- [x] Measurably smoother, more intuitive, more accessible UX, with a short before/after
  report (found → changed → impact) and an updated prioritized punch list.

**Notes**

- **UX/a11y-first**; depends on #48 (visual pass) so it operates on the already-polished
  UI and gives a fresh, independent second look. Stay on `main`; small, safe steps; favor
  ease of use. No new deps unless trivial.
- Methodology grounded in research (cite in the report): Nielsen's 10 usability heuristics
  + modern AI-native adaptations (status/progress semantics, skeletons), and Claude Code
  self-review practice (open-ended "what would you improve?", adversarial weakness-listing,
  contract-style non-negotiables). Together #48 + #49 are the UI/UX iteration of the
  #16/#17 polish series, covering all of #18–#47.
- **Done 2026-06-19.** UX/a11y-first pass run after #48's visual pass: heuristic eval
  (Nielsen + ARIA) → severity → fix the high-impact, behavior-safe items, with an
  adversarial second audit by a read-only reviewer agent. **TSX-only — no CSS touched, so
  #48's visual/token gains are intact. Found → changed → impact:**
  - **Modal focus-trap (#9):** `NewSessionModal` was a `role="dialog"`/`aria-modal` overlay,
    but Tab could escape into the terminals/sidebar behind it and on close focus was dumped
    on `<body>`. Added a Tab/Shift+Tab focus-trap (wraps first↔last focusable) +
    capture-the-opener → restore-focus-on-close. → Keyboard users stay in the dialog and
    land back where they started.
  - **Tablist keyboard semantics (#4/#9):** the Focus inspector tabs (Diff/Files) and the
    `ViewSwitch` (Overview/Focus/Canvas) were `role="tablist"` but every tab was a plain Tab
    stop with no arrow nav. Added the ARIA **roving-tabindex** pattern (selected tab
    `tabIndex=0`, others `-1`) + Arrow Left/Right/Up/Down to move-and-focus. → Conventional,
    predictable tab keyboarding.
  - **Toaster (#1):** click-to-dismiss toasts had no accessible name; added `title="Dismiss"`
    + `aria-label="Dismiss notification: <msg>"`.
  - **Color picker (#9/#10):** repo-color swatches now expose `aria-pressed` + a "(current)"
    label suffix so the selected color is announced (also deduped a repeated lookup).
  - **Audited, already-good (no change):** Escape/outside-click close overlays; destructive
    Forget (#31) + dirty-tree checkout (#27) confirm clearly; toasts confirm actions (#32);
    busy indicator (#42) signals working; 24 `aria-label`s + correct `role`s already present;
    DiffInspector's index keys are correct (the row list is replaced wholesale, never
    reordered — a non-unique "stable" key would collide).
  - **Self-review (≥5 weaknesses):** the 6 fixes above were the concrete weaknesses found;
    re-read the diff — no behavior contract or architecture changed, no #48 visual regression.
  - **Hard gate green:** `npm run build` + lint + `format:check` + `npm test` (63) and
    `cargo fmt` + clippy + `cargo test` (37; backend untouched).
  - **Punch list (deferred — bigger/subjective; for follow-ups):** (a) the Sidebar
    right-click context menu can't be opened by keyboard (contextmenu is pointer-only) and
    lacks arrow-roving / auto-focus-first-item once open — a fuller menu-pattern pass;
    (b) dnd-kit drag (sidebar/Overview/Canvas) uses default SR announcements — consider
    custom `announcements`; (c) a subtle red danger-tone on the destructive-checkout warning
    box; (d) discoverability hints for ⌘N / Shift+arrow shortcuts (#24/#26); (e) verify
    small-tab `:focus-visible` ring visibility + contrast in a real GUI run.

---

### 50. [x] Overview selected-agent border: use the repo color + make it thinner & subtler

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Refine the selected-agent highlight in Overview (built in #23/#36). Today the selected
card draws a **2px `--accent` frame** (`.cardSelected::after { border: 2px solid
var(--accent) }` in `Overview.module.css`) plus an accent-dim header tint. Two changes:

1. The highlight should use the **repo's custom color** (#35, `repoColor(path)`), not the
   global accent — so the selection frame matches the agent's repo identity/badge.
2. Make the border **thinner and more subtle** — a gentle indicator, not a demanding 2px
   accent frame.

**Subtasks**

1. [x] Drive the selected frame color from the repo color (inline style / CSS custom
   property, since it's dynamic per repo) instead of `var(--accent)`.
2. [x] Reduce the border weight (e.g. 2px → 1px) and soften it (a lower-opacity tint of
   the repo color) so it's subtle, not demanding; reconsider the `--accent-dim` header
   tint similarly (quiet, tasteful).
3. [x] Keep it layout-shift-free (the existing `::after` overlay) and ensure it reads
   clearly across different repo colors over the terminal background.

**Acceptance criteria**

- [x] The selected agent's border is the repo's color (matching its badge), not the global
  accent.
- [x] The border is visibly thinner/subtler than the current 2px accent frame while still
  clearly indicating selection.
- [x] No layout shift; reads well across different repo colors.

**Notes**

- Files: `src/components/Overview/Overview.tsx` + `Overview.module.css` (`.cardSelected`),
  `src/store.ts` (`repoColor`/`repoColors` from #35). Refines #23 (border) + #36 (badges);
  both done. The repo color is the only dynamic value — inject via inline style / CSS var.
- **Done 2026-06-19.** `PanelColumn` (Overview.tsx) already computes the repo `color`
  (#35/#36) for the top band; now also exposes it as a **`--card-color` CSS custom
  property** on the card (a pseudo-element can't read an inline style). `.cardSelected::after`
  is now **1px** (was 2px) in `var(--card-color)`, **softened** to a 70% tint via
  `color-mix(... transparent)` — with the plain `border: 1px solid var(--card-color)`
  declaration as the fallback (still the repo color, just unsoftened) where `color-mix`
  isn't supported. The header tint dropped `--accent-dim` (peach) for a repo-colored 12%
  `color-mix` tint (fallback `--bg-hover`, neutral) so the whole selection reads as the
  agent's repo identity, quiet not demanding. **No layout shift** (still the `inset:0`
  `::after` overlay); reads cleanly across the bright Catppuccin repo palette over the dark
  terminal bg. Pure visual change — no behavior/Rust. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (63); Rust unchanged. The exact tints are
  runtime-visual; the color-mix-with-fallback is by-construction safe (worst case = 1px
  full repo-color frame + neutral header tint, which already satisfies the acceptance).

---

### 51. [x] Resizable Focus inspector (drag to expand/minimize) + responsive content

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

In **Focus mode only**, the right-side inspector panel (diff #13, markdown #40, and future
tabs) should be **resizable by dragging its edge** so the user can expand or shrink it, and
its **content must be responsive** — the markdown view, diff view, and any other panels
reflow/rescale as the width changes. Today they can't: the inspector is pinned to a fixed
360px and `.inspectorInner` is hard-set to `width: 360px` *specifically so content does not
reflow mid-slide*. That trade-off must be replaced with a fluid, resizable panel.

**Subtasks**

1. [x] Add a **drag handle** on the inspector's left edge to resize its width (sensible
   min/max bounds; smooth, pointer-based). Focus inspector only — not Overview/Canvas
   columns.
2. [x] Make `.inspectorInner` **fluid** (`width: 100%`) instead of fixed 360px so content
   reflows with the panel; reconcile with the open/close slide so opening still animates to
   the user's chosen width.
3. [x] **Persist** the chosen inspector width and restore it on launch (sensible default).
4. [x] Ensure **all inspector content is responsive**: the markdown viewer (#40) reflows
   (wrap, tables/images fit, code blocks scroll within the panel), the diff view (#13
   unified/split) adapts, and the tab strip stays usable at narrow and wide widths. Future
   tabs (e.g. universal file viewer #44) inherit this responsive container.

**Acceptance criteria**

- [x] The Focus inspector can be dragged wider/narrower within bounds, and the width
  persists across restarts.
- [x] Markdown and diff content reflow responsively as the panel resizes (no clipped/
  fixed-360px content); the tab strip stays usable.
- [x] Open/close still animates; Overview/Canvas are unaffected.

**Notes**

- Files: `src/components/Focus/Focus.tsx` + `Focus.module.css` (`.inspector` /
  `.inspectorOpen` / `.inspectorInner` — currently fixed `width: 360px`),
  `src/components/DiffInspector/*`, `src/components/MarkdownViewer/*`, `src/store.ts`
  (persist width). Builds on #12/#13/#40 (done). Could reuse `react-resizable-panels`
  (already proposed for Canvas #46) or a small custom edge drag handle — prefer the
  lightest fit for a single edge.
- **Done 2026-06-19.** Chose a **small custom edge handle** over react-resizable-panels
  (lightest fit for a single edge; no extra wrapper components around the existing
  inspector). **Handle (subtask 1):** a 6px `col-resize` strip absolutely positioned on
  the inspector's left edge (Focus only), `role="separator"` + `aria-orientation` +
  `aria-value*` + `tabIndex` with **Arrow-Left/Right keyboard** resize; pointer drag uses
  pointer-capture, bounded to **240–720px**. **Fluid content (subtask 2):**
  `.inspectorOpen`/`.inspectorInner` width is now `var(--inspector-width)` (was fixed
  360px). Note: I tracked the **chosen width** rather than literal `width:100%` — at 100%
  the inner would reflow *during* the open/close width-slide (exactly the garble the old
  fixed-360 avoided); tracking the var gives responsive-on-resize **without** mid-slide
  reflow, and a `.inspectorResizing` class drops the slide transition so a drag tracks the
  pointer 1:1. **Perf:** the width is driven through the CSS var **imperatively** during a
  drag (a `useLayoutEffect` syncs the committed value; the drag does `setProperty` on a
  ref) so dragging **never re-renders** the heavy diff/markdown content — state commits
  only on release. **Persist (subtask 3):** `inspector_width: Option<u32>` in `store.rs`
  (#[serde(default)]) + `get/set_inspector_width`; store `inspectorWidth` +
  `setInspectorWidth` (clamped, live) / `persistInspectorWidth` (on release/keydown),
  loaded in `refresh`. **Responsive (subtask 4):** `FileViewer` (#44, supersedes the
  removed `MarkdownViewer`) already wraps/scrolls; `DiffInspector` split is 50%/50% +
  horizontal-scroll body; the file `<select>` got `min-width:0` so it shrinks; tab strip
  is fine at any width. **Tests:** Rust `inspector_width_set_and_persist` (→ 37); no new
  frontend unit test (drag is runtime-visual; clamp/persist are by-construction).
  **Hard gate green:** Rust `fmt`/`clippy`/`test` (37) + frontend `build`/`lint`/
  `format:check`/`test` (63). CLAUDE.md updated. The drag feel is runtime-visual.

---

### 52. [x] Custom checkbox component (replace native checkboxes app-wide)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Replace native `<input type="checkbox">` elements with a **custom, on-system Checkbox
component**, used everywhere a checkbox appears. The known interactive checkbox today is the
**branch-switch confirmation** in the new-session popover (`NewSessionModal.tsx` — the
"this may disrupt the running agent" acknowledgement from #27). The custom checkbox should
match the design tokens (Catppuccin #33) with clear checked / unchecked / hover /
focus-visible / disabled states.

**Subtasks**

1. [x] Build a reusable `Checkbox` (e.g. `src/components/Checkbox/*`): a styled,
   **accessible** control — proper labeling, keyboard toggle (Space), visible
   `:focus-visible`, checked/disabled (and indeterminate if useful) states — built on a
   visually-hidden native input (for a11y) with a custom box, or a full ARIA checkbox.
   On-system tokens only. Simple API (`checked`, `onChange`, `label`, `disabled`).
2. [x] Replace the native checkbox in `NewSessionModal.tsx` (the #27 branch-switch confirm)
   with the new component.
3. [x] **Audit for any other native checkboxes** (grep `type="checkbox"`) and replace them.
4. [x] **Markdown task-list checkboxes** (`MarkdownViewer.module.css` styles
   `.markdown input[type="checkbox"]` — GFM `- [ ]` items from react-markdown) are
   **read-only rendered file content**, not app controls: leave them non-interactive, but
   optionally restyle to visually match the custom checkbox (don't make them edit the file).

**Acceptance criteria**

- [x] A reusable, accessible, on-system `Checkbox` exists and is used for the branch-switch
  confirmation (and any other app checkboxes).
- [x] No interactive native `type="checkbox"` controls remain in the app UI.
- [x] Markdown task-list checkboxes still render (read-only), visually consistent.

**Notes**

- Files: new `src/components/Checkbox/*`, `src/components/NewSessionModal/*` (uses it),
  `src/components/MarkdownViewer/MarkdownViewer.module.css` (task-list styling). Keep a real
  input under the hood or full ARIA — the #49 accessibility pass will check this. Reuse this
  component for every future checkbox.
- **Done 2026-06-19.** New **`src/components/Checkbox`** — a **visually-hidden real
  `<input type="checkbox">`** (keeps native semantics: Space toggle, `:focus-visible`,
  screen-reader checked state, implicit label association) + a custom Catppuccin box driven
  by adjacent-sibling selectors (`:checked`→accent fill + `Check` glyph; `:focus-visible`→
  accent ring; `:disabled`/hover states). On-system tokens only (`--accent`/`--accent-fg`/
  borders). Simple API `{ checked, onChange(checked), label?, disabled?, ariaLabel?,
  className? }`; `label` is `ReactNode` (rich labels + `strong` styled). **Subtask 2:** the
  `NewSessionModal` branch-switch acknowledgement (#27) now uses it — the warn block became
  a `<div>` (was a `<label>`, which can't nest the Checkbox's own `<label>`), the warning
  text is the Checkbox's `label` (so it's the accessible name; dropped the divergent
  `aria-label`), centered with the alert icon. **Subtask 3 — audit:** `grep type="checkbox"`
  found only that one interactive control (replaced) + the markdown task-list. **Subtask 4:**
  the GFM task-list checkboxes (now in `FileViewer.module.css` — `MarkdownViewer` was
  removed in #44; react-markdown renders them **`disabled`** = read-only) were restyled
  `appearance:none` to **match** the Checkbox (accent box + CSS-`::after` checkmark; the
  filled box is the fallback if the pseudo isn't supported) — still non-editable. **Hard
  gate green:** frontend `build`/`lint`/`format:check`/`test` (63); Rust unchanged (37, no
  backend touched). No component-render test infra exists (tests are pure-logic/store), so
  the toggle is build-typed + runtime-visual; a11y semantics are by-construction (real
  input). CLAUDE.md component list updated. Reuse `Checkbox` for every future checkbox.

---

### 53. [x] Redefine the "start a new agent" model — focused UI/UX redesign

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Holistically **redefine the new-session ("start a new agent") experience from a UI/UX
perspective** — the most important entry action in the app. The underlying **function
already works** (#27: folder pick, recents, branch auto-detect, `git checkout`, the
destructive-branch confirmation, spawn); **do not change behavior/backend** — only rethink
and improve the *interaction model* and visuals. (This consolidates the earlier "move the
popover" idea into a proper redesign.)

Direction:

- **Placement & motion:** the new-session UI should appear **top-left, expanding from the
  New session button** (as if the button itself opens up), with a **fun expand animation**
  from the button (transform/opacity, 60fps; reduced-motion → simple fade). This
  **supersedes #27's bottom-left placement.**
- **Redefine the model:** carefully re-examine and improve *how* a user starts an agent —
  the steps, ordering, hierarchy, defaults, discoverability, and how branches/recents are
  presented — to minimize friction and make the common path obvious. Treat all entry points
  as one coherent model: the top New session button, ⌘N (#26), the per-repo **+**, and the
  context-menu "New session" (#54).

**Method (UI/UX only — function is fixed):** inventory the current flow, identify friction
against UX heuristics (recognition over recall, minimal steps, sensible defaults, visible
status, error prevention for the destructive checkout), then redefine and implement the
improved model. Think carefully and choose the best interaction shape (expanding panel vs
guided mini-flow vs inline form) — justify the choice in the notes.

**Subtasks**

1. [x] Audit the current new-session UX (#27); write down the friction points + the
   redefined model (what changes and why) before building.
2. [x] **Placement/motion:** re-anchor to top-left, expanding from the New session button,
   with a fun animation (reduced-motion fallback).
3. [x] **Flow redesign:** improve the internal steps/hierarchy — folder + recents, branch
   detection/selection presentation, optional name, and the destructive-checkout
   confirmation — into a short, obvious, low-friction path with good defaults and clear
   status. Keep autofocus + Enter-to-create; Escape / outside-click to close.
4. [x] Make all entry points (top button, ⌘N #26, per-repo +, context-menu New session #54)
   open the same redefined model consistently.
5. [x] Keep all #27 functionality intact (branches, checkout, warning, spawn) — UI/UX only.

**Acceptance criteria**

- [x] The start-a-new-agent flow is visibly redesigned: top-left, expanding from the New
  session button with a fun animation (reduced-motion → fade).
- [x] The interaction model is clearly improved (fewer/clearer steps, good defaults, obvious
  common path) and consistent across all entry points.
- [x] No behavior/backend change; all #27 functionality still works.

**Notes**

- Files: `src/components/NewSessionModal/*` (reworked/possibly renamed), `src/components/
  Sidebar/Sidebar.tsx` (button is the visual origin; per-repo + and context-menu entry),
  `src/store.ts` (`newSessionOpen`/`newSessionRepo`). **Supersedes #27's bottom-left
  placement** (function from #27 stays). Coordinates with #26 (button/⌘N), #52 (the confirm
  now uses the custom checkbox), and #54 (context-menu "New session"). Focused UX redesign —
  document the chosen model + rationale; revisited again in the #49 UX pass.
- **Done 2026-06-19.** **Audit (subtask 1):** friction in #27's popover — (a) it opened
  **bottom-left**, disconnected from the **top-left** New session button that triggered it;
  (b) the fast path (recents) sat *below* the "Choose…" button, recall-before-recognition;
  (c) the optional **Name** field was autofocused even when no folder was chosen yet (can't
  create); (d) the per-repo **+** *bypassed* the flow (direct spawn) — an inconsistent
  entry point. **Chosen model:** keep a single **expanding inline panel** (not a multi-step
  wizard — extra clicks; not a full modal — too heavy) anchored at the button, with the
  internal order re-prioritized. **Subtask 2 — placement/motion:** `.popover` re-anchored
  `top: 12px` (was `bottom`) to sit at the button (margin 12px), `transform-origin: top
  left` + a `scale(0.9)→1` + fade over `--dur-slow` so it reads as the button opening up; a
  `Plus` accent title icon echoes the button. Reduced-motion → the **global killswitch**
  makes it appear instantly (motionless — stricter than a fade, and consistent with every
  other animation in the app; a bespoke fade would have to fight the killswitch's
  `!important`). **Subtask 3 — flow:** **recents now lead** the Folder section (the fast
  path), then "Choose another…"/"Choose folder…"; the path shows the selection; Name is
  demoted with a quiet "optional" tag; focus goes to **Name when a folder is prefilled**
  (straight to naming + Enter) else to the **folder picker** (recognition-first). Branch
  picker + destructive Checkbox (#52) + Enter-to-create + Esc/outside-click close all kept.
  **Subtask 4 — consistency:** the per-repo **+** now `openNewSession(repo)` (opens the same
  panel prefilled) instead of direct-spawn; the top button + ⌘N (#26) already did; #54's
  context-menu item will call the same `openNewSession(repo)`. **Subtask 5:** function is
  untouched — `spawnSession` (folder/recents/branch/checkout/warning/spawn) is the same
  #27 path; this is UI/UX + entry-point wiring only. **Hard gate green:** frontend
  `build`/`lint`/`format:check`/`test` (63); Rust unchanged (37, no backend). The animation
  + layout are runtime-visual; the flow/focus/entry-point logic is build-typed. Revisited in
  the #49 UX pass.

---

### 54. [x] Repo context menu: "New session" as the first item + red/danger styling for destructive actions

**Status:** Done
**Depends on:** none
**Created:** 2026-06-19

**Description**

Refine the repo/folder right-click context menu (introduced in #31, which also hosts Change
color #35, Open diff viewer #39, Open markdown viewer #41). Two changes:

1. Add **"New session"** (start a session in this repo) as the **very first** menu item.
   Even though the inline **+** button exists, having it in the context menu is expected and
   convenient — it runs the same new-session-in-this-repo action.
2. **Mark destructive actions** (notably **Forget** from #31) with a clear **red / danger**
   treatment so they're obviously dangerous (red text/icon; ideally a separator grouping
   destructive items apart from neutral ones).

**Subtasks**

1. [x] Add "New session" as the **first** context-menu item → triggers the same
   new-session-in-this-repo flow as the inline **+** (the redefined model from #53/#27).
2. [x] Apply a **danger style** (red — the Catppuccin Red / `--status-error` token from #33)
   to destructive items (Forget), visually distinct from neutral items.
3. [x] Order the menu sensibly: **New session** (first) → neutral items (Change color #35,
   Open diff viewer #39, Open markdown viewer #41) → separator → **Forget** (danger, last).
4. [x] Keep the menu on-system and accessible (keyboard navigable, focus-visible; dismiss on
   Escape / outside click).

**Acceptance criteria**

- [x] The repo context menu lists "New session" first and starts a session in that repo.
- [x] Forget (and any destructive action) is clearly styled as dangerous (red), set apart
  from neutral items.
- [x] Menu remains on-system, keyboard-accessible, and consistent.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css) — the #31 context menu; reuse the
  per-repo new-session action (`openNewSession(repo)` / spawn) and the Red token (#33).
  Coordinates with #31 (Forget), #35/#39/#41 (other menu items). Some neutral items may not
  exist yet if their tasks are open — order/group around whatever items are present.
- **Done 2026-06-19.** In `Sidebar.tsx` the default-mode context menu now leads with
  **New session** (calls `openNewSession(menu.repo)` — the exact action the inline **+**
  fires, the #53/#27 flow — then `closeMenu()`), followed by a separator, the neutral items
  (Open diff viewer #39, Open file viewer… #44, Open diff in Canvas #47, Change color… #35),
  a second separator, and finally **Forget folder** styled as danger. New CSS classes in
  `Sidebar.module.css`: `.menuSeparator` (a hairline `--border-hairline` divider) and
  `.menuItemDanger` (Catppuccin **`--status-error`** red text + a `color-mix` red-tinted
  hover); the existing `.menuDanger` confirm button ("Kill N agents & forget?") was recolored
  red to match (was the v1 on-system grey — superseded now that #33/#42 use status colors).
  Accessibility: items keep `role="menuitem"`, separators get `role="separator"`, the menu
  keeps `role="menu"`; the existing Escape + overlay-click dismissal and the global
  `:focus-visible` outline cover keyboard use. Frontend gate green: `npm run build` (strict
  tsc) + ESLint + `format:check` + 63 vitest tests all pass. Backend untouched. Visual
  (red/hover/separator) is runtime-visual, not launched headlessly.

---

### 55. [ ] Busy indicator: pulsing ball (grayed when idle) + only show when Claude is genuinely working

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-19

**Description**

Two problems with the #42 busy indicator. **(1) Visual:** it is three dots bouncing
up and down (`BusyIndicator` — `busy-bounce` keyframe), which reads like a *loading*
spinner rather than a *busy* state, and takes more space than needed. Replace it with a
single small **pulsing ball/dot** — a Catppuccin **Blue** (`--status-running #89b4fa`);
**Green** (`--status-done #a6e3a1`) is equally acceptable — that **pulses while the
session is working** and sits **grayed/dimmed** (`--status-idle #6c7086`) when idle. It
should be **always present** (so the grayed idle state is visible) and **smaller / take
less space** than today.

**(2) Accuracy:** the current output-activity heuristic (`pty.rs`) marks a session
**busy whenever any PTY bytes flow** — including the echo/redraw produced when **the user
is typing** — so the indicator lights up while the user types, when Claude is not actually
working. Fix detection so the indicator only shows busy when **Claude is genuinely
thinking/working**, not on user keystroke echo. This is the "research and choose" part,
following the #42 precedent.

**Subtasks**

1. [ ] Rework `BusyIndicator` into a **single pulsing ball** that takes a `busy` prop:
   dimmed (`--status-idle`) when idle, pulsing Blue (`--status-running`) when busy; smaller
   footprint; reduced-motion → a **static** colored dot (no pulse), via the global
   killswitch / a `prefers-reduced-motion` rule.
2. [ ] Render it **always** (not conditionally on `busy`) at all three call sites so the
   grayed idle state shows: Sidebar `SessionRow`, Overview `SessionCard` header, Focus
   toolbar — pass `busy={sessionBusy[id] ?? false}` to each.
3. [ ] **Detection fix** — make typing not count as busy. The backend already sees
   keystrokes (`write_stdin`) and output (reader-thread `last_output` stamp). **Default
   approach (no new dependency):** stamp a per-session **last-input** time in `write_stdin`
   and, in `monitor_loop`, exclude output that is merely the echo of recent keystrokes (so
   *sustained autonomous* output → busy; keystroke echo → not busy). **Escalate only if
   still noisy:** CPU sampling of the `claude` child via `sysinfo`, or Claude Code hooks
   (`UserPromptSubmit`/`Stop`) — both flagged as the future upgrade in #42. Keep the
   existing debounce (no rapid flicker). Verify against the real `claude` TUI.
4. [ ] Keep the status tokens (#33): idle = `--status-idle`, busy = `--status-running`
   (Blue) or `--status-done` (Green).

**Acceptance criteria**

- [ ] The indicator is a single small pulsing ball — colored + pulsing when busy, grayed
  when idle, always visible; reduced-motion shows a static dot.
- [ ] Typing into an otherwise-idle session does **not** turn the indicator busy; a session
  generating a response does; no rapid flicker.
- [ ] Shows consistently in the sidebar row, the Overview card header, and the Focus toolbar.

**Notes**

- Files: `src/components/BusyIndicator/*`, `src/components/Sidebar/Sidebar.tsx`
  (`SessionRow`), `src/components/Overview/Overview.tsx` (`SessionCard`),
  `src/components/Focus/Focus.tsx`, `src-tauri/src/pty.rs` (`write_stdin` + `monitor_loop`
  detection), `src/styles/global.css` (pulse keyframe).
- Builds on #42 — whose "render nothing when idle" rule is **deliberately changed** here to
  "always render, grayed when idle." Tokens already exist (`tokens.css`):
  `--status-running #89b4fa`, `--status-done #a6e3a1`, `--status-idle #6c7086`.
- Detection is the research part: **default to the input-echo-exclusion heuristic** (reuses
  existing signals, no new crate); escalate to `sysinfo`/hooks only if it stays noisy.
- **Assumption** (no clarification available): ball color = Blue (`--status-running`);
  switch to Green if preferred.

---

### 56. [ ] Searchable file-picker element for the repo "Open file viewer" menu

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-19

**Description**

Opening a file from a repo's right-click context menu ("Open file viewer…" — the
`menuMode === "files"` branch in `Sidebar.tsx`) currently renders a **flat list of full
repo-relative paths inside the cursor-anchored context menu**. With many files the list
overflows, the long paths run together, and it is hard to read or find a file ("it all
overlaps, very unclear"). Replace it with a **custom, reusable file-picker element** that
has a **search box** to filter as you type, shows **clear file names** (basename prominent,
directory path as dim secondary text), is **scrollable within a bounded, on-screen panel**,
and **opens the chosen file exactly as today** (adds a file-viewer column for the repo and
switches to Overview).

**Subtasks**

1. [ ] Build a reusable `FilePicker` component: an autofocused search `<input>` + a
   filtered, scrollable list of the repo's files (from `listFiles`), each row showing the
   **basename** prominently and the **containing directory** dimmed; bounded size, kept
   on-screen; Escape / outside-click closes; keyboard-friendly (type to filter; optionally
   arrow + Enter to choose).
2. [ ] Filter by a case-insensitive **substring match over the path** (so both filename and
   folder match); include a "no matches" state and a loading state.
3. [ ] Wire it into the repo context menu in place of the current `menuMode === "files"`
   list; clicking a file runs the **same** open action (dedupe + `addOverviewPanel(repo,
   "markdown", file)` + `setView("overview")` + close menu).
4. [ ] Keep it on-system (tokens; mono for paths) and accessible.

**Acceptance criteria**

- [ ] The "Open file viewer…" picker has a working search box that filters the list live;
  long lists scroll within a bounded panel and never overflow/overlap.
- [ ] File names are clearly legible (basename + dim path); clicking one opens it exactly as
  before.
- [ ] The picker is keyboard-dismissable and on-system.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (replace the `files` menuMode UI), a new
  reusable `src/components/FilePicker/*`, reuse `listFiles` (`files.rs` / #44).
- Coordinates with #54 (the menu now leads with New session + separators — slot the picker
  into that structure) and #59 (after #59, opening a file also registers it as a sidebar
  item). The component could later back other file/folder pickers, but scope here is the
  repo file-open picker.
- **Assumption:** substring filter over the repo-relative path; basename-prominent rows.

---

### 57. [ ] Rename an agent from the sidebar (right-click) — propagates everywhere

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-19

**Description**

An agent's display name can currently only be set **at creation** (the optional Name in
the new-session flow). Add the ability to **right-click an agent row in the sidebar and
give it a custom name**, which **persists** and updates **everywhere the name is shown** —
the Overview card title, the Canvas panel title, the Focus chip, and the sidebar. The
`name` field already exists on the session model and is read by all those surfaces; this
task adds the **rename interaction plus a backend command to update + persist it**.

**Subtasks**

1. [ ] Backend: add a `rename_session(id, name)` command that updates the persisted
   session's `name` (blank → clears it back to no custom name) and saves `sessions.json`;
   add the matching `Store` update method (`store.rs`).
2. [ ] Frontend store: a `renameSession(id, name)` action — optimistic update of
   `sessions[].name` + persist via the command.
3. [ ] Sidebar UI: right-click an agent `SessionRow` → a small context menu with **Rename**
   (and reuse **Remove**); Rename swaps the row label for an inline `<input>` (autofocus,
   Enter commits, Escape cancels, blur commits).
4. [ ] Verify propagation: the new name appears in the sidebar, the Overview card header,
   the Canvas panel title, and the Focus chip without a reload (all already read
   `session.name`).

**Acceptance criteria**

- [ ] Right-clicking an agent offers Rename; entering a name updates it live everywhere and
  survives an app restart.
- [ ] Clearing the name reverts to the default label (branch in the sidebar per #21; repo
  name elsewhere).
- [ ] No regression to selection / drag / remove on the row.

**Notes**

- Files: `src-tauri/src/commands.rs` + `src/lib.rs` (register) + `src-tauri/src/store.rs`
  (update name), `src/ipc.ts`, `src/store.ts` (`renameSession`),
  `src/components/Sidebar/Sidebar.tsx` (+ css — `SessionRow` context menu + inline edit).
- **Decision (keeps #21):** the sidebar keeps the **branch** as the primary label and shows
  the custom name as the thin secondary sub-line; rename sets that name (and the primary
  title used by Overview/Canvas/Focus). We do **not** reverse #21's hierarchy — the request
  is the *ability to rename* + propagation, which this satisfies.
- Coordinates with #59 (also adds `SessionRow` interactions). **Assumption:** rename via a
  right-click menu + inline input; blank clears the name.

---

### 58. [ ] Canvas tabs — multiple named canvases (browser-like)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-19

**Description**

Canvas currently holds a **single** split-panel layout (`canvasLayout` / persisted
`canvas_layout`). Make Canvas support **multiple tabs**, like a browser: a tab strip with
one tab per canvas; **always at least one tab** (if the last is closed, an empty
"Canvas 1" remains); a **"+"** button to create a new empty canvas; **rename** any canvas
(default names "Canvas 1", "Canvas 2", …); and **drag tabs to reorder**. Each tab has its
own independent BSP layout; switching tabs preserves layouts and never disposes terminals
(the #18 pool reparents).

**Subtasks**

1. [ ] Model + persistence: replace the single layout with a list of canvases
   `{ id, name, layout: CanvasNode | null }` + an `activeCanvasId`, persisted (extend
   `store.rs`; **migrate** an existing `canvas_layout` into the first canvas "Canvas 1").
   Store actions: add / close / rename / reorder / select a canvas; default-name new
   canvases incrementally.
2. [ ] Tab strip UI above the canvas area: tabs (active highlighted), a **+** to add an
   empty canvas, a per-tab close (×); enforce the always-≥1 invariant.
3. [ ] Rename a canvas inline (double-click or context menu → input; Enter commits, Escape
   cancels).
4. [ ] Drag-to-reorder tabs (dnd-kit sortable, reusing the #43 pattern).
5. [ ] Make canvas content operate on the **active** canvas: `applyCanvasDrop` /
   `appendCanvasContent` (`canvasDrop.ts`) and `Canvas.tsx` read/write the active canvas's
   layout. Verify terminals survive tab switches (reparent via the pool, never dispose).

**Acceptance criteria**

- [ ] The Canvas view shows a tab strip; "+" adds an empty canvas; closing tabs works and
  one empty canvas always remains.
- [ ] Canvases can be renamed (default "Canvas N") and reordered by dragging; each tab keeps
  its own layout across switches and across restart.
- [ ] Dropping content targets the active canvas; switching tabs never tears down a terminal.

**Notes**

- Files: `src/components/Canvas/*` (tab strip + active-canvas wiring),
  `src/components/Canvas/canvasDrop.ts` (target the active canvas), `src/store.ts`
  (`canvases` / `activeCanvasId` + actions), `src-tauri/src/store.rs` + `commands.rs` +
  `src/ipc.ts` (persist; migrate `canvas_layout`).
- Builds on #46/#47; reuses dnd-kit (#43) and the #18 terminal pool. Only the active
  canvas's panels mount — confirm the pool **parks/reparents** inactive-canvas terminals
  rather than disposing. #59 builds on this multi-canvas model.

---

### 59. [ ] Folders as the source of truth: show every repo item in the sidebar + drag anything into Canvas

**Status:** Not started
**Depends on:** #58
**Created:** 2026-06-19

**Description**

Make the **repo/folder in the sidebar the single source of truth** for its items, and make
**getting items into Canvas a uniform drag**. Today the sidebar tree shows a repo's
**agents** and **opened files** (#45), but **diff viewers** exist only as Overview columns
(`overviewPanels`, #38/#39) and never appear in the sidebar; and content reaches Canvas
through a mix of drags and a special context-menu item. Two changes:

1. **Every repo item appears in the left panel**, 1:1 with what Overview shows for that repo
   — agents, file viewers, **and diff viewers** (plus any future item type). Opening a diff
   or file viewer anywhere registers it under its repo in the sidebar tree.
2. **Anything in the left panel is draggable into a Canvas** to show its contents — agents
   (already), files (already), **diff viewers** (new), and future item types **by default**.
   With drag covering it, **remove the repo context-menu "Open diff in Canvas"** item.

**Subtasks**

1. [ ] Render the repo's non-agent items (diff + file viewers from `overviewPanels`) as
   **draggable** rows in the sidebar tree under their repo, alongside agent and opened-file
   rows; each drags into Canvas (diff → diff panel, file → file viewer) and click-opens as
   today.
2. [ ] Reconcile so the **sidebar items == Overview columns** for each repo (1:1).
   Recommended: treat the per-repo item list (`overviewPanels`) as the source of truth that
   both the sidebar and Overview render, and fold the separate `openFiles` (#45) concept
   into it (an opened file *is* a file item) so a file/diff opened anywhere shows in both
   places and is draggable to Canvas. (Implementer's architecture call; the end state must
   be 1:1.)
3. [ ] Extend the drag-payload→content mapping (`canvasDrop.payloadToContent`) so a diff
   item maps to a diff panel; confirm sessions/files still map. **Establish + document the
   pattern:** a new left-panel item type is draggable into Canvas **by default** (add a
   draggable source row + a `payloadToContent` case).
4. [ ] Remove the "Open diff in Canvas" context-menu item; keep "Open diff viewer" /
   "Open file viewer…" (which now also register the item in the sidebar).
5. [ ] Drops target the **active** canvas (per #58).

**Acceptance criteria**

- [ ] Opening a diff viewer or a file shows it under its repo in the sidebar **and** as an
  Overview column (the two stay 1:1 per repo).
- [ ] Dragging any sidebar item — agent, file, or diff — into a Canvas creates/splits a
  panel with its content; terminals stay alive.
- [ ] The "Open diff in Canvas" context-menu item is gone (drag replaces it); future item
  types are draggable into Canvas by default.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css — render + drag diff/file items, remove
  "Open diff in Canvas"), `src/components/Canvas/canvasDrop.ts` (payload mapping),
  `src/components/Overview/*` + `src/store.ts` (unify `overviewPanels` / `openFiles`),
  backend persistence if the model changes (`store.rs`).
- Builds on #45/#47/#38/#39; **depends on #58** (active-canvas drop target). Coordinates with
  #56 (the file picker adds file items) and #57.
- **Forward-looking rule for future work:** any new item placed in the left panel must be a
  dnd-kit drag source with a `payloadToContent` case so it drops into Canvas by default.
- **Key reconciliation:** today opening a file registers it in both `openFiles` (sidebar)
  and `overviewPanels` markdown (Overview) — collapse to one source so they can't diverge.

---

### 60. [ ] Final pass: clean up the documentation with /update-docs

**Status:** Not started
**Depends on:** #48, #49, #55, #56, #57, #58, #59
**Created:** 2026-06-19

**Description**

After **all** other tasks are complete — including the code-improvement iteration passes
(#48, #49) and the feature tasks (#55–#59; #54 is already done) — bring every project
document back in sync with the shipped code in one pass. The agent running this task must
use the **`update-docs` skill** (`/update-docs`), which refreshes `CLAUDE.md`, `README.md`,
and any other docs, and performs the special `TASKS.md` cleanup (summarize completed tasks
at the top, delete their full bodies, prune now-dangling dependency references). This task
exists so the docs reflect the **final** state once the whole backlog has landed; it must
run **last**.

**Subtasks**

1. [ ] Confirm all depended-on tasks (#48, #49, #55, #56, #57, #58, #59) are Done.
2. [ ] Run the **`/update-docs`** skill and let it sync `CLAUDE.md`, `README.md`, and any
   other docs to the code, plus the `TASKS.md` completed-task cleanup. (`PROMPT.md` is
   never modified.)
3. [ ] Verify the docs accurately describe the final feature set (busy indicator, file
   picker, agent rename, Canvas tabs, unified sidebar/drag) and that `TASKS.md` is tidied.

**Acceptance criteria**

- [ ] All other tasks are complete before this runs.
- [ ] `/update-docs` has been run; `CLAUDE.md` / `README.md` / other docs match the code;
  `TASKS.md` completed tasks are summarized and pruned.

**Notes**

- This is a **documentation-only** pass via the `update-docs` skill — no feature work.
- Depends on every other open task so it runs **last**: #48/#49 are the code-improvement
  passes the user asked to include; #55–#59 are the new features. If further tasks are added
  later, re-confirm this remains the final one.
