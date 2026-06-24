//! Shared read + hot-reload-poll + debounced-auto-save hook for an editable repo
//! text file (#148). Generalizes the machinery the #143 KanbanPanel already uses
//! (read via `readTextFile`, poll while visible, debounced `writeTextFile`,
//! dirty-reconcile so the poll never clobbers in-progress typing) into one reuse
//! point for the FileViewer raw editor (#148) and the Kanban raw editor (#149).
//!
//! Reconcile rules (the re-render-clobbers-keystrokes pitfall): pause hot-reload
//! while the buffer is **dirty** or the editor is **focused**; never echo-reload
//! the panel's own writes (compare against the last-synced content); flush the
//! pending write on **blur** and on **unmount / file change**. Last-write-wins
//! while editing (a concurrent external edit during a session is overwritten — a
//! documented tradeoff, mirroring #143). An IME-composition guard keeps a
//! debounced save from firing mid-composition (CJK input).
//!
//! Auto vs manual save (#162): governed by the global `settings.autoSave`. Auto
//! (default) is the behavior above. Manual (off) updates the buffer + marks it
//! dirty but does NOT schedule a write or flush on blur; the user saves via ⌘S or
//! the Save button (`save()`). For data safety, manual mode STILL flushes a dirty
//! buffer on **unmount / file-switch** (so closing a panel can't silently lose
//! work). Every mounted buffer registers with `saverRegistry` so ⌘S can find it.

import { useCallback, useEffect, useRef, useState } from "react";

import { readTextFile, writeTextFile } from "./ipc";
import { registerSaver } from "./saverRegistry";
import { useStore } from "./store";

// Hot-reload poll while visible (#44/#143).
const POLL_MS = 1000;
// Debounce write-back (#94/#143 app convention).
const SAVE_DEBOUNCE_MS = 600;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutoSaveFile {
  /** Current editable buffer; null while first loading (or after a read error). */
  text: string | null;
  /** The initial read failed. */
  error: boolean;
  /** Debounced-save status for a subtle inline hint (auto mode). */
  status: SaveStatus;
  /** Update the buffer — marks dirty; auto mode schedules a debounced write,
   * manual mode waits for `save()` / ⌘S (#162). */
  setText: (next: string) => void;
  /** Unsaved edits in the buffer (#162) — drives the manual-mode Save button. */
  dirty: boolean;
  /** Manual save mode is active (#162) — `settings.autoSave === false`. */
  manual: boolean;
  /** Flush the dirty buffer to disk now (#162) — the Save button / ⌘S. No-op when
   * clean. */
  save: () => void;
  /** Editor focus — pauses hot-reload so a poll can't clobber typing. */
  onFocus: () => void;
  /** Editor blur — flushes any pending write (auto mode) + resumes hot-reload. */
  onBlur: () => void;
  /** IME composition start — suppress a debounced save mid-composition. */
  onCompositionStart: () => void;
  /** IME composition end — re-arm the debounced save for the finished text. */
  onCompositionEnd: () => void;
}

/**
 * Read `file` from `repoPath` (polled while `active`), hold an editable buffer,
 * and save edits back — debounced (auto) or on demand (manual, #162). See the
 * module doc for the reconcile rules.
 */
export function useAutoSaveFile(
  repoPath: string,
  file: string,
  active: boolean,
): AutoSaveFile {
  const [text, setTextState] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirtyState, setDirtyState] = useState(false);

  // Manual vs auto save mode (#162) — a ref so the stable callbacks read the
  // current value without being recreated (which would re-arm timers/registry).
  const autoSave = useStore((s) => s.settings.autoSave);
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  const lastSynced = useRef<string | null>(null);
  const dirty = useRef(false);
  const focused = useRef(false);
  const composing = useRef(false);
  const inFlight = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef<string | null>(null);
  textRef.current = text;

  // Mirror dirty into state (for the Save button) alongside the ref (read
  // synchronously by the reload reconcile).
  const markDirty = useCallback((v: boolean) => {
    dirty.current = v;
    setDirtyState(v);
  }, []);

  const writeNow = useCallback(
    (content: string) => {
      if (content === lastSynced.current) {
        markDirty(false);
        setStatus("saved");
        return;
      }
      setStatus("saving");
      void writeTextFile(repoPath, file, content)
        .then(() => {
          lastSynced.current = content;
          markDirty(false);
          setStatus("saved");
        })
        .catch(() => {
          // Keep dirty so the next edit (or blur/unmount flush) retries.
          setStatus("error");
        });
    },
    [repoPath, file, markDirty],
  );

  const scheduleWrite = useCallback(
    (content: string) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        // Don't save mid-IME-composition; onCompositionEnd re-arms this.
        if (!composing.current) writeNow(content);
      }, SAVE_DEBOUNCE_MS);
    },
    [writeNow],
  );

  const setText = useCallback(
    (next: string) => {
      setTextState(next);
      markDirty(true);
      if (autoSaveRef.current) {
        setStatus("saving");
        scheduleWrite(next);
      }
      // Manual mode (#162): buffer is dirty; wait for save() / ⌘S — no write.
    },
    [scheduleWrite, markDirty],
  );

  // Flush the dirty buffer to disk now (#162 manual Save / ⌘S). No-op when clean.
  const save = useCallback(() => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    if (dirty.current && textRef.current !== null) writeNow(textRef.current);
  }, [writeNow]);

  const load = useCallback(
    async (silent = false) => {
      // Never clobber unsaved edits / in-progress typing / a focused editor.
      if (inFlight.current || dirty.current || focused.current) return;
      inFlight.current = true;
      try {
        const next = await readTextFile(repoPath, file);
        setError(false);
        if (next !== lastSynced.current) {
          // Genuine external change (not our own write) → adopt it.
          lastSynced.current = next;
          setTextState(next);
        }
      } catch {
        if (!silent) {
          setTextState(null);
          setError(true);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [repoPath, file],
  );

  // Reset per file; flush a pending write for the previous file before switching.
  // The flush runs in BOTH modes (#162): closing a panel / switching files must
  // not silently lose manual-mode edits.
  useEffect(() => {
    lastSynced.current = null;
    markDirty(false);
    setStatus("idle");
    setTextState(null);
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
      if (dirty.current && textRef.current !== null) {
        void writeTextFile(repoPath, file, textRef.current).catch(() => {});
        dirty.current = false;
      }
    };
  }, [repoPath, file, markDirty]);

  // React to a save-mode change (#162): auto→manual cancels a pending debounce but
  // keeps the dirty buffer (wait for ⌘S); manual→auto schedules a write if dirty.
  useEffect(() => {
    if (autoSave) {
      if (dirty.current && textRef.current !== null)
        scheduleWrite(textRef.current);
    } else if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, [autoSave, scheduleWrite]);

  // Register with the manual-save registry (#162) so ⌘S can find this buffer.
  const saverId = useRef<string>(crypto.randomUUID());
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    return registerSaver(saverId.current, {
      isFocused: () => focused.current,
      isDirty: () => dirty.current,
      save: () => saveRef.current(),
    });
  }, []);

  // Fetch when shown / on file change.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Poll for hot-reload while visible; pause when hidden, catch up on regain.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined && !document.hidden) {
        timer = setInterval(() => void load(true), POLL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void load(true);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, load]);

  const onFocus = useCallback(() => {
    focused.current = true;
  }, []);

  const onBlur = useCallback(() => {
    focused.current = false;
    // Manual mode (#162): keep the dirty buffer; the user saves explicitly.
    if (!autoSaveRef.current) return;
    // Auto mode: flush a pending write immediately on blur.
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    if (dirty.current && textRef.current !== null) writeNow(textRef.current);
  }, [writeNow]);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composing.current = false;
    // Re-arm only in auto mode; manual mode waits for save().
    if (autoSaveRef.current && dirty.current && textRef.current !== null)
      scheduleWrite(textRef.current);
  }, [scheduleWrite]);

  return {
    text,
    error,
    status,
    setText,
    dirty: dirtyState,
    manual: !autoSave,
    save,
    onFocus,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
  };
}
