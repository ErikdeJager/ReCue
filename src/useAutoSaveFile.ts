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
//!
//! Cross-window edit guard (Multi-window task 435): the last-write-wins tradeoff
//! above is narrowed for the one common concurrent-writer case — two ReCue
//! windows editing the same file. The hook soft-claims `{repoPath, file}` for
//! this window when its editor **focuses or dirties** (the Rust `file_claims`
//! registry; all decisions via the pure `claimIntent`), and releases it once
//! **blurred/idle AND clean** (manual mode keeps a dirty buffer's claim past blur
//! until Save settles) and on unmount/file-switch. While a FOREIGN window holds
//! the claim, `lockedBy` names it and `setText`/`save` are hard no-ops (the
//! consumers mirror that as read-only UI with a "Take over" banner); the
//! hot-reload poll keeps running so the read-only view live-follows the other
//! window's saves. Claims are advisory (never an on-disk lock, fire-and-forget
//! IPC) — a stale/raced claim degrades to exactly the last-writer-wins above.

import { useCallback, useEffect, useRef, useState } from "react";

import { claimIntent, heldElsewhere } from "./fileClaims";
import {
  claimFile,
  readTextFile,
  releaseFileClaim,
  writeTextFile,
} from "./ipc";
import { registerSaver } from "./saverRegistry";
import { useStore } from "./store";
import { WINDOW_LABEL } from "./windowContext";

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
  /** The FOREIGN window currently soft-claiming this file (task 435), or null.
   * While set, `setText`/`save` are hard no-ops and the consumer renders
   * read-only + a "Being edited in another window — Take over" banner. Stays
   * null for this window's own claim, so one window on a file is unchanged. */
  lockedBy: string | null;
  /** Claim the file for THIS window unconditionally (task 435) — the banner's
   * "Take over". The broadcast flips the former holder to read-only (it
   * flushes its dirty buffer once in auto mode; last-writer-wins on overlap). */
  takeOver: () => void;
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

  // Cross-window soft claim (task 435): the FOREIGN window holding this file, or
  // null (free / held by us — own-label claims are invisible, so one window on a
  // file behaves exactly as before). Mirrored into a ref so the stable callbacks
  // read the current value, plus `heldRef` — "THIS hook instance asserted the
  // claim". Multiple instances in one window each track their own heldRef against
  // the same window-level claim: the backend dedupes same-label claims, and an
  // instance releasing while a sibling still edits leaves a microsecond soft gap
  // the sibling's next edit re-claims (accepted — advisory, no refcounting).
  const lockedBy = useStore((s) =>
    heldElsewhere(s.fileClaims, repoPath, file, WINDOW_LABEL),
  );
  const lockedByRef = useRef(lockedBy);
  lockedByRef.current = lockedBy;
  const heldRef = useRef(false);

  // Evaluate + act on the claim lifecycle (task 435): every call site routes
  // through the pure `claimIntent`. IPC is fire-and-forget (`.catch(() => {})`)
  // so vitest / a plain dev server behave exactly as before.
  const syncClaim = useCallback(() => {
    const intent = claimIntent({
      held: heldRef.current,
      focused: focused.current,
      dirty: dirty.current,
      lockedByOther: lockedByRef.current !== null,
    });
    if (intent === "claim") {
      heldRef.current = true;
      void claimFile(repoPath, file, WINDOW_LABEL).catch(() => {});
    } else if (intent === "release") {
      heldRef.current = false;
      void releaseFileClaim(repoPath, file, WINDOW_LABEL).catch(() => {});
    }
  }, [repoPath, file]);

  const writeNow = useCallback(
    (content: string) => {
      if (content === lastSynced.current) {
        markDirty(false);
        setStatus("saved");
        // A blurred/manual save settling clean releases the claim (task 435).
        syncClaim();
        return;
      }
      setStatus("saving");
      void writeTextFile(repoPath, file, content)
        .then(() => {
          lastSynced.current = content;
          markDirty(false);
          setStatus("saved");
          syncClaim();
        })
        .catch(() => {
          // Keep dirty so the next edit (or blur/unmount flush) retries.
          setStatus("error");
        });
    },
    [repoPath, file, markDirty, syncClaim],
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
      // Hard gate (task 435): while a FOREIGN window holds the claim this buffer
      // is read-only — defense in depth, so no write can fight regardless of any
      // UI gate a consumer misses. Keys on the locally-known claim map, so a
      // not-yet-delivered claim can never block anyone (fail-open).
      if (lockedByRef.current) return;
      setTextState(next);
      markDirty(true);
      // Claim on first dirty (task 435) — covers the Kanban drag path, which
      // mutates via setText without ever focusing an editor.
      syncClaim();
      if (autoSaveRef.current) {
        setStatus("saving");
        scheduleWrite(next);
      }
      // Manual mode (#162): buffer is dirty; wait for save() / ⌘S — no write.
    },
    [scheduleWrite, markDirty, syncClaim],
  );

  // Flush the dirty buffer to disk now (#162 manual Save / ⌘S). No-op when clean.
  const save = useCallback(() => {
    // Hard gate (task 435): a foreign claim makes manual save a no-op too — the
    // dirty buffer is kept in memory until a take-back (Save renders disabled).
    if (lockedByRef.current) return;
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
      // Hard gate (task 435) here too: with a FOREIGN claim another window owns
      // the file now — flushing this stale buffer would overwrite that window's
      // saved edits, so it is surrendered instead (the documented take-over
      // semantics; last-writer-wins only ever applies between un-claimed writers).
      if (dirty.current && textRef.current !== null && !lockedByRef.current) {
        void writeTextFile(repoPath, file, textRef.current).catch(() => {});
        dirty.current = false;
      }
      // Force-release this instance's claim on unmount / file-switch (task 435)
      // so a closed panel never leaves the file read-only elsewhere.
      if (heldRef.current) {
        heldRef.current = false;
        void releaseFileClaim(repoPath, file, WINDOW_LABEL).catch(() => {});
      }
    };
  }, [repoPath, file, markDirty]);

  // Loss of claim (task 435): another window claimed/took over this file while
  // this instance held it. Surrender locally (never "release" — that could clear
  // the NEW holder), cancel the pending debounce, and in auto mode flush the
  // dirty buffer ONCE so up to 600ms of typed text isn't silently dropped — any
  // overlap with the taker's first edit is the documented last-writer-wins
  // fallback. A manual-mode dirty buffer is kept in memory with Save disabled
  // until a take-back.
  useEffect(() => {
    if (lockedBy === null || !heldRef.current) return;
    heldRef.current = false;
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
    if (autoSaveRef.current && dirty.current && textRef.current !== null) {
      writeNow(textRef.current);
    }
  }, [lockedBy, writeNow]);

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
    // Claim on focus (task 435) — the editor engaged.
    syncClaim();
  }, [syncClaim]);

  const onBlur = useCallback(() => {
    focused.current = false;
    // Manual mode (#162): keep the dirty buffer; the user saves explicitly. The
    // claim is kept too (still dirty) until Save settles — syncClaim below.
    if (autoSaveRef.current) {
      // Auto mode: flush a pending write immediately on blur.
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
      if (dirty.current && textRef.current !== null) writeNow(textRef.current);
    }
    // Task 435: a clean blur releases now; a dirty one releases when the flush /
    // manual save settles (writeNow's completion re-evaluates).
    syncClaim();
  }, [writeNow, syncClaim]);

  const onCompositionStart = useCallback(() => {
    composing.current = true;
  }, []);

  const onCompositionEnd = useCallback(() => {
    composing.current = false;
    // Re-arm only in auto mode; manual mode waits for save().
    if (autoSaveRef.current && dirty.current && textRef.current !== null)
      scheduleWrite(textRef.current);
  }, [scheduleWrite]);

  // Take over a foreign claim (task 435): claim unconditionally — last claim
  // wins in the backend, and the broadcast flips the former holder's window to
  // read-only (its loss-of-claim effect flushes its dirty buffer once).
  const takeOver = useCallback(() => {
    heldRef.current = true;
    void claimFile(repoPath, file, WINDOW_LABEL).catch(() => {});
  }, [repoPath, file]);

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
    lockedBy,
    takeOver,
  };
}
