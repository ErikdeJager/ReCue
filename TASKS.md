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

### 23. [ ] Show a border/highlight around the selected agent in Overview

**Status:** Not started
**Depends on:** #22
**Created:** 2026-06-18

**Description**

In Overview there's no indication of which agent is "current." Add a clear
**border/highlight** around the selected agent's card (where
`session.id === selectedId`). Depends on #22 so selecting doesn't immediately leave
Overview.

**Subtasks**

1. [ ] Pass `selected` into `SessionCard` (`selectedId === session.id`) in
   `src/components/Overview/Overview.tsx`.
2. [ ] Add a selected style in `Overview.module.css` — an accent border (`--accent`)
   consistent with the sidebar's selected treatment; on-system tokens only.
3. [ ] Clicking a card body selects it (highlight follows clicks) without forcing
   Focus (the Expand button still goes to Focus).

**Acceptance criteria**

- [ ] The selected agent card has a clear, on-brand border in Overview.
- [ ] The highlight stays in sync with sidebar selection and keyboard nav (#24).

**Notes**

- Files: `src/components/Overview/Overview.tsx`, `.../Overview.module.css`. Use the
  existing accent tokens; match the sidebar selected look for consistency.

---

### 24. [ ] Keyboard navigation: Shift+arrows to move between agents and switch views

**Status:** Not started
**Depends on:** #22, #23
**Created:** 2026-06-18

**Description**

Add global keyboard navigation:

- **Shift+← / Shift+→** — move selection to the previous/next agent (in displayed
  left-to-right order). Works in **both** Overview and Focus.
- **Shift+↓** — switch to **Focus** on the selected agent.
- **Shift+↑** — switch back to **Overview** (keeping the agent selected).

**Subtasks**

1. [ ] Add an app-level key handler for the four Shift+Arrow combos that updates
   `selectedId` (prev/next) and `view` (↑ overview / ↓ focus).
2. [ ] Agent order = the Overview wall order (`sessions` array) so left/right matches
   what the user sees. Wrap-around at the ends (cycle); if nothing is selected,
   Shift+→/← selects the first.
3. [ ] **Precedence over the terminal:** xterm captures keystrokes when focused, so
   intercept Shift+Arrow before xterm forwards them to the PTY (e.g.
   `attachCustomKeyEventHandler` on xterm instances, or a capture-phase window
   listener that stops propagation for these combos). Normal typing (incl.
   Shift+letters) unaffected.
4. [ ] Don't navigate while the new-session popover (#27) is open.

**Acceptance criteria**

- [ ] Shift+←/→ cycles the selected agent in both views; Shift+↓ focuses it, Shift+↑
  returns to Overview.
- [ ] Works even while a terminal is focused, without corrupting terminal input.
- [ ] No interference with normal typing or the new-session popover.

**Notes**

- Files: an app-level key hook (e.g. `src/App.tsx` or a small hook), `src/store.ts`
  (selection/view), `src/components/Terminal/Terminal.tsx`
  (`attachCustomKeyEventHandler` if needed). Builds on #22 (selection decoupled) and
  #23 (highlight). Only intercept the four Shift+Arrow combos so `claude`'s own
  Shift usage (e.g. Shift+Tab) is untouched.

---

### 25. [ ] Move the Overview/Focus toggle into the sidebar, always visible

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-18

**Description**

The Overview/Focus segmented control (`ViewSwitch`) currently lives only in the
**Focus** toolbar (`src/components/Focus/Focus.tsx`), so it's unreachable from
Overview. Move it into the **sidebar, directly under the New session button**, where
it's **always visible** (both views) for one-click switching.

**Subtasks**

1. [ ] Render `ViewSwitch` in the sidebar beneath the New session button; remove it
   from the Focus toolbar.
2. [ ] Always show it. Switching to **Focus** with nothing selected focuses the
   **last-selected** agent (or the first available); remember the last view so the
   toggle reflects state. With zero agents, Focus is a no-op/disabled.
3. [ ] Style to the sidebar width (full-width segmented control, on-system tokens).

**Acceptance criteria**

- [ ] The toggle sits under the New session button, visible in both views.
- [ ] Clicking Focus with no explicit selection focuses the last-selected/first agent.
- [ ] Removed cleanly from the Focus toolbar; styling matches the sidebar.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), `src/components/ViewSwitch/*`,
  `src/components/Focus/Focus.tsx`, `src/store.ts`. Coordinates with #26 (also edits
  the sidebar header) and #24 (view switching).

---

### 26. [ ] Slimmer New session button + ⌘N shortcut

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-18

**Description**

The New session button is too tall/bulky. Make it **thinner and cleaner**, and add a
**⌘N** global shortcut to open the new-session flow.

**Subtasks**

1. [ ] Slim `.newButton` in `Sidebar.module.css` (less padding/height; keep it clearly
   the primary action, on-system tokens).
2. [ ] Add a global **⌘N** handler that opens the new-session flow (`openNewSession()`);
   don't fire disruptively while typing in an input/terminal; no-op when the popover
   is already open.
3. [ ] Optionally show a subtle ⌘N hint on the button.

**Acceptance criteria**

- [ ] The button is visibly slimmer/cleaner and still obviously primary.
- [ ] ⌘N opens the new-session flow from anywhere in the app.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), an app-level key hook,
  `src/store.ts` (`openNewSession`). Coordinates with #25 (toggle under this button)
  and #27 (the flow this opens). Verify ⌘N doesn't collide with a native binding.

---

### 27. [ ] New session as a compact bottom-left popover with branch auto-detect

**Status:** Not started
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

1. [ ] **Popover UI:** replace the full-screen overlay with a small popover anchored
   bottom-left over the sidebar (on-system surface + the single popover shadow); close
   on Escape / outside click. Keep the folder picker + recent-folder chips + the
   **optional name** field (feeds the thin sub-text from #21). Preserve autofocus +
   Enter-to-create.
2. [ ] **Branch detection (backend):** add a read-only command to **list local
   branches** for a folder (e.g. `list_branches(cwd)` in `src-tauri/src/git.rs`) + a
   typed IPC wrapper. Non-git folders return empty (fall back to "just spawn here").
3. [ ] **Branch picker (frontend):** when the folder is a git repo, show its branches
   as selectable options with the current branch indicated; default to current.
4. [ ] **Checkout on create (backend):** add a `checkout_branch(cwd, branch)` command
   (the first git *write*) running `git checkout <branch>`; surface a typed error on
   failure (e.g. dirty-tree conflict) without crashing. Spawn the agent only after a
   successful checkout.
5. [ ] **Destructive warning:** show a clear inline warning **only when** the chosen
   branch differs from the folder's current branch **and** ≥1 agent is already running
   in that folder — explaining the checkout may disrupt that agent. Require
   acknowledgement to proceed.
6. [ ] Update capabilities/docs as needed; keep the diff inspector working after a
   checkout.

**Acceptance criteria**

- [ ] New session opens as a small bottom-left popover over the sidebar, not a
  full-screen modal.
- [ ] Selecting a git folder lists its branches; picking one checks it out then starts
  the agent there.
- [ ] The disruptive-checkout warning appears exactly when branch ≠ current AND an
  agent is already running in that folder, and is acknowledged before proceeding.
- [ ] Non-git folders still work (spawn in the folder, no branch UI). Build/lint/tests
  green.

**Notes**

- Files: `src/components/NewSessionModal/*` (becomes the popover), `src/store.ts`
  (`openNewSession`/`spawnSession`), `src/ipc.ts`, `src-tauri/src/git.rs`
  (+ `list_branches`, `checkout_branch`), `src-tauri/src/commands.rs`,
  `src-tauri/src/lib.rs` (register commands), `src-tauri/capabilities/default.json` if
  needed. **Scope note:** first intentional git write — document it in `CLAUDE.md`
  (the "No git writes" note) as a deliberate change. Related: #21 (naming/sub-text),
  #26 (⌘N opens this).

---

### 28. [ ] Session chip copies a "resume" command, not the bare session id

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-18

**Description**

The Focus session chip copies the raw session id
(`copyToClipboard(session.id, "session id")` in `src/components/Focus/Focus.tsx`).
Instead, copy a ready-to-run command that resumes the chat, so pasting it into a
terminal restarts the session: **`claude --resume <session-id>`**.

**Subtasks**

1. [ ] Change the chip's copy action to copy `claude --resume <session.id>` (the
   `claude_session_id`/`id` are the same by design in `pty.rs`).
2. [ ] Update the toast/label to reflect that a resume command was copied.
3. [ ] Make any other copyable session-id surface consistent.

**Acceptance criteria**

- [ ] Clicking the chip copies `claude --resume <id>`; pasting it in a terminal
  resumes that conversation.
- [ ] Toast confirms the resume command was copied.

**Notes**

- Files: `src/components/Focus/Focus.tsx`, `src/store.ts` (`copyToClipboard`). The
  resume flag must match the backend's boot resume (`pty.rs::resume_session` →
  `claude --resume <id>`); keep them consistent (see #30).

---

### 29. [ ] Auto-refresh the git diff inspector (no manual refresh needed)

**Status:** Not started
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

1. [ ] Add interval polling in `DiffInspector` (only while `active` && document
   visible); clear on close/hide/unmount; avoid overlapping in-flight fetches.
2. [ ] Skip redundant churn: don't reset the panel/selection on each poll when the
   diff is unchanged (preserve `selectedFile` + scroll; consider a cheap content
   hash). The refresh is invisible when nothing changed.
3. [ ] Pause on `document.hidden`; resume on focus/visibility regain.
4. [ ] Keep the manual Refresh button.

**Acceptance criteria**

- [ ] With the inspector open, agent edits appear within ~2s with no manual refresh.
- [ ] Polling stops when the inspector is closed or the window is hidden.
- [ ] No flicker / selection loss when the diff is unchanged.

**Notes**

- Files: `src/components/DiffInspector/DiffInspector.tsx`, `src/ipc.ts` (`workingDiff`),
  `src-tauri/src/git.rs` (`working_diff`). Honors the #16/#17 punch-list item
  ("DiffInspector manual-Refresh staleness").

---

### 30. [ ] Restore sessions live on startup — stop showing every agent as an error

**Status:** Not started
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

1. [ ] **Verify the real `claude` resume contract** (run it): confirm new =
   `claude --session-id <uuid>` and resume = `claude --resume <uuid>` actually
   round-trip; adjust `pty.rs::spawn_session`/`resume_session` if they differ and
   record the verified flags in `CLAUDE.md`/notes.
2. [ ] **No error during reconnect.** While a persisted session is resuming (PTY not up
   yet), show a neutral "reconnecting…" state, not "Process exited". Only show the
   exit/error state on an *actual* failure after the resume attempt completes.
3. [ ] **Tie persistence to "open at close".** Confirm the persisted set reflects
   sessions open at close (persisted on spawn / forgotten on Remove) and that app
   shutdown kills children cleanly (no orphans — see #31) so the set is accurate.
4. [ ] **Surface real failures gracefully** per-session with a retry (e.g. claude
   missing, folder gone), not a blanket error wall.
5. [ ] Re-test the full quit → relaunch cycle with real sessions.

**Acceptance criteria**

- [ ] After quit + relaunch, previously-open agents come back as **live, resumed**
  terminals (not errors).
- [ ] A transient reconnect window shows "reconnecting", not an error.
- [ ] Genuine failures show per-session with a retry; the rest still resume.

**Notes**

- Files: `src-tauri/src/lib.rs` (boot resume thread), `src-tauri/src/pty.rs`
  (`spawn_session`/`resume_session` flags), `src/components/Terminal/Terminal.tsx`
  (reconnecting vs exited UI), `src/store.ts` (lifecycle/toasts). Resolves #5's "flags
  assumed, not verified" caveat. Pairs with #18 (terminals stay mounted) and #32
  (don't double-toast exits).

---

### 31. [ ] Right-click a sidebar repo → "Forget" (kill its agents, no orphans)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-18

**Description**

There's no way to remove a repo/folder from the sidebar. Add a **context menu**
(right-click a repo header) with a **Forget** action that removes the folder from the
sidebar and **kills + forgets all of its sessions**. If any agent is running, **confirm
first**; closing must terminate every child process so no orphan `claude` processes are
left behind. (A context menu is used so more per-repo actions can be added later.)

**Subtasks**

1. [ ] Add a right-click context menu on the repo header in
   `src/components/Sidebar/Sidebar.tsx` (on-system styling + the single popover
   shadow; keyboard-dismissable). One item for now: **Forget**.
2. [ ] **Forget** = remove the folder from `recents` **and** kill+forget every session
   in that repo. Add a store action (e.g. `forgetRepo(repoPath)`) that kills each
   session (`kill_session`) and drops the repo from recents, then updates the store.
3. [ ] **Confirm when agents run:** if the repo has ≥1 running agent, confirm ("Kill N
   running agent(s) and forget this folder?") before proceeding.
4. [ ] **No orphans:** ensure every child PTY is killed (reuse `kill_session`); verify
   no `claude` processes survive. (Also confirm clean shutdown on app quit.)
5. [ ] Persist the removal so the folder doesn't reappear after restart.

**Acceptance criteria**

- [ ] Right-clicking a repo shows a context menu with Forget.
- [ ] Forget removes the folder and kills all its agents; with agents running it
  confirms first.
- [ ] No orphan processes remain; the folder stays gone after restart.

**Notes**

- Files: `src/components/Sidebar/Sidebar.tsx` (+ css), `src/store.ts` (`forgetRepo`,
  recents), `src/ipc.ts`, `src-tauri/src/commands.rs` + `src-tauri/src/store.rs` (a
  command to remove a recent dir — new backend surface; `store.rs` only adds/dedups
  recents today), `src-tauri/src/pty.rs` (`kill_session`). Coordinates with #20
  (ordering) and #30 (clean shutdown / no orphans).

---

### 32. [ ] One toast on close, and move all toasts to the bottom-right

**Status:** Not started
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

1. [ ] **Single subscription:** make `init`/`subscribeSessionEvents` idempotent — use
   the returned unlisten fn (clean up in the effect) or guard so only one set of
   listeners is ever active. Verify only one `exited` handler runs.
2. [ ] **De-dupe close notifications:** when a session is intentionally removed/killed,
   suppress the generic "Session exited" toast (the "Session removed" toast suffices);
   keep a single toast for *unexpected* exits.
3. [ ] **Bottom-right position:** move `.toaster` (`Toaster.module.css`) from
   bottom-center to bottom-right, stacked **above** the existing `UpdatePopup` (already
   bottom-right at `right/bottom: 24px`) so they don't overlap.

**Acceptance criteria**

- [ ] Closing an agent shows exactly one notification (no duplicate "exited" toast).
- [ ] Unexpected exits still toast once.
- [ ] All toasts appear bottom-right and don't collide with the update popup.

**Notes**

- Files: `src/main.tsx` (StrictMode), `src/App.tsx` + `src/store.ts` (`init`,
  `subscribeSessionEvents`, toasts), `src/ipc.ts` (`subscribeSessionEvents` already
  returns an unlisten fn), `src/components/Toaster/Toaster.module.css`,
  `src/components/UpdatePopup/UpdatePopup.module.css` (coordinate stacking). Don't
  remove StrictMode — fix the subscription lifecycle instead.
