// macOS app menu (keybind rework): free ⌘W for the in-app "close panel" keybind.
//
// Tauri 2's default macOS menu carries a predefined **Close Window** item with the
// ⌘W accelerator in both its File and Window submenus. A menu accelerator is
// resolved by AppKit's key-equivalent chain, which a webview `preventDefault`
// cannot reliably beat — so with the default menu, the app's ⌘W (`close-panel`)
// would close the whole window instead of the focused panel. This rebuilds the
// default menu with every Close Window item swapped for a custom one on
// **⇧⌘W** (still handled here, closing the focused window), leaving plain ⌘W to
// reach the webview like any other chord. Everything else (the Edit menu that
// backs ⌘C/⌘V in WKWebView, About/Services/Hide/Quit, fullscreen) is preserved
// verbatim from `Menu::default`.
//
// Windows and Linux create **no** default menu (nothing intercepts Ctrl+W), so
// the setup call site is `#[cfg(target_os = "macos")]`; the module itself
// compiles on every OS (the tauri menu API is portable) so all hosts type-check
// and unit-test it, mirroring the `explorer_select_arg` precedent.

use tauri::menu::{Menu, MenuItem, MenuItemKind};
use tauri::{AppHandle, Manager, Runtime};

/// Menu-id prefix for the replacement Close Window items; the shared
/// `on_menu_event` handler matches on it.
const CLOSE_WINDOW_ID_PREFIX: &str = "recue-close-window";

/// The accelerator for the replacement item: ⇧⌘W — the VS Code convention where
/// ⌘W closes a tab/panel and ⇧⌘W closes the window.
const CLOSE_WINDOW_ACCELERATOR: &str = "CmdOrCtrl+Shift+W";

/// True when a predefined menu item's text is the (locale-independent, muda
/// English constant) Close Window label. muda embeds a Windows mnemonic marker
/// in the constant ("C&lose Window"), so `&` is stripped before comparing; the
/// bare Windows "Close" text is matched too so the predicate is total. Pure.
fn is_close_window_text(text: &str) -> bool {
    let clean = text.replace('&', "");
    clean == "Close Window" || clean == "Close"
}

/// Replace every predefined Close Window (⌘W) item in the default menu with a
/// custom ⇧⌘W one, set the result as the app menu, and wire the close handler.
/// Best-effort by contract: the caller ignores errors (the default menu then
/// stands, and the in-app ⌘W keybind is preempted by it — never a crash).
pub fn install<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let handle = app.handle();
    let menu = Menu::default(handle)?;

    // Walk each submenu; swap Close Window items in place so menu order is kept.
    // The accelerator goes on the first replacement only — two live ⇧⌘W
    // key-equivalents in one menu bar would shadow each other.
    let mut replaced = 0usize;
    for item in menu.items()? {
        let MenuItemKind::Submenu(sub) = item else {
            continue;
        };
        let children = sub.items()?;
        for (pos, child) in children.iter().enumerate() {
            let MenuItemKind::Predefined(predefined) = child else {
                continue;
            };
            if !is_close_window_text(&predefined.text()?) {
                continue;
            }
            let replacement = MenuItem::with_id(
                handle,
                format!("{CLOSE_WINDOW_ID_PREFIX}-{replaced}"),
                "Close Window",
                true,
                if replaced == 0 {
                    Some(CLOSE_WINDOW_ACCELERATOR)
                } else {
                    None
                },
            )?;
            sub.remove_at(pos)?;
            sub.insert(&replacement, pos)?;
            replaced += 1;
        }
    }

    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref().starts_with(CLOSE_WINDOW_ID_PREFIX) {
            close_focused_window(app);
        }
    });
    Ok(())
}

/// Close the focused window (the replacement item's action) — same effect as the
/// native item it replaces: the red traffic light / ⌘W-of-old. Closing the main
/// window exits like before; closing a detached canvas window re-docks its tab
/// (#84's Destroyed handler).
fn close_focused_window<R: Runtime>(app: &AppHandle<R>) {
    for window in app.webview_windows().values() {
        if window.is_focused().unwrap_or(false) {
            let _ = window.close();
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_mudas_close_window_texts() {
        // muda's English constants: mnemonic-marked on non-Windows, bare on Windows.
        assert!(is_close_window_text("C&lose Window"));
        assert!(is_close_window_text("Close Window"));
        assert!(is_close_window_text("Close"));
    }

    #[test]
    fn never_matches_other_predefined_items() {
        for text in [
            "Minimize",
            "Zoom",
            "Hide",
            "Hide Others",
            "Quit",
            "Copy",
            "Paste",
            "Select All",
            "Enter Full Screen",
            "Services",
        ] {
            assert!(!is_close_window_text(text), "matched {text:?}");
        }
    }

    #[test]
    fn replacement_uses_the_shifted_chord_and_a_matchable_id() {
        // The accelerator must keep Cmd+W free (that's the whole point) and the
        // event handler matches ids by prefix.
        assert!(CLOSE_WINDOW_ACCELERATOR.contains("Shift"));
        assert!(CLOSE_WINDOW_ACCELERATOR.ends_with("+W"));
        assert!("recue-close-window-0".starts_with(CLOSE_WINDOW_ID_PREFIX));
    }
}
