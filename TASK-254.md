### 254. [ ] Render Mermaid diagrams in rendered markdown (file viewer)

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-29

**Description**

When a markdown file contains a **Mermaid** diagram (a fenced code block tagged
` ```mermaid `), the **rendered** markdown view should display the diagram as a proper
chart instead of a raw code block.

Per the card: "Markdown mermaid integration. This application should generate mermaid
diagrams in markdown render view if a mermaid diagram is detected."

**Grounding:**

- The universal `FileViewer` (`src/components/FileViewer/FileViewer.tsx`, #40/#44)
  renders markdown with `react-markdown` + `remark-gfm`, and a **no-raw-HTML** policy
  (no `rehype-raw`). Its `components` map comes from the shared
  `makeCheckboxComponents` factory (`src/components/markdownCheckboxes.tsx`), which
  already overrides `a` (external-link routing, #182) and `input` (clickable task
  checkboxes, #173). A `code` override added there is the clean insertion point.
- The FileViewer has a **Rendered ⇄ Raw** segmented toggle (#73/#148). Mermaid renders
  only in **Rendered**; the editable Raw textarea shows the ` ```mermaid ` fence as text
  (unchanged). This matches the card's "in markdown render view."
- `mermaid` is **not** currently a dependency (`package.json` checked). It must be added
  and, per ReCue's offline rule (fonts/assets bundled, **never a CDN**), bundled — and,
  because mermaid is a large library, **lazy-loaded** via dynamic `import()` so it only
  loads when a diagram is actually present (no initial-bundle bloat, no async cost for
  diagram-free files).
- The same `makeCheckboxComponents` factory is also used by **Kanban card bodies**
  (#143); `react-markdown` also renders in **PatchNotes** and **Settings**. Those are
  out of scope (see below) — the mermaid `code` override is **opt-in** so only the
  FileViewer enables it.

**Scope**

- In the FileViewer's **rendered markdown**, a ` ```mermaid ` fenced block renders as
  a Mermaid SVG diagram (dark theme matching the app, sandboxed, offline).
- A diagram that **fails to parse** falls back to showing the original fenced code
  block (plus a subtle inline error note) — it must **never** crash the viewer.
- Lazy-load mermaid (dynamic import) and a one-time `mermaid.initialize`.

**Out of scope**

- Mermaid in **Kanban card bodies**, **PatchNotes**, and **Settings** markdown — those
  are constrained / trusted-internal surfaces; the override is opt-in and not enabled
  there (a possible future extension for Kanban).
- **Auto-detecting** mermaid syntax inside *untagged* code fences — only the standard
  ` ```mermaid ` language tag triggers a diagram (the GitHub/Obsidian convention). A
  block tagged otherwise stays a normal code block.
- A mermaid **live editor** / editing the diagram visually — the source is edited as
  text in the existing Raw view.
- Custom per-token theming beyond a dark theme that fits the app (a `themeVariables`
  mapping to design tokens is a noted optional polish).
- Mermaid **click-interactions** / embedded HTML (disabled by `securityLevel: "strict"`).

**Subtasks**

1. [ ] **Add the dependency.** `npm install mermaid` (bundled, not a CDN). Confirm it
   tree-shakes / lazy-loads (Subtask 3) so it doesn't enlarge the initial chunk;
   `npm run build` should show mermaid in its own async chunk, not the entry.

2. [ ] **A `MermaidBlock` component** (e.g. `src/components/FileViewer/MermaidBlock.tsx`).
   - [ ] Lazy-import mermaid on first render: `const mermaid = (await
     import("mermaid")).default;`. Initialize **once** (module-level guard) with
     `mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel:
     "strict", fontFamily: <a bundled/system font, not a web font> })` — `securityLevel:
     "strict"` sandboxes output (DOMPurify, no scripts/click handlers), consistent with
     the no-raw-HTML policy; the font choice keeps it **offline** (no web-font fetch).
   - [ ] Render asynchronously: on mount / when the `chart` source changes, call
     `await mermaid.render(uniqueId, chart)` and set the resulting `svg` into state,
     injected via `dangerouslySetInnerHTML` (safe under strict mode). Use a **stable
     unique id** (React `useId()`, sanitized to a valid id) — mermaid requires a unique
     DOM id per render. Guard against the async race (a `cancelled` flag / latest-wins)
     so a fast source change doesn't paint a stale diagram.
   - [ ] While loading, show a subtle placeholder ("Rendering diagram…"). On a
     `mermaid.render` throw (invalid syntax), **catch** and render a fallback: the
     original fenced code as a `<pre><code class="language-mermaid">` plus a small,
     muted error line (token-styled, e.g. `--status-error` text). Never throw to the
     viewer.

3. [ ] **Wire the `code` override (opt-in).**
   - [ ] Add an optional `mermaid?: boolean` to `makeCheckboxComponents` (or compose a
     separate `mermaidCodeComponent` merged in only when requested) so the FileViewer
     enables it and **Kanban/PatchNotes/Settings do not**.
   - [ ] In the `code` override: when the node is a **fenced block** whose `className`
     includes `language-mermaid`, render `<MermaidBlock chart={String(children)} />`;
     **otherwise pass through the default rendering faithfully**
     (`<code className={className}>{children}</code>`) so normal inline/code blocks are
     unchanged. (FileViewer doesn't currently override `code`, so the default must be
     preserved exactly.)
   - [ ] Enable it at the FileViewer call site: pass `mermaid: true` (the only site).

4. [ ] **Styling** (`FileViewer.module.css`): a `.mermaid` wrapper that centers the SVG,
   constrains it to the panel width (`max-width: 100%`, horizontal scroll if a diagram
   is wider), and provides a readable background within the dark theme. Use design
   tokens only; no platform-divergent CSS. The diagram is static SVG (no animation → no
   reduced-motion concern).

5. [ ] **Cross-platform.** Mermaid is pure JS + SVG rendered by the WebView — it works
   identically on **WKWebView (macOS)** and **WebView2 (Windows)**; no native calls, no
   shell-outs, no path handling. The only requirements are (a) bundled/offline (no CDN)
   and (b) no web-font fetch (the `fontFamily` config) — both hold on each OS. No
   `#[cfg]` / `platform`-signal branching needed. (A real-box visual check on Windows is
   nice-to-have but the path is fully testable in dev on both — note nothing for
   `TRAJECTORY_TO_WINDOWS.md` unless a WebView2-specific SVG quirk surfaces.)

6. [ ] **Tests + docs.**
   - [ ] Vitest: a small pure helper if extracted (e.g. `isMermaidClassName(className)`
     → boolean) and a render-fallback smoke test (mocking the dynamic import) verifying
     an invalid chart yields the code-block fallback rather than throwing. Keep mermaid
     itself out of the unit run (mock the dynamic import) so tests stay fast/offline.
   - [ ] `npm run build` + `npm run lint` + `npm test` + `cargo test` green (Rust
     unaffected — frontend-only change).
   - [ ] Update `CLAUDE.md`: the Stack line (react-markdown + remark-gfm + Prism) and
     the FileViewer notes to mention **Mermaid rendering in the FileViewer's rendered
     markdown** (lazy-loaded, dark, strict, offline). Add the new component to the
     Layout's `components/` list.

**Acceptance criteria**

- [ ] A markdown file containing a ` ```mermaid ` block shows the **diagram** in the
  FileViewer's **Rendered** view, and the **raw ` ```mermaid ` source** in the Raw view.
- [ ] A non-mermaid code fence (e.g. ` ```ts `) renders exactly as before (unchanged).
- [ ] An **invalid** mermaid diagram shows the original code block + a subtle error
  note and does **not** crash or blank the viewer.
- [ ] Mermaid is **lazy-loaded** — a markdown file with no mermaid block does not pull
  the mermaid chunk; the initial bundle is not enlarged.
- [ ] Mermaid is **bundled/offline** (no CDN) and fetches **no web font** at render.
- [ ] Diagrams render in a **dark** theme consistent with the app and are **sandboxed**
  (`securityLevel: "strict"`, no embedded HTML/JS).
- [ ] **Works on both macOS and Windows** (pure WebView SVG; no native/path/shell code;
  no platform branching).
- [ ] Kanban card bodies, PatchNotes, and Settings markdown are **unaffected** (the
  override is opt-in, enabled only in the FileViewer).
- [ ] `npm run build`, `npm run lint`, `npm test`, and the Rust suite pass.

**Notes**

- **Asking the user — deferred per the standing directive.** Per `ASSUMPTIONS.md`
  (2026-06-26, honored since #186), open points were decided autonomously. Decisions:
  - **Library = `mermaid`** (the de-facto standard, what GitHub/Obsidian/GitLab use),
    **lazy-loaded** via dynamic import and **bundled offline** (ReCue's no-CDN rule).
  - **Detection = the ` ```mermaid ` language fence only**, not heuristic syntax
    sniffing of untagged blocks — robust and matches the universal convention.
  - **Scope = the FileViewer's rendered markdown only**, via an **opt-in** flag on the
    shared `makeCheckboxComponents`, so Kanban/PatchNotes/Settings stay unchanged
    (Kanban mermaid is a possible future card).
  - **Invalid diagrams fall back to the raw code block + a subtle error**, never
    crashing — consistent with the viewer's other fail-open behaviors.
  - **Dark theme + `securityLevel: "strict"` + offline font**, fitting the dark-only UI
    and the no-raw-HTML policy; token-driven `themeVariables` is an optional later
    refinement.
- **Why the `code` override is the right hook:** react-markdown calls the `code`
  component for every fenced block with `className="language-<lang>"`; intercepting
  `language-mermaid` there (and otherwise rendering the default) is the minimal,
  localized change and reuses the existing components-factory seam (#173/#182).
- **Key references:** `FileViewer.tsx` (the `ReactMarkdown` render + `markdownComponents`
  from `makeCheckboxComponents`, the Rendered/Raw toggle); `markdownCheckboxes.tsx`
  (`makeCheckboxComponents`, the `a`/`input` override pattern to mirror for `code`);
  `package.json` (deps — add `mermaid`); `CLAUDE.md` Stack + FileViewer notes;
  `tokens.css` (`--status-error` for the fallback note).
