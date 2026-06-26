# TASK-184

### 184. [x] File tree context menu: offer both "Copy absolute path" and "Copy relative path"

**Status:** Done
**Depends on:** none
**Created:** 2026-06-26

**Description**

In the repo **file tree** (#167, `src/components/FileTree/FileTree.tsx`),
right-clicking a file currently shows a single **"Copy path"** item that copies the
**absolute** path (`${repoPath}/${menu.file}`). The user wants **both** a
"Copy absolute path" and a "Copy relative path" option available, so they can grab
either the full on-disk path or the short repo-relative path.

This already exists elsewhere in the app: the **sidebar file-row** context menu
(#171, `filePathMenuItems` in `src/components/Sidebar/Sidebar.tsx:137-159`) offers
exactly **"Copy absolute path"** (`copyToClipboard(abs, "path")`) and
**"Copy relative path"** (`copyToClipboard(file, "path")`, the repo-relative `file`
verbatim). The FileTree's own bespoke menu (which also has "Open in file viewer" /
"Open as Kanban board" / "Reveal in Finder") simply never got the relative-path
option and labels its absolute copy ambiguously as "Copy path". This task brings the
FileTree menu in line with that established convention.

**Fix (frontend only).** In the FileTree right-click menu:

1. **Relabel** the existing "Copy path" item to **"Copy absolute path"** (behavior
   unchanged — it already copies `${repoPath}/${menu.file}`).
2. **Add** a **"Copy relative path"** item that copies the repo-relative path
   (`menu.file`) via `copyToClipboard(menu.file, "path")`.

Place them adjacent (absolute then relative), mirroring the order/labels/semantics
of `filePathMenuItems` (#171) so the two menus read identically.

**Scope**

- `src/components/FileTree/FileTree.tsx` only: relabel the existing copy item, add
  the relative-path item, and bump the menu's bottom-edge position clamp so the now
  one-row-taller menu (5 items for a `.md` file: Open / Open as Kanban / Reveal /
  Copy absolute / Copy relative) doesn't overflow off-screen — the current clamp is
  `y: Math.max(8, Math.min(event.clientY, window.innerHeight - 160))` (~line 85);
  raise the `160` to fit the extra item (e.g. ~200).
- Applies everywhere the FileTree renders (sidebar, Overview column, Canvas panel) —
  one component, so a single change covers all surfaces.

**Out of scope**

- The sidebar **file-row** menu (#171) — it already has both options; untouched.
- **Folders** in the file tree have no context menu today ("Folders have no menu");
  keep it that way (the card is about files). Not adding copy-path to folders.
- No backend change, no new clipboard plumbing — reuse the existing
  `copyToClipboard(text, "path")` store action (which toasts "Copied path").
- Left-click behavior (opens the file) is unchanged — copying stays a right-click
  context-menu action.

**Subtasks**

1. [ ] In `FileTree.tsx`, change the existing copy item's label from "Copy path" to
   **"Copy absolute path"** (its `onClick` already does
   `copyToClipboard(`${repoPath}/${menu.file}`, "path")` — leave that as-is).
2. [ ] Add a new menu button **"Copy relative path"** immediately after it, with
   `onClick: () => { void copyToClipboard(menu.file, "path"); setMenu(null); }`
   (same `role="menuitem"` / `className={styles.menuItem}` markup as the siblings).
3. [ ] Raise the context-menu bottom clamp (`window.innerHeight - 160` → ~`- 200`)
   so the taller menu can't render partly off the bottom of the screen.
4. [ ] Verify: `npm run build` (type-check) + `npm run lint` clean; `npm test`
   passes. Manually in `npm run tauri dev`: right-click a file in a file-tree panel
   → both "Copy absolute path" (pastes `/Users/…/<repo>/<file>`) and "Copy relative
   path" (pastes the repo-relative `<file>`) work and each shows the "Copied path"
   toast; the menu stays fully on-screen when opened near the bottom edge.

**Acceptance criteria**

- [ ] The file-tree right-click menu shows **both** "Copy absolute path" and
      "Copy relative path" as distinct items.
- [ ] "Copy absolute path" copies the full on-disk path (`${repoPath}/${file}`);
      "Copy relative path" copies the repo-relative path (`file`).
- [ ] Both trigger the existing "Copied path" toast (via `copyToClipboard(…, "path")`).
- [ ] The labels/semantics match the sidebar file-row menu (#171
      `filePathMenuItems`).
- [ ] The menu renders fully on-screen even with the extra item near the viewport
      bottom.
- [ ] No backend change; `npm run build`, `npm run lint`, and `npm test` pass.

**Notes**

- **User decision (refine Q&A, 2026-06-26):** the two options are **absolute path +
  relative path** (the existing app convention), not filename-only or all-three. The
  card's wording "absolute path (not entire path)" was ambiguous; "not entire path"
  resolves to the repo-relative path.
- The single current "Copy path" item already copies the **absolute** path, so this
  is really "relabel + add the relative option," not a behavioral change to the
  existing item.
- Reference implementation to mirror: `filePathMenuItems` in `Sidebar.tsx`
  (#171) — same labels, same `copyToClipboard(abs|file, "path")` calls. FileTree
  keeps its own inline menu markup (it has Open / Kanban / Reveal items that
  `filePathMenuItems` doesn't), so just add the one item rather than refactoring to
  the shared `RowContextMenu`.
