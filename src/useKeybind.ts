// Live keybind labels for UI hint sites (buttons, tooltips, kbd chips). Reads the
// user's `settings.keybinds` overrides from the store, so a rebound shortcut's
// hint updates everywhere the moment Settings saves — a hardcoded `kbdHint`
// string would go stale. Returns `""` for an unbound action (callers hide the
// hint). Kept out of `keybinds.ts` so that module stays store-free / node-pure.

import { chordForAction, chordLabel, type KeybindActionId } from "./keybinds";
import { useStore } from "./store";

/** The display label of a rebindable action's **effective** chord — override or
 * default — styled for the platform (`"⌘W"` / `"Ctrl+W"`); `""` when unbound. */
export function useKeybindLabel(id: KeybindActionId): string {
  const platform = useStore((s) => s.platform);
  const overrides = useStore((s) => s.settings.keybinds);
  return chordLabel(chordForAction(id, overrides), platform);
}
