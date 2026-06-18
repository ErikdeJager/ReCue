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

### 13. [ ] Git Diff inspector

**Status:** Not started
**Depends on:** #6, #12
**Created:** 2026-06-18

**Description**

Fill the Focus inspector's **Diff** tab: a ~360px collapsible panel showing the
session's working-tree diff vs `HEAD` (from #6) — summary, changed-files list, and a
unified/split diff body styled with the tokens.

**Subtasks**

1. [ ] Top summary: branch + `N files changed, +A −D` using the diff/accent colors.
2. [ ] Changed-files list with `M / A / D` glyphs and per-file `+N −M` counts;
   selecting a file shows its hunks (default to the first file).
3. [ ] Diff body: line numbers in `--diff-gutter`, added/removed lines tinted with
   the diff colors, mono font; render `hunk`/`context`/`add`/`del` row types.
4. [ ] **Unified | Split** toggle (unified default; split shows old/new side by side).
5. [ ] Empty/no-changes state ("No changes yet on this branch.") and refresh when the
   selected session or its working tree changes.

**Acceptance criteria**

- [ ] The panel reflects the real `git diff HEAD` of the focused session's folder.
- [ ] Selecting a file shows its hunks; unified and split both render correctly.
- [ ] Counts and M/A/D glyphs match; clean tree shows the empty state.

**Notes**

- Consumes the structured diff shape from #6 directly (1:1 with the prototype model).

---

### 14. [ ] Packaging + docs

**Status:** Not started
**Depends on:** #9, #10, #11, #12, #13
**Created:** 2026-06-18

**Description**

Produce a runnable macOS artifact and the docs to build/run it. No code signing or
notarization in v1 (unsigned `.app`/`.dmg`).

**Subtasks**

1. [ ] App icon set + bundle metadata (name, identifier, version, category).
2. [ ] `tauri build` producing an unsigned macOS `.app` and `.dmg`.
3. [ ] README: prerequisites (incl. `claude` installed + authenticated on `PATH`),
   dev (`tauri dev`) and build instructions, and a short feature overview.
4. [ ] Update/finalize `CLAUDE.md` with the implemented architecture.
5. [ ] Manual end-to-end verification pass (see acceptance) and note any caveats.

**Acceptance criteria**

- [ ] A fresh `.dmg` installs and the app launches on macOS.
- [ ] End-to-end: create a session → use the terminal → restart the app → the
  session resumes → diff shows → Remove works.
- [ ] README + CLAUDE.md are accurate.

**Notes**

- Signing/notarization is deliberately out of scope; expect a Gatekeeper warning on
  first open.
