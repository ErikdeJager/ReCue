# TASK-182

### 182. [ ] Markdown links must open in the external browser, never inside the app window

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-26

**Description**

Clicking a link inside **rendered markdown** currently navigates the Tauri
**webview itself** — the React app is replaced by the linked page (the user is
stranded on a web page inside ClaudeCue, with no back button / chrome). This is a
real bug: an `[text](https://…)` link in any markdown the app renders hijacks the
whole window.

**Root cause.** The app renders markdown with **react-markdown + remark-gfm** and,
since #173, a custom `components` map (`makeCheckboxComponents` in
`src/components/markdownCheckboxes.tsx`) that only overrides the `input` element
(clickable task-list checkboxes). There is **no `a` (anchor) override**, so links
fall through to react-markdown's default — a plain `<a href>`. In a Tauri webview a
plain anchor click performs an in-place navigation, swapping out the SPA.

The app already has the right primitive: the terminal pool (#109) routes ⌘-clicked
`http`/`https` URLs to the dependency-free Rust **`open_url`** command (shells out
to macOS `open`, **rejects any non-http(s) scheme** — see
`src-tauri/src/commands.rs::open_url`, ~line 1009), wrapped by the frontend
`openUrl` in `src/ipc.ts` (line 326). This task brings that same behavior to
rendered-markdown links: **intercept the click and open http/https links in the
user's default browser; for everything else, neutralize the click so the app can't
be navigated away.**

**Render sites (all three must be covered — user decision).** A repo sweep for
`ReactMarkdown` finds exactly three render sites:

1. `src/components/FileViewer/FileViewer.tsx:171` — the rendered-markdown file view.
   Uses a `markdownComponents` map built from `makeCheckboxComponents` (FileViewer
   line ~77).
2. `src/components/Kanban/KanbanPanel.tsx:245` — a Kanban **card body**. Uses a
   `bodyComponents` map built from `makeCheckboxComponents` (KanbanPanel line ~125).
3. `src/components/Kanban/KanbanPanel.tsx:287` — `CardPreview`, the floating
   drag-overlay card. Renders `<ReactMarkdown remarkPlugins={[remarkGfm]}>` with
   **no `components` map at all**.

Because (1) and (2) both build their map from `makeCheckboxComponents`, adding the
`a` override **inside that shared factory** fixes both for free. (3) builds no map,
so it needs the link override passed in explicitly — export a reusable link-only
`components` map (or component) from the same module and apply it at the
`CardPreview` call site.

**Non-http(s) link behavior (user decision: "Neutralize, no nav").** Only
`http(s)://…` links open externally via `openUrl`. Any other href — a relative path
(`./other.md`), `mailto:`, `tel:`, an in-page `#anchor`, etc. — must `preventDefault`
and do **nothing** (so it can never replace the React app). **No backend change** —
`open_url`'s existing http(s)-only guard stays as-is; we simply don't call it for
non-web schemes.

**Scope**

- Add a reusable react-markdown **`a` (anchor) override** in
  `src/components/markdownCheckboxes.tsx` (the existing shared markdown-`components`
  module) that, on click:
  - `preventDefault()` always (no anchor ever performs an in-place navigation);
  - if the href is an `http`/`https` URL → `void openUrl(href).catch(() => {})`;
  - otherwise → no-op (link text still renders, but clicking does nothing).
- Merge that override into `makeCheckboxComponents`'s returned map so the FileViewer
  markdown view and Kanban card bodies pick it up automatically.
- Apply the same link override to the `CardPreview` `ReactMarkdown` (KanbanPanel
  line ~287), which has no components map today.

**Out of scope**

- **No backend change.** `open_url` keeps its http(s)-only guard; `mailto:`/`tel:`
  are **not** routed to the system handler (explicitly declined for this task).
- Terminal links (#109) are already handled by the WebLinks addon — untouched.
- Raw-markdown / plain-text editing views and the Prism **code** view (which render
  no `<a>` from markdown) — untouched.
- No new dependency, no CSP / Tauri capability change.

**Subtasks**

1. [ ] In `src/components/markdownCheckboxes.tsx`, import `openUrl` from `../ipc`.
2. [ ] Add a small **pure** exported helper, e.g.
   `export function isExternalHref(href: string | undefined): boolean` returning
   `true` only for `http(s)://…` (e.g. `/^https?:\/\//i.test(href ?? "")`), so the
   classification is unit-testable.
3. [ ] Add a reusable anchor override. Two equally fine shapes — pick one:
   - export a `markdownLinkComponents: Components` constant whose `a` renders
     `<a href={href} onClick={onLinkClick}>{children}</a>` (drop `node`; do **not**
     spread it to the DOM), **or**
   - export a `MarkdownLink` component and a `markdownLinkComponents = { a: MarkdownLink }`.

   The click handler:
   ```tsx
   function onLinkClick(event: React.MouseEvent<HTMLAnchorElement>, href?: string) {
     event.preventDefault();
     if (isExternalHref(href)) void openUrl(href!).catch(() => {});
     // non-http(s): neutralized, no-op
   }
   ```
4. [ ] Merge the `a` override into the object returned by `makeCheckboxComponents`
   (so its `input` checkbox override and the new `a` override coexist). FileViewer's
   `markdownComponents` and KanbanPanel's `bodyComponents` then get links handled
   with no change at those call sites.
5. [ ] In `src/components/Kanban/KanbanPanel.tsx`, pass the link override to the
   `CardPreview` `ReactMarkdown` (line ~287):
   `components={markdownLinkComponents}` (import it from `../markdownCheckboxes`).
6. [ ] Add a unit test for `isExternalHref` (extend
   `src/components/markdownCheckboxes.test.ts` or add a sibling test): `https://…`
   and `http://…` → true; `./rel.md`, `mailto:a@b.com`, `tel:123`, `#anchor`, `""`,
   `undefined` → false.
7. [ ] Verify: `npm run build` (type-check) and `npm run lint` clean; `npm test`
   passes. Manually confirm in `npm run tauri dev` that an `http(s)` link in a
   rendered `.md` (FileViewer) and in a Kanban card body opens the **system
   browser** and the ClaudeCue window stays on the app; and that a relative/`mailto`
   link does nothing (window is **not** navigated away).

**Acceptance criteria**

- [ ] Clicking an `http`/`https` link in a **rendered markdown file** (FileViewer)
      opens it in the user's **default external browser**, and the ClaudeCue window
      is **not** navigated away from the app.
- [ ] Clicking an `http`/`https` link in a **Kanban card body** does the same.
- [ ] Clicking a **non-http(s)** link (relative path, `mailto:`, `tel:`, `#anchor`)
      in rendered markdown does **nothing** — it never replaces / navigates the app
      window (no in-place navigation, no error toast).
- [ ] No backend change: `open_url` is unchanged and still rejects non-http(s).
- [ ] The shared `a` override lives in `markdownCheckboxes.tsx` and is applied at
      all three render sites (FileViewer view, Kanban card body, `CardPreview`).
- [ ] `npm run build`, `npm run lint`, and `npm test` all pass (including a new test
      for `isExternalHref`).

**Notes**

- **User decisions (refine Q&A, 2026-06-26):**
  - *Scope* → **All markdown sites**: fix the FileViewer rendered-markdown view AND
    Kanban card bodies (plus the `CardPreview` drag overlay), via the shared
    `markdownCheckboxes.tsx` factory.
  - *Non-http(s) links* → **Neutralize (no nav)**: only http/https open externally;
    relative / `mailto:` / `tel:` / `#anchor` are `preventDefault`'d no-ops; **no
    backend change** (do not widen `open_url` to mailto/tel).
- This mirrors the established #109 pattern (terminal `WebLinksAddon` → `openUrl` →
  Rust `open_url`), reusing the exact same frontend wrapper (`src/ipc.ts:326`) and
  backend command (`src-tauri/src/commands.rs::open_url`) — no new IPC surface.
- `CardPreview` is a drag overlay (pointer events are typically suppressed mid-drag),
  so its links are rarely clickable in practice; the override is added there for
  consistency and defense-in-depth, per the "all sites" decision.
- react-markdown v9 passes a `node` prop to component overrides — do **not** spread
  it onto the DOM `<a>` (would trigger an invalid-attribute warning), exactly as the
  existing `input` checkbox override avoids spreading.
- Relative import path from `src/components/markdownCheckboxes.tsx` to the IPC layer
  is `../ipc`.
