import { useState } from "react";
import {
  FileDiff,
  FileText,
  FolderTree,
  Plus,
  SquareKanban,
  Terminal as TerminalIcon,
} from "lucide-react";

import { useStore } from "../../store";
import FilePicker from "../FilePicker/FilePicker";

/**
 * The addable non-agent **view set** (#82), extracted (#164) into one shared
 * component so the Sidebar repo context menu and the worktree-badge popover render
 * the **same** actions against any folder — no duplicated action set. Each action
 * registers an `overviewPanels[repoPath]` entry (a left-panel row + Overview column,
 * #59/#152) without forcing a main-view switch (#79). **File viewer** / **Kanban
 * board** open a searchable `FilePicker` (#56) inline — Kanban scoped to `.md` with
 * the create-or-open flow (#142/#151). `onClose` dismisses the host popover/menu.
 *
 * `includeNewSession` (default `true`) renders the trailing **"New session here"**
 * instant-spawn action + its separator (#177; moved after the view items per the
 * UI v2 §10 demo order, task 375). Host menus that already render their own
 * top-level "New session" — the repo context menu and the worktree header menu
 * — pass `false` to avoid the duplicate (#201); the header `OpenViewButton` (#165/#213,
 * including worktree agents) keeps the default so it remains a new-session affordance.
 */
function ViewsMenu({
  repoPath,
  onClose,
  includeNewSession = true,
}: {
  repoPath: string;
  onClose: () => void;
  includeNewSession?: boolean;
}) {
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const createKanbanBoard = useStore((s) => s.createKanbanBoard);
  const spawnSession = useStore((s) => s.spawnSession);
  const [mode, setMode] = useState<"menu" | "files">("menu");
  const [fileKind, setFileKind] = useState<"markdown" | "kanban">("markdown");

  if (mode === "files") {
    // Kanban is scoped to `.md` (#142); the same picker creates a new board (#151).
    return (
      <FilePicker
        repoPath={repoPath}
        ext={fileKind === "kanban" ? ".md" : undefined}
        onPick={(f) => {
          void addOverviewPanel(repoPath, fileKind, f);
          onClose();
        }}
        onCreate={
          fileKind === "kanban"
            ? (name) => {
                void createKanbanBoard(repoPath, name);
                onClose();
              }
            : undefined
        }
        createSuffix={fileKind === "kanban" ? ".md" : undefined}
      />
    );
  }

  const items = [
    {
      key: "file",
      label: "File viewer",
      icon: FileText,
      run: () => {
        setFileKind("markdown");
        setMode("files");
      },
    },
    {
      key: "kanban",
      label: "Kanban board",
      icon: SquareKanban,
      run: () => {
        setFileKind("kanban");
        setMode("files");
      },
    },
    {
      key: "diff",
      label: "Diff viewer",
      icon: FileDiff,
      run: () => {
        void addOverviewPanel(repoPath, "diff");
        onClose();
      },
    },
    {
      key: "filetree",
      label: "File tree",
      icon: FolderTree,
      run: () => {
        void addOverviewPanel(repoPath, "filetree");
        onClose();
      },
    },
    {
      key: "terminal",
      label: "Terminal",
      icon: TerminalIcon,
      run: () => {
        void addOverviewPanel(repoPath, "terminal");
        onClose();
      },
    },
  ];

  return (
    <>
      {items.map((v) => {
        const Icon = v.icon;
        return (
          <button
            key={v.key}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={v.run}
          >
            <Icon size={13} strokeWidth={1.5} className="menu-icon" />
            {v.label}
          </button>
        );
      })}
      {/* Instant agent spawn on this folder's current branch — no modal (#177).
          A separate action from the "add a view" items, so it sits apart below a
          separator (view items first — the demo's §10 order, task 375). Suppressed
          (#201) when the host menu already renders its own top-level "New session"
          (repo / worktree header), so there's no duplicate. */}
      {includeNewSession && (
        <>
          <div className="menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              void spawnSession(repoPath);
              onClose();
            }}
          >
            <Plus size={13} strokeWidth={1.5} className="menu-icon" />
            New session here
          </button>
        </>
      )}
    </>
  );
}

export default ViewsMenu;
