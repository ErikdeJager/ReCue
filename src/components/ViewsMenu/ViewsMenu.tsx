import { useEffect, useState } from "react";
import {
  FileDiff,
  FileText,
  SquareKanban,
  Terminal as TerminalIcon,
} from "lucide-react";

import { listFiles } from "../../ipc";
import { useStore } from "../../store";
import FilePicker from "../FilePicker/FilePicker";
import styles from "./ViewsMenu.module.css";

/**
 * The addable non-agent **view set** (#82), extracted (#164) into one shared
 * component so the Sidebar repo context menu and the worktree-badge popover render
 * the **same** actions against any folder — no duplicated action set. Each action
 * registers an `overviewPanels[repoPath]` entry (a left-panel row + Overview column,
 * #59/#152) without forcing a main-view switch (#79). **File viewer** / **Kanban
 * board** open a searchable `FilePicker` (#56) inline — Kanban scoped to `.md` with
 * the create-or-open flow (#142/#151). `onClose` dismisses the host popover/menu.
 */
function ViewsMenu({
  repoPath,
  onClose,
}: {
  repoPath: string;
  onClose: () => void;
}) {
  const addOverviewPanel = useStore((s) => s.addOverviewPanel);
  const createKanbanBoard = useStore((s) => s.createKanbanBoard);
  const [mode, setMode] = useState<"menu" | "files">("menu");
  const [fileKind, setFileKind] = useState<"markdown" | "kanban">("markdown");
  const [files, setFiles] = useState<string[] | null>(null);

  // Load the repo's files when a File/Kanban action enters the picker.
  useEffect(() => {
    if (mode !== "files") return;
    let cancelled = false;
    setFiles(null);
    void listFiles(repoPath)
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, repoPath]);

  if (mode === "files") {
    // Kanban is scoped to `.md` (#142); the same picker creates a new board (#151).
    const list =
      fileKind === "kanban"
        ? (files?.filter((f) => f.toLowerCase().endsWith(".md")) ?? null)
        : files;
    return (
      <FilePicker
        files={list}
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
            className={styles.item}
            onClick={v.run}
          >
            <Icon size={14} strokeWidth={1.5} className={styles.icon} />
            {v.label}
          </button>
        );
      })}
    </>
  );
}

export default ViewsMenu;
