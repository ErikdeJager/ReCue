#!/usr/bin/env bash
# Park a DMG's hidden helper files off the visible canvas so the install window stays
# clean even when the user has "show hidden files" (⌘⇧.) enabled. macOS-only.
#
# Tauri's DMG bundler positions the app + Applications icons and a background image, but
# leaves the dot-prefixed helpers (.background, .VolumeIcon.icns, .fseventsd, .Trashes)
# unpositioned — relying on them being hidden. A user (or developer) with hidden files
# shown then sees them auto-arranged INTO the window, overlapping the content. This
# post-build step rewrites the DMG's .DS_Store to move those icons far off-canvas. The
# files themselves stay in place, so the background image and volume icon still work.
#
#   ./scripts/polish-dmg.sh path/to/ReCue_x.y.z.dmg
#
# Re-run on any freshly built .dmg (locally after `tauri build`, or in CI before upload).
# The project's DMGs are unsigned, so repackaging is lossless here.
set -euo pipefail

src="${1:?usage: polish-dmg.sh <path-to-dmg>}"
[ -f "$src" ] || { echo "polish-dmg: no such file: $src" >&2; exit 1; }

work="$(mktemp -d)"
mnt=""
cleanup() {
  [ -n "$mnt" ] && hdiutil detach "$mnt" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

rw="$work/rw.dmg"

# Read-only/compressed → read-write so Finder can rewrite the .DS_Store.
hdiutil convert "$src" -format UDRW -o "$rw" >/dev/null

# Attach without popping a Finder window; derive the mount point (handles spaces).
attach_out="$(hdiutil attach "$rw" -readwrite -noverify -noautoopen)"
mnt="$(printf '%s\n' "$attach_out" | grep -oE '/Volumes/.*' | head -1)"
[ -n "$mnt" ] || { echo "polish-dmg: could not find mounted volume" >&2; exit 1; }
vol="$(basename "$mnt")"

# Move each helper icon off-canvas (best-effort per item; leave app/Applications alone).
osascript - "$vol" <<'OSA'
on run argv
  set volName to item 1 of argv
  set helpers to {".background", ".VolumeIcon.icns", ".fseventsd", ".Trashes", ".DS_Store"}
  tell application "Finder"
    tell disk volName
      open
      set current view of container window to icon view
      set yy to 3000
      repeat with h in helpers
        try
          set position of item (h as string) to {3600, yy}
          set yy to yy + 160
        end try
      end repeat
      close
    end tell
    delay 0.5
  end tell
end run
OSA
sync

hdiutil detach "$mnt" >/dev/null
mnt=""

# Re-compress to a distributable read-only image, replacing the original in place.
out="$work/out.dmg"
hdiutil convert "$rw" -format UDZO -imagekey zlib-level=9 -o "$out" >/dev/null
mv -f "$out" "$src"
echo "polish-dmg: parked helper icons off-canvas in $(basename "$src")"
