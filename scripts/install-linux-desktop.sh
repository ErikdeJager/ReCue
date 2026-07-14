#!/usr/bin/env bash
# Install (or remove) ReCue's desktop entry + icons for the current user, from a ReCue
# AppImage — so the app appears in your application menu and its running window groups
# under the right icon in the dock/taskbar/alt-tab (#362).
#
# WHY THIS EXISTS
# ---------------
# An AppImage is a single self-contained file: nothing about it is "installed", so your
# desktop never learns its name, its icon, or — crucially — its `StartupWMClass`, the key
# that tells the shell "the window whose WM_CLASS / Wayland app_id is `recue` belongs to
# THIS launcher". Without an entry, ReCue shows up as an anonymous, iconless tile.
#
# ReCue itself NEVER writes to your desktop directories — no auto-integration, no
# phone-home, nothing behind your back. Running this script IS the consent. Everything it
# writes lives under $XDG_DATA_HOME (default ~/.local/share); it never uses sudo, never
# touches anything outside your home, and `--uninstall` removes exactly what it wrote.
#
# SINGLE SOURCE OF TRUTH
# ----------------------
# The desktop entry is copied out of the AppImage itself — including its StartupWMClass,
# which ReCue's bundler generates from the identifier the app pins at startup
# (`src-tauri/src/linux_desktop.rs`). This script deliberately does NOT know that value:
# a second, hand-maintained copy of it drifting from the first is precisely the bug this
# fixes. Only the exec lines are rewritten, to point at the AppImage's real path.
#
# USAGE
# -----
#   scripts/install-linux-desktop.sh [--yes] <path/to/ReCue_*.AppImage>
#   scripts/install-linux-desktop.sh --uninstall [--yes]
#
#   --yes, -y   Skip the confirmation prompt (for scripted installs).
#   --uninstall Remove the entry + icons this script installed.
#
# Prefer a desktop integrator (Gear Lever, appimaged, AppImageLauncher)? Use it instead —
# it writes an equivalent entry. See docs/linux-desktop-integration.md.

set -euo pipefail

# The desktop-entry id / icon name. This is only a FILENAME (recue.desktop, recue.png) —
# it matches the names the AppImage already uses internally. The window-matching value
# (StartupWMClass) is never hardcoded here; it is copied verbatim from the AppImage.
ID="recue"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APPS="$DATA_HOME/applications"
ICONS="$DATA_HOME/icons/hicolor"
FALLBACK_ICON_DIR="$DATA_HOME/$ID"

ASSUME_YES=0
UNINSTALL=0
APPIMAGE=""

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Install ReCue's desktop entry + icons for the current user, from a ReCue AppImage.

  install-linux-desktop.sh [--yes] <path/to/ReCue_*.AppImage>
  install-linux-desktop.sh --uninstall [--yes]

  -y, --yes     Skip the confirmation prompt (for scripted installs).
      --uninstall  Remove the entry + icons this script installed.

Writes only under $XDG_DATA_HOME (default ~/.local/share). Never uses sudo.
EOF
  exit "${1:-0}"
}

# --- parse args -------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -y | --yes) ASSUME_YES=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h | --help) usage 0 ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *)
      [ -z "$APPIMAGE" ] || die "unexpected extra argument: $1"
      APPIMAGE="$1"
      ;;
  esac
  shift
done

[ "$(uname -s)" = "Linux" ] || die "this script only makes sense on Linux (desktop entries are a freedesktop.org thing)."

# Ask before touching anything. A non-interactive shell must pass --yes explicitly.
confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  if [ ! -t 0 ]; then
    die "not an interactive terminal — re-run with --yes to confirm."
  fi
  printf '\nProceed? [y/N] '
  read -r reply
  case "$reply" in
    y | Y | yes | YES) return 0 ;;
    *)
      echo "Aborted. Nothing was written."
      exit 1
      ;;
  esac
}

refresh_caches() {
  # All best-effort: a missing tool is not an error, and neither is a failure to refresh.
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$ICONS" >/dev/null 2>&1 || true
  fi
}

# --- uninstall --------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  [ -z "$APPIMAGE" ] || die "--uninstall takes no AppImage path."

  targets=()
  if [ -f "$APPS/$ID.desktop" ]; then
    targets+=("$APPS/$ID.desktop")
  fi
  while IFS= read -r icon; do
    [ -n "$icon" ] && targets+=("$icon")
  done < <(find "$ICONS" -type f -path "*/apps/$ID.png" 2>/dev/null || true)
  if [ -d "$FALLBACK_ICON_DIR" ]; then
    targets+=("$FALLBACK_ICON_DIR/")
  fi

  if [ "${#targets[@]}" -eq 0 ]; then
    echo "Nothing to remove — no ReCue desktop entry or icons found under $DATA_HOME."
    exit 0
  fi

  echo "The following files will be REMOVED:"
  printf '  %s\n' "${targets[@]}"
  confirm

  rm -f "$APPS/$ID.desktop"
  find "$ICONS" -type f -path "*/apps/$ID.png" -delete 2>/dev/null || true
  rm -rf "$FALLBACK_ICON_DIR"
  refresh_caches

  echo
  echo "Removed. ReCue's AppImage itself was not touched."
  exit 0
fi

# --- install ----------------------------------------------------------------------
[ -n "$APPIMAGE" ] || usage 1
[ -e "$APPIMAGE" ] || die "no such file: $APPIMAGE"
APPIMAGE="$(readlink -f "$APPIMAGE")"
[ -f "$APPIMAGE" ] || die "not a regular file: $APPIMAGE"

if [ ! -x "$APPIMAGE" ]; then
  echo "note: $APPIMAGE was not executable — running chmod +x on it."
  chmod +x "$APPIMAGE"
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# `--appimage-extract <pattern>` unpacks just what we need (no FUSE required). Some
# builds ignore the pattern, so fall back to a full extract before giving up.
(
  cd "$WORK"
  "$APPIMAGE" --appimage-extract 'usr/share/applications/*.desktop' >/dev/null 2>&1 || true
  "$APPIMAGE" --appimage-extract 'usr/share/icons/*' >/dev/null 2>&1 || true
  if [ -z "$(find squashfs-root -name '*.desktop' 2>/dev/null || true)" ]; then
    "$APPIMAGE" --appimage-extract >/dev/null 2>&1 || true
  fi
)

SRC_DESKTOP="$(find "$WORK/squashfs-root" -name '*.desktop' 2>/dev/null | head -1)"
[ -n "$SRC_DESKTOP" ] || die "no .desktop entry inside $APPIMAGE — is it a ReCue AppImage?"

# The window-matching key. It MUST come from the AppImage: this script never invents it.
WM_CLASS_LINE="$(grep -m1 '^StartupWMClass=' "$SRC_DESKTOP" || true)"
if [ -z "$WM_CLASS_LINE" ]; then
  die "$(basename "$SRC_DESKTOP") inside this AppImage has no StartupWMClass= line.
       Your AppImage predates ReCue's desktop-entry fix (#362) — update to a newer
       release, or add the line by hand (see docs/linux-desktop-integration.md)."
fi

DEST_DESKTOP="$APPS/$ID.desktop"

# Icons: prefer the AppImage's hicolor set; fall back to its top-level .DirIcon/PNG.
SRC_ICONS=()
while IFS= read -r icon; do
  [ -n "$icon" ] && SRC_ICONS+=("$icon")
done < <(find "$WORK/squashfs-root/usr/share/icons/hicolor" -type f -name '*.png' 2>/dev/null | sort || true)

FALLBACK_ICON=""
if [ "${#SRC_ICONS[@]}" -eq 0 ]; then
  FALLBACK_ICON="$(find "$WORK/squashfs-root" -maxdepth 1 \( -name "$ID.png" -o -name '.DirIcon' \) 2>/dev/null | head -1 || true)"
fi

echo "ReCue desktop integration (user-level, no sudo, nothing outside \$XDG_DATA_HOME)"
echo
echo "  AppImage:  $APPIMAGE"
echo "  Matching:  $WM_CLASS_LINE   (copied verbatim from the AppImage)"
echo
echo "The following files will be WRITTEN (overwriting any earlier copy):"
echo "  $DEST_DESKTOP"
for src in ${SRC_ICONS[@]+"${SRC_ICONS[@]}"}; do
  size="$(basename "$(dirname "$(dirname "$src")")")"
  echo "  $ICONS/$size/apps/$ID.png"
done
if [ -n "$FALLBACK_ICON" ]; then
  echo "  $FALLBACK_ICON_DIR/$ID.png   (the AppImage ships no hicolor icon set)"
fi
confirm

mkdir -p "$APPS"

# Copy the entry verbatim, rewriting ONLY the two exec lines:
#   Exec    — double-quoted absolute path, per the Desktop Entry spec, so a path with
#             spaces works. (Inside the AppImage this is the bare binary name, which
#             AppRun resolves in the AppDir; from your menu it must be the real path.)
#   TryExec — the same path, so the entry hides itself if the AppImage is moved/deleted.
# Everything else — StartupWMClass, Icon, Name, Comment, Categories, Keywords — is
# preserved exactly as ReCue shipped it.
awk -v exec_path="$APPIMAGE" '
  /^Exec=/    { printf "Exec=\"%s\"\n", exec_path; next }
  /^TryExec=/ { next }
  /^\[Desktop Entry\]/ { print; printf "TryExec=%s\n", exec_path; next }
  { print }
' "$SRC_DESKTOP" >"$DEST_DESKTOP"
chmod 644 "$DEST_DESKTOP"

for src in ${SRC_ICONS[@]+"${SRC_ICONS[@]}"}; do
  size="$(basename "$(dirname "$(dirname "$src")")")"
  install -Dm644 "$src" "$ICONS/$size/apps/$ID.png"
done

if [ -n "$FALLBACK_ICON" ]; then
  install -Dm644 "$FALLBACK_ICON" "$FALLBACK_ICON_DIR/$ID.png"
  # No themed icon to look up by name — point the entry at the absolute path instead.
  sed -i "s|^Icon=.*|Icon=$FALLBACK_ICON_DIR/$ID.png|" "$DEST_DESKTOP"
fi

refresh_caches

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "$DEST_DESKTOP" || echo "warning: desktop-file-validate reported the above (the entry was still installed)."
fi

echo
echo "Installed:"
echo "  $DEST_DESKTOP"
find "$ICONS" -type f -path "*/apps/$ID.png" -printf '  %p\n' 2>/dev/null || true
if [ -n "$FALLBACK_ICON" ]; then
  echo "  $FALLBACK_ICON_DIR/$ID.png"
fi
echo
echo "ReCue should now appear in your application menu (some desktops need a re-login)."
echo "Undo at any time with:  $0 --uninstall"
