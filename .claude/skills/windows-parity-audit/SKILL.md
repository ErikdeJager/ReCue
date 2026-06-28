---
name: windows-parity-audit
description: Fan out read-only Explore agents across the whole ReCue codebase to find every place that could break on Windows — hardcoded POSIX paths, raw $HOME, un-gated shell-outs, Cmd-only key handling, macOS-only CSS/WebView effects, open/explorer URL & reveal calls, line endings, missing cfg-gates — then produce a prioritized remediation plan, and optionally apply the fixes, that makes each work on Windows WITHOUT changing the macOS behavior. Use when the user runs /windows-parity-audit, or asks to audit/check/harden Windows compatibility, hunt cross-platform bugs, or verify macOS-and-Windows parity.
argument-hint: [optional: a subsystem to focus on (e.g. "git.rs", "Terminal", "CSS"), or "fix" to also apply the remediations]
allowed-tools: Read, Grep, Glob, Bash, Agent, Edit, Write, AskUserQuestion, WebFetch
---

# Windows parity audit

ReCue ships on **both macOS and Windows** — that is a release constraint, not an
aspiration (see `CLAUDE.md` → "Cross-platform is a hard requirement"). The app was born
macOS-first, so the recurring risk is a code path that quietly assumes macOS and breaks
on Windows. This skill **sweeps the whole codebase with read-only Explore agents**,
finds every such place, and turns each into a concrete fix that works on Windows **while
keeping the macOS behavior byte-for-byte identical**.

The deliverable is a **prioritized remediation report**. Applying the fixes is a second,
opt-in phase (the user passes `fix`, or asks for it).

## Prime directive (never violate)

1. **Windows must work.** A code path that runs on both OSes may not assume one.
2. **macOS quality is sacrosanct.** Every fix preserves the **macOS arm byte-for-byte**.
   The Windows arm is **additive** — you gate the divergence, you never rewrite the
   shared/macOS path into something "more portable" that drifts from today's behavior.
3. **Reuse the established seams — don't reinvent them.** ReCue already has
   abstractions for every common divergence (paths, $HOME, shelling out, key handling,
   reveal/open, URLs). A fix that hand-rolls a new one is a defect. The catalog in
   [windows-landmines.md](windows-landmines.md) lists each seam by name.

## Workflow checklist

Copy this into your working notes and check items off as you go:

```
Windows parity audit:
- [ ] 1. Orient — read the cross-platform contract + the existing seams
- [ ] 2. Fan out Explore agents across subsystems (read-only, in parallel)
- [ ] 3. Synthesize — dedupe, drop false positives, confirm each by reading the code
- [ ] 4. Remediation plan — per finding: fix via the seam + macOS-preservation proof
- [ ] 5. (only if `fix`) Apply seam-by-seam, gate divergence, verify build/lint/test
- [ ] 6. Report
```

`$ARGUMENTS`: if it names a subsystem (e.g. `git.rs`, `Terminal`, `CSS`), scope the whole
sweep to that area. If it contains `fix`, run phase 5 (apply) after the audit. With no
arguments, audit the entire codebase and stop at the report.

---

## 1. Orient — learn the contract and the seams before searching

Read these first; they define what a *correct* fix looks like, so you don't flag things
that are already handled or "fix" them the wrong way:

- **`CLAUDE.md`** → the "Cross-platform is a hard requirement" section and the per-subsystem
  notes — the authoritative list of which seam covers which divergence.
- **`TRAJECTORY_TO_WINDOWS.md`** — the running log of Windows parity work; tells you what's
  already done (don't re-flag it) and what's still pending a real-box check.
- **The frontend seams:** `src/platform.ts` (the `platform` signal + `joinPath`/`splitPath`/
  `kbdHint`/`revealLabel`/`openUrl` helpers) and `src/paths.ts` (`repoName`/`lastSegment`).
- **The Rust seams:** `src-tauri/src/path_env.rs` (`home_dir`, `restore_user_path`) and the
  `git::hidden_command` / `pty::resolve_command` / `commands.rs` path guards named in
  [windows-landmines.md](windows-landmines.md).

Hold these in mind as the "already-solved" set — findings that route through them are fine.

## 2. Fan out Explore agents — the core of this skill

Spawn **multiple read-only `Explore` subagents in parallel** (one message, several `Agent`
tool calls with `subagent_type: "Explore"`) — one per subsystem so coverage is exhaustive
and fast. Explore agents read excerpts and locate code; they don't edit, which is exactly
right for an audit.

**Default partition** (scale up/down to the repo and to `$ARGUMENTS`):

1. **Rust — paths, env & filesystem:** `src-tauri/src/path_env.rs`, `files.rs`, `store.rs`,
   `commands.rs` — raw `$HOME`/`std::env::var("HOME")`, hardcoded `/` separators, path
   joins, canonicalization, reserved-name guards, app-data dir resolution.
2. **Rust — process & shell-outs:** `pty.rs`, `git.rs`, `agents.rs`, `title.rs`, `skills.rs`,
   `usage.rs`, `lib.rs` — every shelled-out `git`/CLI probe (must go through
   `git::hidden_command` for the `CREATE_NO_WINDOW` console-flash guard), PTY/shell choice
   (PowerShell vs POSIX), `claude.cmd` resolution via PATHEXT, `open`/`xdg-open`/`explorer`
   calls, Keychain/`security` use, `#[cfg(...)]` arms that leave the *other* OS unhandled.
3. **Frontend — platform behavior:** `src/platform.ts`, `paths.ts`, `useKeyboardNav.ts`,
   `ipc.ts`, and every component — `metaKey` without `ctrlKey`, "⌘"/"Finder"/"Cmd" copy not
   routed through `kbdHint`/`revealLabel`, path splitting on `/` only, URL opens not using
   the http/https `openUrl`/`open_url`, reveal-in-Finder paths.
4. **Styling — CSS / WebView:** `src/**/*.module.css`, `src/styles/global.css`, `tokens.css`
   — macOS-only `-webkit-`/vibrancy/backdrop effects with no fallback, `color-mix()` without
   a plain-color fallback, scrollbar styling that assumes WKWebView.
5. **Build, config & CI:** `src-tauri/tauri.conf.json`, `capabilities/`, `Cargo.toml`,
   `package.json`, `.github/workflows/`, `.gitattributes`, `Info.plist` — macOS-only bundle/
   signing assumptions, `cfg(unix)`-only tests with no Windows arm, LF/CRLF normalization
   gaps that would fail `cargo fmt`/`prettier` on a Windows checkout.

Give **each** agent this brief (adapt the scope line):

> You are auditing **<subsystem>** of ReCue, a Tauri 2 + React/Rust desktop app that
> must run identically well on **macOS and Windows** but was written macOS-first. Read
> `.claude/skills/windows-parity-audit/windows-landmines.md` for the catalog of pitfall
> categories, the grep seeds, and the established cross-platform seam each one must use.
> Hunt **<scope>** for every place that would break or misbehave on Windows. For each
> finding return a row: `file:line` · the exact offending construct · which landmine
> category · why it breaks on Windows · severity (Critical = won't run / data loss,
> High = feature broken, Medium = degraded UX, Low = cosmetic) · the established seam the
> fix should use · whether it's **already gated** (note it and move on — not a finding).
> Do NOT propose edits or change files; report locations and facts only. Cite real
> `file:line`; do not invent.

When the agents return, you keep the **conclusions**, not the file dumps.

## 3. Synthesize — confirm, dedupe, drop false positives

For every reported finding, **open the cited code yourself** and confirm it's real before
it reaches the report. Discard:

- Anything already `#[cfg(...)]`-gated or already routed through a known seam (§1).
- Anything in a **macOS-only-by-design** path that already has a Windows arm elsewhere.
- Test-only or dead code with no runtime effect (note separately, don't inflate severity).

Merge duplicates (the same seam flagged by two agents = one finding). Sort by severity.

## 4. Remediation plan — fix while preserving macOS

For **each surviving finding**, write a remediation entry with all five parts:

1. **Location & failure** — `file:line` and the precise way it breaks on Windows.
2. **Fix** — the concrete change, **using the established seam** named in the catalog
   (e.g. "replace `std::env::var("HOME")` with `path_env::home_dir()`"; "wrap the `git`
   probe in `git::hidden_command`"; "route the label through `revealLabel(platform)`";
   "add a `#[cfg(windows)]` arm next to the existing `#[cfg(unix)]` one"). Prefer a
   ready-to-apply diff.
3. **macOS-preservation proof** — explain *why the macOS arm is unchanged*: the divergence
   is gated, the macOS branch keeps today's exact bytes, the Windows branch is additive.
   If a fix would alter shared behavior, redesign it so macOS is untouched.
4. **Verification** — how to prove it: `npm run build` / `npm run lint` / `npm test` /
   `cargo test` / `cargo clippy`, plus whether it needs a **real-box check** (GUI spawn,
   installer, ConPTY reflow, URL/reveal opening) that CI can't cover.
5. **Effort & risk** — rough size and blast radius.

## 5. (only if `fix`) Apply the remediations

Only when the user passed `fix` or explicitly asked you to apply changes:

- Apply **one seam at a time**, smallest-blast-radius first. Gate every divergence with
  `#[cfg(windows)]`/`#[cfg(unix)]`/`#[cfg(target_os = "macos")]` in Rust (always provide
  the *other* arm — never leave it failing to compile) or the `platform` signal + helpers
  on the frontend. The **macOS arm must stay byte-for-byte**.
- After each seam: `npm run lint && npm run build && npm test` and, for Rust changes,
  `cargo clippy` + `cargo test` (manifest `src-tauri/Cargo.toml`). Keep the tree green.
- For paths CI **cannot** exercise (GUI spawn, installer, `claude.cmd` launch, ConPTY
  reflow, browser/Explorer opening), implement both arms anyway and **record the pending
  real-box check in `TRAJECTORY_TO_WINDOWS.md`** — never silently ship a macOS-only path.
- **Do not commit** unless the user asks. If they do, stage only the files you changed
  (never `git add -A`), with a clear message; push only on request.

## 6. Report

Give the user:

- A **severity-sorted table** of confirmed findings (`file:line` · category · failure ·
  fix · seam · macOS-preserved? · verification).
- **Counts** by severity and by subsystem, and what each Explore agent covered.
- The **already-handled** set you deliberately did *not* flag (so they trust the coverage).
- If you applied fixes: exactly what changed, the green/red of each verification command,
  and every item logged to `TRAJECTORY_TO_WINDOWS.md` as needing a real-box check.
- Any finding that looks like a deeper design issue rather than a one-line swap.

---

## Reference

- **[windows-landmines.md](windows-landmines.md)** — the pitfall catalog: each category's
  smell, copy-pasteable grep seeds, why it breaks on Windows, and the exact ReCue seam
  the fix must use. Read it during phase 1 and hand it to every Explore agent in phase 2.
