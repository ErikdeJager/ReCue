### 185. [x] Activity dot blinks yellow when focusing / leaving a busy agent

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

When an agent is actively working its `BusyIndicator` dot should stay **blue** (the
"working" shimmer, #42/#88). Today it **blinks yellow** — the #112 "finished — needs
input" settled state — for a moment, then returns to blue, in two situations:

1. **Clicking / focusing** an agent panel or card while it is working.
2. **Switching away** from a currently-selected, working agent (user-reported
   refinement, 2026-06-26).

This wrongly signals "needs your input" while the agent is still busy, and is
distracting.

**Root cause (grounded in the code).** The blink is a *real, transient backend state
change*, not a render glitch. `sessionBusy` (the map that drives the dot) is written in
exactly one place — `setBusy` (`src/store.ts:1313`) — which is called in exactly one
place — the `onState` handler (`src/store.ts:1453`) reacting to the backend
`session://state` event. So the dot going yellow means the backend monitor genuinely
emitted `busy:false` for one cycle, and `BusyIndicator` (`src/components/BusyIndicator/
BusyIndicator.tsx:34`, `settled = !busy && hasBeenActive`) faithfully renders it yellow.

The backend busy heuristic lives in `monitor_loop` (`src-tauri/src/pty.rs`, ~line 704):

```
busy = has_work
    && out != 0
    && (now - out) < BUSY_WINDOW_MS              // 700ms — recent output
    && (inp == 0 || (out - inp) >= INPUT_ECHO_MS); // 300ms — output AFTER the last input
```

The last clause is the **#55 keystroke-echo guard**: output arriving within
`INPUT_ECHO_MS` (300ms) *after* the last input is assumed to be the terminal echoing the
user's typing, not Claude working. `last_input` is stamped by `write_stdin`
(`src-tauri/src/pty.rs:362`) for **every** byte written to the PTY.

But xterm forwards more than keystrokes through `onData`
(`src/components/Terminal/terminalPool.ts:208` → `writeStdin` → `write_stdin`): it also
sends terminal-protocol **reports** that Claude's TUI requests via DECSET —
**mouse-event reports** (a click landing inside the terminal area; the pool comment at
`terminalPool.ts:164` explicitly acknowledges "claude's own mouse handling") and
**focus in / out reports** (`\x1b[I` / `\x1b[O`, emitted when the xterm gains / loses DOM
focus, DECSET 1004).

So when the user **focuses / clicks into** an agent (focus-in + a mouse press/release
report) or **switches away** from one (focus-out report), those report bytes are written
to the PTY and `last_input` is stamped *as if the user had typed*. The agent's in-flight
output then falls inside the 300ms echo window, is misclassified as keystroke echo →
`busy = false` for ~one 200ms monitor tick → the dot renders yellow → the next output
(>300ms after the stamp) flips it back to blue. The "switching away also triggers it"
symptom specifically requires the **focus-out** report on the agent being left (that
agent's output keeps flowing regardless of focus; only an input stamp can drop it to
idle), confirming focus reporting as a cause alongside mouse reports.

**Fix (targeted — confirmed with the user over an idle-debounce alternative).** Treat
these *automatic* terminal-protocol reports as **not user input** for the busy
heuristic. In `write_stdin`, still forward the bytes to the PTY unchanged (Claude needs
mouse + focus events), but **skip stamping `last_input`** when the written data consists
**solely** of such reports. Real keystrokes (printable text, Enter, control codes,
arrow / function keys, paste) continue to stamp `last_input`, so the #55 echo
suppression for *actual typing* is fully preserved.

**Scope.** Backend-only (`src-tauri/src/pty.rs`). No frontend change. **Out of scope:**
do **not** disable mouse / focus reporting or change what xterm forwards (that would
break Claude's mouse handling); do **not** touch `BusyIndicator`, the store, the
`INPUT_ECHO_MS` / `BUSY_WINDOW_MS` constants, or add idle-debounce / hysteresis (the user
chose the targeted fix over a debounce, so the timing of the *genuine* yellow transition
must stay unchanged).

**Subtasks**

1. [x] Add a pure helper in `src-tauri/src/pty.rs`, e.g. `fn is_noninput_report(data: &str) -> bool`, that returns `true` iff `data` is non-empty and consists **entirely** of one or more recognized automatic terminal reports:
   - [x] Focus reports: exactly `ESC [ I` (`\x1b[I`, focus in) and `ESC [ O` (`\x1b[O`, focus out).
   - [x] SGR mouse (DECSET 1006, the modern default): `ESC [ <` followed by digits/`;` and terminated by `M` (press) or `m` (release) — e.g. `\x1b[<0;12;5M`.
   - [x] X10 / normal mouse (DECSET 1000/1002/1003): `ESC [ M` followed by exactly 3 bytes (button, x, y).
   - [x] Match one-or-more such sequences back-to-back; if **any** byte falls outside a recognized report, return `false` (treat as input — never risk suppressing a real keystroke).
   - [x] Be conservative about false positives: CSI arrows `\x1b[A/B/C/D`, SS3 keys `\x1bO…` (note these have **no** `[`, so they're distinct from focus-out `\x1b[O` = CSI-O), function / Home / End `\x1b[…~`, a lone Escape `\x1b`, Enter `\r` / `\n`, and any printable text must all return `false`.
   - Implemented as `is_noninput_report` + a `consume_report` helper (consumes one recognized CSI report and returns its byte length); `is_noninput_report` loops until the whole string is consumed or a byte falls outside a report.
2. [x] In `write_stdin` (`src-tauri/src/pty.rs`): write `data` to the PTY unconditionally as today, but only stamp `last_input` when `!is_noninput_report(data)`. Added a comment tying this to #55 + #185.
3. [x] Unit tests for `is_noninput_report` (`is_noninput_report_matches_automatic_reports_only`) — positive: focus in/out, SGR press/release, X10 mouse, focus-in + mouse concatenated. Negative: `"ls\n"`, `"\r"`, arrow `"\x1b[A"`, SS3 `"\x1bOA"`, lone `"\x1b"`, empty, `"\x1b[Ix"`, and a `CSI ~` function sequence `"\x1b[3~"`.
4. [x] Integration tests mirroring the existing busy tests: `focus_report_does_not_blink_busy_to_idle` (a seeded, continuously-working session sent a focus-in report stays busy — no idle edge) and the contrast `real_keystroke_still_suppresses_echo_after_fix` (the same session sent a real `"x"` still produces the #55 echo-suppression idle edge), proving the fix narrows only automatic reports.
5. [~] Verify at runtime which exact sequences Claude emits — **not performed in this autonomous loop** (no interactive `tauri dev` / human session available; see Notes). Mitigated by the matcher covering the full DECSET report superset (focus 1004 + X10 1000/1002/1003 + SGR 1006), which the plan deemed the safe, correct-even-if-a-different-subset-is-enabled approach. No temporary logging was added (so none to remove).
6. [x] Ran all gates — see Acceptance criteria + Notes (one pre-existing, unrelated `format:check` warning documented).

**Acceptance criteria**

- [x] Clicking into / focusing a **working (blue)** agent does **not** blink its dot yellow. _(Focus-in/mouse reports no longer stamp `last_input`; covered by `focus_report_does_not_blink_busy_to_idle`.)_
- [x] **Switching away** from a working (blue) agent does **not** blink that agent's dot yellow. _(Focus-out `ESC [ O` is matched alongside focus-in/mouse, so the same code path covers it.)_
- [x] Typing into an agent still does **not** read as busy from the echo of the keystrokes (#55 preserved). _(`typing_echo_does_not_read_as_busy` + `real_keystroke_still_suppresses_echo_after_fix` still pass.)_
- [x] A genuine end-of-turn busy→idle still shows the yellow "finished — needs input" dot (#112 preserved), with unchanged timing. _(No change to `monitor_loop`, the constants, the store, or `BusyIndicator`; `busy_state_tracks_output_then_goes_idle` still passes.)_
- [x] `is_noninput_report` unit tests pass and the existing `pty.rs` busy tests still pass. _(83 Rust tests pass.)_
- [x] All gates green: `npm run build`, `npm run lint`, `npm test`, `cargo test`, `npm run lint:rust`, `npm run format:rust`, `npm run format:check` — green for everything touched by #185. The only `format:check` warning is on `src/components/markdownCheckboxes.tsx`, a **pre-existing** issue committed by #182 (`affaf6d`), untouched by this backend-only task (see Notes).

**Notes**

- **User Q&A (2026-06-26):** chose the **Targeted** fix (ignore non-keystroke reports in the busy heuristic) over an idle-debounce or doing both. ⇒ No hysteresis / debounce; the genuine yellow transition's timing stays as-is.
- **User refinement (2026-06-26):** "it also happens when switching AWAY from an already selected agent" — this pins **focus-out** reporting as a cause; the fix covers focus in/out **and** mouse reports together.
- The blink is purely backend-state-driven: `sessionBusy` is written only by `setBusy` (`store.ts:1313`) ← `onState` (`store.ts:1453`) ← `session://state`; `BusyIndicator` (`BusyIndicator.tsx:34`) just renders `!busy && hasBeenActive` as yellow. **No frontend change is needed or wanted.**
- Mouse reporting is **confirmed** in use (`terminalPool.ts:164` comment). Focus reporting (DECSET 1004) is **inferred** from the "switch away" symptom; subtask 5 confirms the exact sequences at runtime. The matcher covers focus + SGR + X10 mouse to stay correct even if Claude enables a different subset.
- **Do not** disable focus / mouse reporting or alter what xterm forwards to the PTY — Claude relies on it. The fix only changes whether those reports count as "user input" for the busy/idle heuristic.
- Keep `is_noninput_report` **conservative**: when in doubt, classify as input (stamp). Wrongly suppressing a real keystroke's echo-guard would resurrect #55's "typing reads as busy" bug, which is worse than an occasional missed report.
- Relevant prior art / context: #42 (busy indicator), #55 (echo-aware "typing ≠ busy" detection), #88 (shimmer), #112 (yellow third state), #116 (`has_work` / seeded). Key files: `src-tauri/src/pty.rs` (`write_stdin`, `monitor_loop`, `last_input`, `INPUT_ECHO_MS`), `src/components/Terminal/terminalPool.ts:208`, `src/components/BusyIndicator/BusyIndicator.tsx`, `src/store.ts:1313`/`:1453`.

**Implementation notes (2026-06-26 — done)**

- The fix is exactly the targeted approach from the plan: `write_stdin` now guards the
  `last_input` stamp with `if !is_noninput_report(data)`. The bytes are still written to
  the PTY unconditionally (Claude keeps receiving mouse + focus events). Backend-only —
  no frontend / store / `BusyIndicator` / constant changes, so the genuine yellow
  transition's timing is unchanged.
- `is_noninput_report` returns true only when the **whole** string is a back-to-back run
  of recognized CSI reports: focus in/out (`ESC [ I` / `ESC [ O`), SGR mouse
  (`ESC [ < …digits/';'… M|m`), and X10 mouse (`ESC [ M` + exactly 3 payload bytes). Any
  stray byte → `false` (treated as input), so a real keystroke's echo guard is never
  suppressed. SS3 keys (`ESC O …`, no `[`) are intentionally distinct from focus-out
  (`ESC [ O`) and classify as input.
- **Subtask 5 not runtime-verified** in this loop: there is no interactive `tauri dev` /
  human session to observe the exact sequences Claude emits on click / focus-out. The
  matcher deliberately covers the full DECSET report superset (1004 focus + 1000/1002/1003
  X10 + 1006 SGR), which the plan called the safe choice precisely so it stays correct
  regardless of which subset `claude` enables. Worst case if a future `claude` uses an
  unmatched report form: that report would (as before this task) still count as input and
  could blink the dot — i.e. it degrades to today's behavior, never worse. A follow-up
  could confirm the exact bytes at runtime, but no code change is expected.
- **Pre-existing unrelated gate warning:** `npm run format:check` flags
  `src/components/markdownCheckboxes.tsx` (a wrapped long function signature). This file
  was committed by task #182 (`affaf6d`) and is **not** touched by #185; it was left as-is
  to keep this commit scoped to the backend change. It should be cleaned up separately
  (e.g. `npm run format`).
