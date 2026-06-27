### 224. [ ] Canvas template file block: support full paths + a relative/absolute path choice

**Status:** Not started
**Depends on:** none
**Created:** 2026-06-28

**Description**

A Canvas template's **"open-file" block** (#117/#118) currently takes only a **bare
relative filename** (the editor labels it "File (relative path)", placeholder "e.g.
README.md") that's resolved inside the folder chosen at template-use time. Extend it so a
file block can specify:

1. a **full relative path** (folders + filename, e.g. `src/components/App.tsx`),
   resolved from the chosen project/repo root; and
2. an **absolute path** (from the filesystem root, e.g. `/Users/you/notes.md` or
   `C:\Users\you\notes.md`), via an explicit **relative ⇄ absolute** choice in the block
   config.

**Grounding:**

- **Block shape** — `src/components/Canvas/templateBlocks.ts:70-75`: the `open-file`
  block has `config: "file"`, `liveKind: "file"`. The block content (a `CanvasContent`)
  carries only `file?: string` (`src/types/index.ts:255`); `repoPath` is **not** on the
  block — it's supplied as the chosen folder at use time.
- **Editor config UI** — `src/components/TemplateEditor/TemplateEditor.tsx:172-191`: a
  bare `<input type="text">` bound to `content.file`, labeled "File (relative path)",
  placeholder "e.g. README.md", helper "Resolved inside the folder you pick…". No
  picker, no mode toggle.
- **Instantiation mapping** — `src/components/Canvas/templateInstantiate.ts:79-80`:
  `case "file": return { kind: "file", repoPath: cwd, file: block.file };` — joins the
  block's `file` to the chosen `cwd` directly.
- **Resolution** — `src/store.ts` `resolveTemplateBlock` (~lines 2722-2736): for the
  `file` liveKind it calls `ipc.fileExists(cwd, block.file)`, throws "File not found" if
  missing, builds the live content, and `registerOverviewPanel(cwd, { kind:"markdown",
  file: block.file })`.
- **Backend path rules** — `src-tauri/src/files.rs` `file_exists` (lines 394-403) /
  `read_text_file` (~line 372): `repo.join(file).canonicalize()` confined to
  `repo.canonicalize()` (rejects `..`, symlinks, out-of-repo). Two consequences:
  - A **relative path with subfolders already works** today: `repo.join("src/a.md")`
    canonicalizes inside the repo → `starts_with(repo)` passes. So full **relative**
    paths need **no backend change** — only UI/UX to communicate they're allowed
    (`Path::join` treats `/` as a separator on Windows too, so store `/`-separated).
  - An **absolute** `file` is rejected (resolves outside the repo). The shipped **#163
    trick** opens an absolute file as `{ repoPath: <parent dir>, file: <basename> }` —
    its own parent dir as the root — so the containment check passes with **no backend
    change** (`files.rs` test `reads_and_writes_an_out_of_repo_file_via_its_parent_dir`).
- **Cross-platform helpers** — `splitPath(path)` (`src/paths.ts:45-50`) splits on `/`
  **or** `\` → `{ dir, base }` (handles `C:\a\b\c.md`); `pickFile()` native dialog +
  `splitPath` is how absolute files are opened today (`FileSwitcher.tsx:104-107`).
  `joinPath(platform, root, rel)` (`src/platform.ts:31-35`) for OS-native joins.

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

1. **Add an explicit path-mode field** to the open-file block content:
   `filePathMode?: "relative" | "absolute"` in `src/types/index.ts` (optional;
   **undefined / missing → "relative"** so existing templates are unchanged). Chosen over
   inferring the mode from the path string because the card asks for an explicit "choice"
   and it's clearer when re-editing a template.
2. **Editor UI** (`TemplateEditor.tsx`, the `config === "file"` block):
   - Add a **relative ⇄ absolute** toggle (a segmented control / two radio buttons),
     bound to `content.filePathMode` (default "relative"), via `onConfig({ filePathMode:
     … })`.
   - **Relative mode:** keep the text input; update the label/placeholder/helper to make
     clear that **subfolders are allowed** (e.g. label "File (relative to the folder you
     pick)", placeholder "e.g. src/README.md", helper noting it resolves from the chosen
     project root). Store the value `/`-separated.
   - **Absolute mode:** text input for the full path, plus a **"Browse…"** button that
     calls `pickFile()` (native dialog) and sets `content.file` to the picked absolute
     path (mirrors #163). Helper: "absolute path from the filesystem root, e.g.
     `/Users/you/notes.md` or `C:\\Users\\you\\notes.md`; this template will only resolve
     on a machine where that file exists."
3. **Instantiation / resolution** — add a small **pure helper**
   `fileBlockTarget(block, cwd): { repoPath: string; file: string }` (in
   `templateInstantiate.ts` or a shared util), used by **both**
   `templateInstantiate.ts:79-80` and `store.ts resolveTemplateBlock`:
   - **relative:** `{ repoPath: cwd, file: block.file }` (subpaths allowed; backend joins).
   - **absolute:** `const { dir, base } = splitPath(block.file)` →
     `{ repoPath: dir, file: base }` (the #163 parent-dir-as-root pattern). `splitPath` is
     platform-agnostic (no `platform` arg needed).
   Use the helper's `{ repoPath, file }` for `fileExists(repoPath, file)`, the live `file`
   content, and `registerOverviewPanel(repoPath, { file })`.
4. **No backend (`files.rs`) change** — relative subpaths already validate; absolute
   resolves via parent-dir-as-root.

**Out of scope:**

- `files.rs` / backend path validation — unchanged (the #163 pattern + existing
  `repo.join` cover both cases).
- The other block kinds (new-agent, new-terminal, open-diff) — unchanged.
- Making **absolute**-path templates portable across machines/OSes — by nature an
  absolute path is machine-specific; that's accepted (it's what the card asks for). The
  block's resolve already fails gracefully (the panel stays `pending` with an inline
  error + Retry, #118) when the file doesn't exist on the using machine.

**Cross-platform (hard requirement):**

- **Relative** paths are stored `/`-separated and resolved by the backend's `repo.join`,
  which treats `/` as a separator on **both** OSes → portable across macOS and Windows.
- **Absolute** paths are inherently OS/machine-specific; `splitPath` already handles both
  `/` and `\`, and `pickFile()` returns an OS-native path, so absolute mode works on both
  OSes on the machine that owns the file. Document the portability caveat in the helper
  text.
- No `#[cfg]` branch or new OS-specific code; reuse `splitPath` / `pickFile` / (if needed)
  `joinPath`.

**Subtasks**

1. [ ] Add `filePathMode?: "relative" | "absolute"` to the open-file block content type
   (`src/types/index.ts`), defaulting to relative when absent.
2. [ ] Update the `config === "file"` editor UI in `TemplateEditor.tsx`: add the mode
   toggle; relative-mode label/placeholder/helper updated for subfolders; absolute-mode
   input + "Browse…" (`pickFile`) + helper with the portability caveat.
3. [ ] Add the pure `fileBlockTarget(block, cwd)` helper and use it in
   `templateInstantiate.ts:79-80` and `store.ts resolveTemplateBlock` (the `file`
   liveKind) for `fileExists`, the live content, and `registerOverviewPanel`.
4. [ ] Add/extend tests: `templateBlocks.test.ts` / `templateInstantiate.test.ts` for the
   relative-subpath and absolute (`splitPath`-based) target resolution; old block with no
   `filePathMode` resolves as relative.
5. [ ] Verify: `npm run build`, `npm run lint`, `npm test`, `npm run format:check`.

**Acceptance criteria**

- [ ] An open-file block can specify a **full relative path with folders** (e.g.
      `src/components/App.tsx`); instantiating the template opens that file from the
      chosen folder.
- [ ] An open-file block can be set to **absolute** via the toggle and given an absolute
      path (with a Browse… picker); instantiating opens that exact file (resolved via
      parent-dir-as-root), independent of the chosen folder.
- [ ] Existing templates (no `filePathMode`) behave exactly as before (relative, from the
      chosen folder).
- [ ] No backend `files.rs` change is required; absolute resolution reuses the #163
      parent-dir pattern and `splitPath`; the change works on macOS and Windows.
- [ ] When an absolute file doesn't exist on the using machine, instantiation fails
      gracefully (pending panel + inline error + Retry, as today) — no crash.
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Explicit `filePathMode` field* (default relative) over inferring absolute-ness from
    the path string — matches the card's "choice", clearer on re-edit, back-compatible.
  - *Absolute resolution reuses the shipped #163 parent-dir-as-root trick* (`splitPath`)
    → **no backend change**; relative subpaths already validate via `repo.join`.
  - *Include a "Browse…" picker in absolute mode* (reusing `pickFile`) for good UX,
    mirroring #163's FileSwitcher Browse.
  - *Absolute templates are machine-specific by design* — documented in the helper text;
    relative templates stay portable.
- **Depends on: none** — builds on shipped templates (#117/#118), the #163 absolute-file
  pattern, and the cross-platform path helpers.
- References: `templateBlocks.ts:70-75` (open-file block), `types/index.ts:255` (`file`),
  `TemplateEditor.tsx:172-191` (file config UI), `templateInstantiate.ts:79-80` (mapping),
  `store.ts:~2722-2736` (`resolveTemplateBlock`), `files.rs:394-403` (`file_exists`) +
  `files.rs` #163 test, `paths.ts:45-50` (`splitPath`), `platform.ts:31-35` (`joinPath`),
  `FileSwitcher.tsx:104-107` (`pickFile` + `splitPath`).
