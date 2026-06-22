import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FolderSearch, Loader, RotateCw } from "lucide-react";

import { listFiles } from "../../ipc";
import { useStore } from "../../store";
import type { CanvasContent } from "../../types";
import FilePicker from "../FilePicker/FilePicker";
import styles from "./Canvas.module.css";
import { blockDescriptor, blockPlaceholderLabel } from "./templateBlocks";

/**
 * A `kind:"pending"` Canvas panel from instantiating a template (#118): shows a
 * brief **loading** state while its block resolves, then is replaced by live
 * content — or, on failure, an **inline error with Retry** (never a toast / silent
 * skip). An `open-file` failure also offers **Pick file** (a `FilePicker` scoped to
 * the chosen folder) to choose a replacement path and retry. The panel keeps its
 * source block so Retry re-runs it in place; sibling panels are unaffected.
 */
function TemplatePendingPanel({
  leafId,
  content,
}: {
  leafId: string;
  content: CanvasContent;
}) {
  const canvasId = useStore((s) => s.activeCanvasId);
  const retry = useStore((s) => s.resolveTemplateBlock);
  const pickFile = useStore((s) => s.pickTemplateBlockFile);

  const block = content.block;
  const repoPath = content.repoPath ?? "";
  const desc = block ? blockDescriptor(block.kind) : undefined;
  const label = block ? blockPlaceholderLabel(block) : "block";

  const [picking, setPicking] = useState(false);
  const [files, setFiles] = useState<string[] | null>(null);
  const pickRef = useRef<HTMLDivElement>(null);

  // Load the folder's files when the picker opens (#56 list).
  useEffect(() => {
    if (!picking) return;
    setFiles(null);
    let cancelled = false;
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
  }, [picking, repoPath]);

  // Dismiss the picker on outside-click / Escape.
  useEffect(() => {
    if (!picking) return;
    const onDown = (event: MouseEvent) => {
      if (pickRef.current && !pickRef.current.contains(event.target as Node)) {
        setPicking(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicking(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [picking]);

  if (!content.error) {
    return (
      <div className={styles.pending}>
        <Loader
          size={16}
          strokeWidth={1.5}
          className={styles.pendingSpin}
          aria-hidden
        />
        <span className={styles.pendingText}>Starting {label}…</span>
      </div>
    );
  }

  return (
    <div className={styles.pendingError}>
      <AlertTriangle
        size={18}
        strokeWidth={1.5}
        className={styles.pendingErrIcon}
        aria-hidden
      />
      <p className={styles.pendingErrMsg}>{content.error}</p>
      <div className={styles.pendingActions}>
        {desc?.config === "file" && (
          <div className={styles.pickWrap} ref={pickRef}>
            <button
              type="button"
              className={styles.pendingBtn}
              onClick={() => setPicking((p) => !p)}
            >
              <FolderSearch size={13} strokeWidth={1.5} /> Pick file
            </button>
            {picking && (
              <div
                className={styles.pickPopover}
                role="dialog"
                aria-label="Pick file"
              >
                <FilePicker
                  files={files}
                  onPick={(f) => {
                    setPicking(false);
                    pickFile(canvasId, leafId, f);
                  }}
                />
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={styles.pendingBtn}
          onClick={() => void retry(canvasId, leafId)}
        >
          <RotateCw size={13} strokeWidth={1.5} /> Retry
        </button>
      </div>
    </div>
  );
}

export default TemplatePendingPanel;
