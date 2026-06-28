#!/usr/bin/env bash
# Render src-tauri/dmg-background.svg → src-tauri/dmg-background.png (the DMG install
# window background, wired up in tauri.conf.json bundle.macOS.dmg).
#
# macOS-only — uses Quick Look (qlmanage, WebKit-backed) to rasterize the SVG and sips
# to downscale, so there are NO extra dependencies. The committed PNG is what the
# release build consumes; re-run this after editing the SVG.
#
#   ./scripts/render-dmg-background.sh
#
# Supersample at 2× then downscale for crisp text. qlmanage emits a square canvas at
# the largest side, so the SVG is authored square (660×660) to avoid letterboxing.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/src-tauri/dmg-background.svg"
out="$here/src-tauri/dmg-background.png"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Run from src-tauri/ so the SVG's relative <image href="icons/icon.png"> resolves.
cd "$here/src-tauri"
qlmanage -t -s 1320 -o "$tmp" dmg-background.svg >/dev/null 2>&1

rendered="$tmp/dmg-background.svg.png"
[ -f "$rendered" ] || { echo "qlmanage failed to render $src" >&2; exit 1; }

sips -z 660 660 "$rendered" --out "$out" >/dev/null
echo "Wrote $out ($(sips -g pixelWidth -g pixelHeight "$out" | tail -2 | tr -d '\n'))"
