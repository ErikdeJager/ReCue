// Manual-save registry (#162). A tiny non-React singleton (like `outputBus` /
// `terminalPool`) that every mounted editable file buffer registers with, so the
// global ⌘S handler can flush the right one(s) without prop-drilling. Each
// `useAutoSaveFile` instance registers an entry exposing live focus/dirty queries
// and a `save()` that flushes its buffer to disk.
//
// `saveFocused()` is the ⌘S target: it saves the **focused** editor if one is
// focused (conventional document behavior), else **all** currently-dirty buffers —
// so ⌘S never appears to do nothing while edits are pending in an unfocused panel.

export interface Saver {
  /** Whether this editor currently has focus (drives "save the focused one"). */
  isFocused: () => boolean;
  /** Whether this buffer has unsaved edits. */
  isDirty: () => boolean;
  /** Flush the dirty buffer to disk now. */
  save: () => void;
}

const savers = new Map<string, Saver>();

/** Register a mounted editable buffer; returns an unregister fn for cleanup. */
export function registerSaver(id: string, saver: Saver): () => void {
  savers.set(id, saver);
  return () => {
    savers.delete(id);
  };
}

/**
 * Save in response to ⌘S: the focused editor if one is focused, otherwise every
 * dirty buffer. Returns the number of buffers actually saved (dirty ones flushed).
 */
export function saveFocused(): number {
  const all = [...savers.values()];
  const focused = all.find((s) => s.isFocused());
  if (focused) {
    if (focused.isDirty()) {
      focused.save();
      return 1;
    }
    return 0;
  }
  let saved = 0;
  for (const s of all) {
    if (s.isDirty()) {
      s.save();
      saved += 1;
    }
  }
  return saved;
}

/** Test/diagnostic: the number of registered savers. */
export function saverCount(): number {
  return savers.size;
}
