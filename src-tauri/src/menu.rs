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
// Multi-window 10/16 also inserts a **File → New Window** item (+ separator) at
// the top of the File submenu, opening a new FULL app window (task 434). It
// carries no accelerator on purpose — see the comment at the insert site.
//
// Windows and Linux create **no** default menu (nothing intercepts Ctrl+W), so
// the setup call site is `#[cfg(target_os = "macos")]`; the module itself
// compiles on every OS (the tauri menu API is portable) so all hosts type-check
// and unit-test it, mirroring the `explorer_select_arg` precedent.
//
// `install` is deliberately **concrete** (`&tauri::App`, the default Wry runtime),
// not generic over `R: Runtime`: the menu-event closure calls task 434's
// `commands::open_app_window`, a `#[tauri::command]` over the concrete
// `AppHandle` — a generic closure couldn't call it. The only call site (`lib.rs`
// setup) already passes the concrete `App`, so nothing is lost.

use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::{AppHandle, Manager, Runtime};

/// Menu-id prefix for the replacement Close Window items; the shared
/// `on_menu_event` handler matches on it.
const CLOSE_WINDOW_ID_PREFIX: &str = "recue-close-window";

/// The accelerator for the replacement item: ⇧⌘W — the VS Code convention where
/// ⌘W closes a tab/panel and ⇧⌘W closes the window.
const CLOSE_WINDOW_ACCELERATOR: &str = "CmdOrCtrl+Shift+W";

/// Menu id for the File → New Window item (Multi-window 10/16). Deliberately does
/// NOT share CLOSE_WINDOW_ID_PREFIX — the close handler matches by prefix.
const NEW_WINDOW_ID: &str = "recue-new-window";

/// True when a predefined menu item's text is the (locale-independent, muda
/// English constant) Close Window label. muda embeds a Windows mnemonic marker
/// in the constant ("C&lose Window"), so `&` is stripped before comparing; the
/// bare Windows "Close" text is matched too so the predicate is total. Pure.
fn is_close_window_text(text: &str) -> bool {
    let clean = text.replace('&', "");
    clean == "Close Window" || clean == "Close"
}

/// True when a submenu's text is the (muda English constant) File menu label —
/// mnemonic-marked "&File" on Windows-style constants, bare "File" on macOS. Pure.
fn is_file_menu_text(text: &str) -> bool {
    text.replace('&', "") == "File"
}

/// Replace every predefined Close Window (⌘W) item in the default menu with a
/// custom ⇧⌘W one, insert a New Window item at the top of the File submenu
/// (Multi-window 10/16), set the result as the app menu, and wire the handlers.
/// Best-effort by contract: the caller ignores errors (the default menu then
/// stands, and the in-app ⌘W keybind is preempted by it — never a crash). A
/// missing File submenu just skips the New Window insert; the rest installs.
pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let menu = Menu::default(handle)?;

    // Pass 1 — File → New Window (Multi-window 10/16): opens a new FULL app
    // window (task 434). No accelerator on purpose — an AppKit key-equivalent is
    // resolved ahead of the webview (the ⌘W lesson this module exists for) and a
    // static one could never track the rebindable "new-window" chord (default
    // ⌘⌥N), which the webview dispatcher owns. Windows/Linux create no menu —
    // there the keybind is the only chord entry point. Done in its own pass
    // BEFORE the close-window swap so the swap loop's positions are those of a
    // fresh `items()` read.
    for item in menu.items()? {
        let MenuItemKind::Submenu(sub) = item else {
            continue;
        };
        if !is_file_menu_text(&sub.text()?) {
            continue;
        }
        let new_window =
            MenuItem::with_id(handle, NEW_WINDOW_ID, "New Window", true, None::<&str>)?;
        sub.insert(&new_window, 0)?;
        sub.insert(&PredefinedMenuItem::separator(handle)?, 1)?;
        break;
    }

    // Pass 2 — walk each submenu; swap Close Window items in place so menu order
    // is kept. The accelerator goes on the first replacement only — two live ⇧⌘W
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
        let id = event.id().as_ref();
        if id == NEW_WINDOW_ID {
            // Best-effort like everything in this module — a failed window create
            // logs and the menu stays functional.
            if let Err(e) = crate::commands::open_app_window(
                app.clone(),
                crate::commands::AppWindowInit::default(),
            ) {
                eprintln!("[recue] menu new window failed: {e}");
            }
        } else if id.starts_with(CLOSE_WINDOW_ID_PREFIX) {
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

    #[test]
    fn matches_the_file_menu_texts() {
        // muda's English constants: mnemonic-marked "&File" and bare "File".
        assert!(is_file_menu_text("File"));
        assert!(is_file_menu_text("&File"));
    }

    #[test]
    fn never_matches_other_submenus() {
        for text in ["Edit", "Window", "View", "Help", "Filet"] {
            assert!(!is_file_menu_text(text), "matched {text:?}");
        }
    }

    /// The prefix-matched close handler can never claim the New Window item
    /// (Multi-window 10/16).
    #[test]
    fn new_window_id_never_collides_with_the_close_prefix() {
        assert!(!NEW_WINDOW_ID.starts_with(CLOSE_WINDOW_ID_PREFIX));
    }
}
