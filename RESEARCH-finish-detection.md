# Research: hook-based "agent finished" detection for the Attention queue

**Status:** research only — no implementation. Recommendation + open questions below.
**Branch:** `research/finish-hooks`
**Question:** Can we replace/augment ReCue's terminal-activity heuristic (which today decides an
agent is "finished / awaiting input") with a real completion **hook**, per supported agent —
keeping the heuristic as a fallback?

---

## TL;DR

- **First, separate two events.** "Process **exited**" (the PTY child died) is *already*
  first-class in ReCue via the exit-waiter thread (`SessionEvent::Exited`) — it does **not**
  need a hook. The thing the Attention queue actually wants is **"turn finished / awaiting
  input"** while the process keeps running. That is what the heuristic approximates and what a
  hook can make exact.
- **Claude Code — YES, strong.** The `Stop` hook fires *"when Claude finishes responding."* A
  companion `Notification` hook further distinguishes **`idle_prompt`** (done, awaiting input)
  from **`permission_prompt`** (blocked on an approval). It can be injected **per session** via
  `--settings` **without touching the user's own config**, and — because ReCue already spawns
  `claude --session-id <uuid>` — the hook payload's `session_id` maps **1:1** to a ReCue
  session. This is a clean, deterministic win over the 700 ms heuristic.
- **Codex — YES, weaker.** A `notify` program fires on `agent-turn-complete`, and a newer
  Claude-style `Stop` / `PermissionRequest` hooks system exists. Injectable via `-c` overrides.
  But `notify` can't tell "done" from "needs approval," the hooks system is newer/churnier, and
  ReCue already gates Codex heavily (no resume/auto-name).
- **OpenCode — YES, churny.** A `session.idle` bus event (done) vs `permission.updated`
  (approval), reachable from the **TUI** via a JS **plugin** injected with `OPENCODE_CONFIG_DIR`.
  The event surface changes between releases; OpenCode is "untested" in ReCue today.
- **Custom agent — NO signal.** Arbitrary user command; only the heuristic applies.
- **Recommendation:** adopt a **hook-first, heuristic-fallback** model, starting with **Claude
  only** (the default/recommended agent), via a small **localhost HTTP listener** in the backend
  that Claude's **`http` hook** POSTs to. Keep the existing heuristic as the universal fallback
  and the sole signal for Custom / older CLIs / container edge-cases. Treat Codex `notify` and
  OpenCode plugins as later, opt-in enhancements.

---

## 1. Two different "finish" signals — don't conflate them

| Signal | Meaning | ReCue today | Needs a hook? |
|---|---|---|---|
| **Process exited** | The agent PTY child terminated (clean code 0, crash, or kill) | **Solved** — `exit_waiter` owns the `Child`, blocks in `wait()`, emits `SessionEvent::Exited`; clean-exit classified by `commands::is_clean_exit` (#354/#63/#431) | No |
| **Turn finished / awaiting input** | The agent stopped working *and is still alive*, waiting for the user's next prompt (or for an approval) | **Approximated** by the `pty.rs` busy/idle heuristic → `session://state` → the Attention queue's 5 s `attentionEligible` grace | **This is the target** |

Everything below is about the second row.

### How ReCue approximates it today (the baseline we'd augment)

- **Backend** (`src-tauri/src/pty.rs`): `monitor_loop` (200 ms tick) derives busy/idle from
  `last_output` within `BUSY_WINDOW_MS = 700`, with a `BACKGROUND_HOLD_MS = 5000` sticky hold
  (#315), keystroke-echo exclusion (`INPUT_ECHO_MS = 300`, #55), focus/mouse-report suppression
  (#403) and resize-repaint suppression (`RESIZE_REPAINT_MS = 500`), gated by a "has work"
  flag (`seeded || last_input != 0`, #116). Emits `SessionEvent::State { id, busy }` **only on
  transitions** → `session://state`.
- **Frontend** (`src/store.ts` + `Attention/attentionQueue.ts`): `session://state` →
  `setBusy(id, busy)`. A **confirmed** busy→idle edge arms `armAttentionGrace` for
  `ATTENTION_GRACE_MS = 5000` (deliberately = backend `BACKGROUND_HOLD_MS`); only then does
  `attentionEligible[id] = true`, which is the sole membership test in the pure `attentionQueue`.
  Eviction is debounced `ATTENTION_EVICT_CONFIRM_MS = 1500`. The `#336` watched-agent
  notification (`maybeNotifyWatched`) fires **from inside that grace timer**, so it "rides the
  confirmed settle."

**Known weaknesses of the heuristic** (why a hook is attractive):
1. It **cannot** distinguish "finished, awaiting your prompt" from "paused, waiting for you to
   approve a tool" — both just look like "output went quiet." The Attention queue treats them
   identically.
2. Bursty background work (subagents, MCP servers, a paused turn repainting every few seconds)
   forces the `#315` sticky-hold workaround and still risks mis-timing.
3. The **5 s admission grace exists only because the signal is noisy.** A real completion event
   needs no grace — admission could be immediate and certain.

---

## 2. Per-agent findings

### 2.1 Claude Code — verified against the official docs

**Events**
- **`Stop`** — fires *"when Claude finishes responding."* No matcher; fires every turn. This is
  the primary completion signal. (Official: code.claude.com/docs/en/hooks.)
- **`Notification`** — fires *"when Claude Code sends a notification,"* with a **matcher on the
  notification type**. Documented matcher values include **`permission_prompt`**,
  **`idle_prompt`**, `auth_success`, `elicitation_dialog`, `agent_needs_input`,
  `agent_completed`. `idle_prompt` = Claude is done and waiting for input; `permission_prompt` =
  Claude wants approval to use a tool. Notification hooks **cannot block** (informational).
- `SessionEnd` exists (session termination) — not needed; ReCue's exit detection already covers it.

**Payload (stdin JSON)** — common fields confirmed in the docs: `session_id`, `transcript_path`,
`cwd`, `hook_event_name`; `Stop` also carries **`last_assistant_message`** (and `permission_mode`
/ `effort` in tool-use context). ⚠️ A `stop_hook_active` field was claimed by one source but is
**not present in the official docs** — treat as unverified.

**Hook types — five, and one is perfect for us:** `command`, **`http`**, `mcp_tool`, `prompt`,
`agent`. The **`http`** type *"send[s] the event's JSON input as an HTTP POST request to a URL."*
→ No shell script, no `jq`/`curl`, identical on macOS/Windows/Linux.

**Config shape:**
```json
{ "hooks": { "Stop": [ { "hooks": [ { "type": "http", "url": "http://127.0.0.1:<port>/hook/<token>" } ] } ] } }
```

**Injection without touching user config — confirmed:** `--settings` *"Path to a settings JSON
file **or an inline JSON string**. Values you set here override the same keys in your
settings.json files **for this session**. Keys you omit keep their file-based values."* Also
`--setting-sources` (user/project/local) and `${CLAUDE_PROJECT_DIR}` are available.

**Correlation — free:** ReCue spawns `claude --session-id <uuid>` (`agents.rs:84`), so the
`session_id` in the hook payload **is** ReCue's own session id.

### 2.2 Codex CLI (Rust build)

- **`notify`** — root key in `~/.codex/config.toml`: `notify = ["prog", "arg"]`. Runs an
  external program with **one argv** = a JSON string, on **`agent-turn-complete` only** (fires
  *"when the agent finishes a turn and is waiting for input"*). Payload: `type`, `turn-id`,
  `input-messages`, `last-assistant-message` (+ `thread-id`, `cwd` on newer builds). **Does not
  distinguish approval** from done.
- **`[tui] notifications = ["agent-turn-complete", "approval-requested"]`** with
  `notification_method = "osc9" | "bel"` — writes an OSC 9 / BEL sequence **into the terminal
  stream**. This is the *only built-in surface for `approval-requested`*, and (being in the PTY
  byte stream) it's passively observable by a host that already reads the PTY. Not a documented
  external API.
- **Hooks system (newer, Claude-Code-style):** `Stop` (*"fires when a turn concludes"*) and
  **`PermissionRequest`** (*"fires when approval is needed"*) among others — this pair *does*
  separate done-vs-approval. Schemas still stabilizing.
- **Injection:** `-c 'notify=[...]'` (highest-precedence CLI override), `CODEX_HOME` (relocates
  the whole home incl. credentials — a catch), `--ignore-user-config` (v0.122+), profiles.
- **Structured/headless:** `codex exec --json` emits `turn.completed` — but it's **one-shot**,
  not the interactive PTY ReCue runs. MCP mode has an open "TurnComplete never emitted" bug.
- **ReCue fit:** Codex is already gated (`supports_resume=false`, `supports_auto_name=false`,
  `uses_claude_log=false`). `notify`/`-c` injection is feasible, but the payload lacks
  `session_id`-style correlation to ReCue's own id (Codex owns its identity; `thread-id` is
  Codex's, not ReCue's), so matching a `notify` callback back to a ReCue session needs extra
  plumbing (e.g. a per-session `CODEX_HOME` or a token baked into the notify args).

### 2.3 OpenCode

- **`session.idle`** bus event = *"the agent finished / all processing complete."* Reachable two
  ways: **(a)** a JS/TS **plugin** `event` hook (works with the **TUI** ReCue runs), **(b)** the
  SSE stream `GET /event` when launched as `opencode serve` (a different, non-TUI mode).
- **No `notify`-style external-program config.**
- **Approval is a separate event** — `permission.updated` / `permission.replied` — so done vs
  blocked is distinguishable. `session.error` for failures.
- **Injection:** drop a plugin into a dir pointed at by **`OPENCODE_CONFIG_DIR`** (or an
  `opencode.json` `"plugin"` key / `OPENCODE_CONFIG_CONTENT`) — no edit to the user's global
  config.
- **Caveats:** the event/SSE surface **churns between releases** (documented regressions);
  subagent (`Task`) child sessions emit their *own* idle without a reliable `parentID`, so you
  must filter by the `sessionID` you spawned; plugin handlers are fire-and-forget. OpenCode is
  **untested** in ReCue.

### 2.4 Custom agent (`#325`)

Arbitrary user command (`customAgentCommand`). **No standardized completion signal.** The
terminal-activity heuristic is the only option.

### Comparison

| Agent | Turn-complete signal | Approval distinguishable? | Injectable w/o user-config edit | Correlates to ReCue id? | Works with ReCue's PTY/TUI model | Maturity |
|---|---|---|---|---|---|---|
| **Claude** | `Stop` hook | **Yes** (`Notification` idle vs permission) | **Yes** (`--settings`) | **Yes** (`session_id` = uuid) | **Yes** | Stable, documented |
| **Codex** | `notify` (`agent-turn-complete`) / `Stop` hook | Partial (`notify` no; hooks/`[tui]` yes) | Yes (`-c` / `CODEX_HOME`) | Needs plumbing | Yes | notify stable; hooks newer |
| **OpenCode** | `session.idle` (plugin) | Yes (`permission.updated`) | Yes (`OPENCODE_CONFIG_DIR`) | Via spawned `sessionID` filter | Yes (plugin) / serve=SSE | Churny |
| **Custom** | — | — | — | — | heuristic only | — |

---

## 3. The transport gap (and how to close it)

**There is no channel today.** The backend has no localhost server, file-watcher, or socket an
external hook process could signal — the only `TcpListener` in the tree is test code in
`usage.rs`. So whatever hook we adopt, the **hook → backend bridge is net-new**.

**Recommended transport: a tiny app-owned localhost HTTP listener + Claude's `http` hook.**
- One listener for the whole app on `127.0.0.1:<ephemeral port>`, started at boot.
- A **per-launch secret token** in the injected URL path (`/hook/<token>`); reject anything
  without it, so other local processes can't spoof "done." Bind loopback only.
- The `http` hook type means **no shell script and no external tools** — uniform across OSes,
  in keeping with ReCue's cross-platform rule. (A `command` hook + file-drop + a Rust dir-watch
  is the fallback transport if opening a loopback port is undesirable, but it reintroduces
  cross-platform shell/`jq` concerns.)
- The listener authenticates, parses `session_id` + event, and emits a new backend event into
  the **same pipeline** the heuristic already uses.

**Injection detail (cross-platform):** pass **`--settings <path>`** pointing at a small settings
file ReCue writes **once** into its own app-data dir (containing only the hooks block with the
port+token) rather than inline JSON — this sidesteps Windows argv-quoting hazards with braces/
quotes entirely. The file never touches `~/.claude` or the user's repo. Add the flag in the
**claude arm of `AgentSpec::spawn_args`** (`agents.rs:84`) or in `spawn_with_id` (`pty.rs:1157`);
thread the port+token to that builder.

---

## 4. Recommended architecture — hook-first, heuristic-fallback

```
claude (Stop / Notification hook, http type)
        │  POST 127.0.0.1:<port>/hook/<token>  {session_id, hook_event_name, notification_type,...}
        ▼
Rust hook-bridge listener  ──►  SessionEvent::Turn { id, state }   (new)
                                     state ∈ Working | AwaitingInput | AwaitingApproval
        ▼
lib.rs forwarder  ──►  session://turn (new)   [heuristic still emits session://state]
        ▼
store.ts: authoritative turn state for that session
   • when a hook signal has been seen → prefer it; admit to Attention immediately (skip/relax the 5s grace)
   • tag the queue entry "finished" vs "needs approval"
   • #336 watched-agent notification fires on the real event, not a settle timer
   • no hook signal (Custom, older CLI, container) → existing heuristic path unchanged
```

Key properties:
- **Additive & reversible.** The heuristic stays exactly as-is and remains the fallback; the
  hook only *upgrades* a session once its first hook event arrives. Nothing regresses if the
  listener is down or a hook never fires.
- **Reuses the existing seams.** New `SessionEvent` variant + `session://turn` event mirror the
  `session://state` → `store.setBusy` flow; the pure `attentionQueue` gains an optional
  authoritative-state input.
- **Per-session precision.** `session_id` correlation is exact for Claude.

**What it buys the Attention queue specifically:**
1. Deterministic, immediate admission (no 5 s grace for hooked agents).
2. A genuine **"needs approval"** vs **"finished"** distinction — the queue could surface an
   approval-blocked agent differently (arguably higher priority).
3. Precise `#336` notifications (fires on the actual event, never on a spurious settle).
4. Immunity to the bursty-repaint failure modes the `#315` sticky-hold works around.

---

## 5. Open questions / must-verify (against the installed CLIs)

1. **`--settings` hook merge semantics (load-bearing).** Does an inline/file `--settings` that
   sets `hooks` **deep-merge** with the user's own `settings.json` hooks, or **replace** the
   whole `hooks` key for the session? If it replaces, injecting our `Stop` hook would suppress
   the user's own hooks for that run — unacceptable. Verify on the installed `claude`; if it
   replaces, find a merging source (managed/project settings file) or confirm Claude combines
   hooks across sources.
2. **Does `Stop` fire while blocked on a permission prompt?** Confirm `Stop` fires only on true
   turn-end and that `Notification`/`permission_prompt` is the signal while awaiting approval
   (so we don't mark an approval-blocked agent as "finished").
3. **`http` hook exact request shape** — method, headers, body (is the full event JSON the POST
   body?), and whether it supports a bearer/header token vs. only a URL path token.
4. **Firing latency & re-fire** — how promptly `Stop` fires after the last token, and whether it
   re-fires (and any `stop_hook_active`-style loop guard actually present in the installed CLI).
5. **Container sessions.** Container `claude` runs in Docker (`uses_claude_log=false`); a
   `127.0.0.1` hook URL won't reach the host without `host.docker.internal`/host-gateway
   plumbing. Decide: inject a host-gateway URL for containers, or keep containers on the
   heuristic (simplest first cut).
6. **Codex correlation** — how to tie a `notify` callback (Codex's `thread-id`, not ReCue's id)
   back to a ReCue session (per-session `CODEX_HOME`? a token in the notify argv?).
7. **OpenCode** — pin the plugin `event`/`session.idle` shape to the installed version and
   filter subagent idles by spawned `sessionID`.

---

## 6. Risks & cost

- **New attack surface:** a loopback listener. Mitigate with loopback-only bind, ephemeral port,
  per-launch token, strict payload validation.
- **Version drift:** hook payloads/events evolve. Matches ReCue's existing "verify against the
  installed CLI" discipline; keep the heuristic as the safety net so drift degrades gracefully
  rather than breaking finish-detection.
- **Complexity:** an HTTP server, per-session/app settings-file writing, a new event, and store
  wiring — non-trivial but well-scoped, and Claude-only for the first cut keeps it contained.
- **Non-Claude ROI is lower:** Codex/OpenCode injection works but is churnier and correlation is
  harder; they're "untested" agents. Defer them.

---

## 7. Suggested phased plan (not implemented here)

- **Phase 0 — spike/verify:** manually run `claude --settings <file>` with an `http` `Stop` hook
  against a throwaway loopback listener; confirm §5 items 1–4 on the installed CLI.
- **Phase 1 — Claude hook bridge (behind a setting, default off):** loopback listener + token +
  `--settings` injection in the claude spawn arm + new `session://turn` event; store prefers the
  hook signal when present, else the heuristic. Distinguish finished vs needs-approval in the
  Attention queue and `#336`.
- **Phase 2 — containers & polish:** decide host-gateway URL for container claude; relax the 5 s
  grace for hooked sessions.
- **Phase 3 (optional) — Codex `notify` / OpenCode plugin:** opt-in, per-agent, reusing the same
  bridge, with their own correlation strategies.
- **Always:** the terminal-activity heuristic stays as the universal fallback and the sole path
  for Custom agents and any session with no hook signal.

---

*Sources: Claude Code hooks & CLI reference (code.claude.com/docs — verified directly);
OpenAI Codex config/hooks docs (developers.openai.com/codex) + openai/codex issues; OpenCode
docs (opencode.ai/docs) + sst/opencode. ReCue code: `pty.rs`, `agents.rs`, `commands.rs`,
`title.rs`, `store.ts`, `Attention/attentionQueue.ts`.*
