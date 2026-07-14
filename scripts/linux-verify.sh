#!/usr/bin/env bash
# linux-verify.sh — read-only evidence collector for ReCue's Linux real-box checklists.
#
# Prints the "Box under test" fingerprint plus one PASS/FAIL/SKIP line per *headless*
# check from TRAJECTORY_TO_LINUX.md's "Needs real-box verification" lists (#345, #346,
# #347, #349, #350, #351). It proves nothing that needs a GUI — those items stay on the
# maintainer checklist in the doc.
#
# Contract (deliberate, do not "fix"):
#   - READ-ONLY. It never writes outside stdout and $TMPDIR, never runs `git` writes,
#     never touches the app-data dir, never launches ReCue.
#   - `set -uo pipefail` — NOT `-e`. A failing check must record a FAIL and keep going.
#   - Always exits 0. The verdicts are the output, not the exit status.
#   - Portable: every Arch/Hyprland-ism (hyprctl, pacman, /proc/driver/nvidia) is behind an
#     availability guard, so it re-runs unchanged on Ubuntu/Mint under GNOME/KDE/Cinnamon.
#
# Usage:
#   bash scripts/linux-verify.sh            # safe everywhere; opens no windows
#   bash scripts/linux-verify.sh --open     # also runs the checks that POP WINDOWS on screen
#                                           # (xdg-open a URL + a folder, a FileManager1
#                                           #  reveal, a desktop notification)
#
# npm run verify:linux  ==  bash scripts/linux-verify.sh

set -uo pipefail

OPEN=0
for arg in "$@"; do
  case "$arg" in
    --open) OPEN=1 ;;
    -h | --help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (try --help)" >&2
      exit 0
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PASS_N=0
FAIL_N=0
SKIP_N=0

section() {
  printf '\n== %s ==\n' "$1"
}

kv() { printf '  %-22s %s\n' "$1" "$2"; }

# check <VERDICT> <id> <description> [evidence...]
check() {
  local verdict="$1" id="$2" desc="$3"
  shift 3
  printf '%-4s  %-14s %s\n' "$verdict" "$id" "$desc"
  local line
  for line in "$@"; do
    [ -n "$line" ] && printf '        %s\n' "$line"
  done
  case "$verdict" in
    PASS) PASS_N=$((PASS_N + 1)) ;;
    FAIL) FAIL_N=$((FAIL_N + 1)) ;;
    SKIP) SKIP_N=$((SKIP_N + 1)) ;;
  esac
}

have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# Box under test
# ---------------------------------------------------------------------------
section "Box under test"

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  kv "distro" "$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-$ID}")"
else
  kv "distro" "unknown (no /etc/os-release)"
fi
kv "kernel" "$(uname -r) $(uname -m)"
kv "session" "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-unset}"
kv "desktop" "XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-unset}"
kv "shell" "${SHELL:-unset}"

for card in /sys/class/drm/card[0-9]*; do
  [ -e "$card/device/driver" ] || continue
  drv="$(basename "$(readlink -f "$card/device/driver")")"
  vend="$(cat "$card/device/vendor" 2>/dev/null || echo '?')"
  kv "$(basename "$card")" "driver=$drv vendor=$vend"
done

if [ -r /proc/driver/nvidia/version ]; then
  kv "nvidia module" "$(head -1 /proc/driver/nvidia/version)"
else
  kv "nvidia module" "not loaded"
fi

kv "dmi" "$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || echo '?') / $(cat /sys/class/dmi/id/product_name 2>/dev/null || echo '?')"
kv "hypervisor" "$(cat /sys/hypervisor/type 2>/dev/null || echo 'no /sys/hypervisor/type')"
kv "cpu hypervisor flag" "$(grep -qm1 '^flags.*\bhypervisor\b' /proc/cpuinfo && echo yes || echo no)"

if have xdg-mime; then
  kv "file manager" "$(xdg-mime query default inode/directory 2>/dev/null || echo '?')"
  kv "browser (https)" "$(xdg-mime query default x-scheme-handler/https 2>/dev/null || echo '?')"
else
  kv "xdg-mime" "MISSING"
fi

if have ldconfig; then
  fuse_libs="$(ldconfig -p 2>/dev/null | grep -Eo 'libfuse[0-9]*\.so[^ ]*' | sort -u | tr '\n' ' ')"
  kv "fuse libs" "${fuse_libs:-none}"
fi

tools=""
for t in xdg-open dbus-send notify-send wl-paste wl-copy xclip claude git curl jq; do
  if have "$t"; then tools="$tools $t"; else tools="$tools -$t"; fi
done
kv "tools (- = missing)" "${tools# }"

if have dbus-send; then
  act="$(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus \
    org.freedesktop.DBus.ListActivatableNames 2>/dev/null |
    grep -Eo '"[^"]*(FileManager1|Notifications)[^"]*"' | tr -d '"' | sort -u | tr '\n' ' ')"
  kv "dbus (activatable)" "${act:-none}"
fi

if have hyprctl && [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
  kv "compositor" "Hyprland $(hyprctl version -j 2>/dev/null | grep -Eo '"tag": *"[^"]*"' | head -1 | cut -d'"' -f4)"
fi

# ---------------------------------------------------------------------------
# Headless checks
# ---------------------------------------------------------------------------
section "Headless checks"

# --- A2: the login-shell PATH probe (path_env::login_shell_path_blocking) -----
# Reproduced verbatim from src-tauri/src/path_env.rs.
probe_shell="${SHELL:-/bin/sh}"
raw="$("$probe_shell" -ilc 'printf "%s" "__RECUE_PATH__${PATH}__RECUE_PATH__"' </dev/null 2>/dev/null)"
probed_path="$(printf '%s' "$raw" | sed -n 's/.*__RECUE_PATH__\(.*\)__RECUE_PATH__.*/\1/p')"
claude_dir=""
if [ -n "$probed_path" ]; then
  IFS=':' read -r -a _segs <<<"$probed_path"
  for seg in "${_segs[@]}"; do
    [ -n "$seg" ] && [ -x "$seg/claude" ] && claude_dir="$seg" && break
  done
fi
if [ -n "$probed_path" ] && [ -n "$claude_dir" ]; then
  check PASS "A2-path" "login-shell PATH probe resolves a PATH containing an executable 'claude'" \
    "\$SHELL=$probe_shell; probed PATH has $(printf '%s' "$probed_path" | tr ':' '\n' | grep -c .) entries" \
    "claude found in: $claude_dir  ($(command -v claude || echo 'not on this shell PATH'))"
elif [ -n "$probed_path" ]; then
  check FAIL "A2-path" "login-shell PATH probe returned a PATH, but no 'claude' on it" \
    "\$SHELL=$probe_shell" \
    "PATH=$probed_path"
else
  check FAIL "A2-path" "login-shell PATH probe returned nothing (\$SHELL -ilc produced no marker)" \
    "\$SHELL=$probe_shell"
fi

# default_shell (pty.rs non_macos_unix_shell): $SHELL, else /bin/bash, else /bin/sh
if [ -n "${SHELL:-}" ] && [ -x "${SHELL:-}" ]; then
  check PASS "A2-shell" "default_shell resolves \$SHELL to an executable (PTY shell)" "\$SHELL=$SHELL"
elif [ -x /bin/bash ] || [ -x /bin/sh ]; then
  check PASS "A2-shell" "default_shell falls back to /bin/bash|/bin/sh (\$SHELL unusable)" \
    "\$SHELL=${SHELL:-unset}"
else
  check FAIL "A2-shell" "no usable shell for default_shell" "\$SHELL=${SHELL:-unset}"
fi

# --- A3: xdg-open handlers ----------------------------------------------------
desktop_installed() {
  local d="$1" p
  [ -n "$d" ] || return 1
  for p in "${XDG_DATA_HOME:-$HOME/.local/share}/applications" /usr/share/applications /usr/local/share/applications; do
    [ -f "$p/$d" ] && return 0
  done
  # flatpak / snap exports
  for p in /var/lib/flatpak/exports/share/applications "$HOME/.local/share/flatpak/exports/share/applications"; do
    [ -f "$p/$d" ] && return 0
  done
  return 1
}

if have xdg-open && have xdg-mime; then
  https_h="$(xdg-mime query default x-scheme-handler/https 2>/dev/null)"
  dir_h="$(xdg-mime query default inode/directory 2>/dev/null)"
  if desktop_installed "$https_h" && desktop_installed "$dir_h"; then
    check PASS "A3-handlers" "xdg-open has an installed handler for https and for a folder" \
      "x-scheme-handler/https -> ${https_h}" \
      "inode/directory       -> ${dir_h}"
  else
    check FAIL "A3-handlers" "an xdg-open handler is unset or its .desktop is not installed" \
      "x-scheme-handler/https -> ${https_h:-<unset>}" \
      "inode/directory       -> ${dir_h:-<unset>}"
  fi
else
  check SKIP "A3-handlers" "xdg-open / xdg-mime not installed"
fi

if [ "$OPEN" = 1 ] && have xdg-open; then
  xdg-open "https://example.com" >/dev/null 2>&1 &
  url_pid=$!
  sleep 2
  xdg-open "$REPO_ROOT" >/dev/null 2>&1 &
  dir_pid=$!
  sleep 2
  wait "$url_pid" 2>/dev/null
  url_rc=$?
  wait "$dir_pid" 2>/dev/null
  dir_rc=$?
  if [ "$url_rc" = 0 ] && [ "$dir_rc" = 0 ]; then
    check PASS "A3-open" "live 'xdg-open <url>' and 'xdg-open <dir>' both exited 0 (windows opened)" \
      "xdg-open https://example.com -> rc=$url_rc   (this is exactly what open_url spawns)" \
      "xdg-open $REPO_ROOT -> rc=$dir_rc   (this is exactly what os_open spawns)"
  else
    check FAIL "A3-open" "a live xdg-open failed" "url rc=$url_rc  dir rc=$dir_rc"
  fi
else
  check SKIP "A3-open" "live xdg-open (pops a browser + a file-manager window) — re-run with --open"
fi

# --- A4: FileManager1.ShowItems ----------------------------------------------
# Byte-for-byte the call commands.rs::reveal_file_linux makes.
if have dbus-send; then
  if dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus \
    org.freedesktop.DBus.ListActivatableNames 2>/dev/null | grep -q 'org.freedesktop.FileManager1'; then
    if [ "$OPEN" = 1 ]; then
      target="$REPO_ROOT/README.md"
      [ -f "$target" ] || target="$REPO_ROOT/package.json"
      out="$(dbus-send --session --print-reply --dest=org.freedesktop.FileManager1 \
        /org/freedesktop/FileManager1 org.freedesktop.FileManager1.ShowItems \
        "array:string:file://$target" string:"" 2>&1)"
      rc=$?
      if [ $rc = 0 ] && ! printf '%s' "$out" | grep -qi 'Error'; then
        check PASS "A4-dbus" "FileManager1.ShowItems returned a method reply (file manager selected the file)" \
          "target: $target" \
          "reply: $(printf '%s' "$out" | head -1)"
      else
        check FAIL "A4-dbus" "FileManager1.ShowItems errored" "$(printf '%s' "$out" | head -2 | tr '\n' ' ')"
      fi
    else
      check SKIP "A4-dbus" "FileManager1 is activatable, but the live ShowItems call pops a file-manager window — re-run with --open" \
        "provider is activatable on this session bus"
    fi
  else
    check FAIL "A4-dbus" "no org.freedesktop.FileManager1 provider on the session bus (reveal falls back to xdg-open on the parent dir)"
  fi
else
  check SKIP "A4-dbus" "dbus-send not installed (reveal_file_linux would fall back to xdg-open)"
fi

# --- A5: Ctrl hints / "Reveal in File Manager" (pure frontend logic) ----------
if [ -f "$REPO_ROOT/src/platform.ts" ] && [ -f "$REPO_ROOT/src/platform.test.ts" ]; then
  if grep -q 'Reveal in File Manager' "$REPO_ROOT/src/platform.ts" && grep -q 'isLinux' "$REPO_ROOT/src/platform.ts"; then
    check PASS "A5-copy" "platform.ts has the Linux arm (isLinux -> Ctrl hints + 'Reveal in File Manager')" \
      "run 'npx vitest run src/platform.test.ts' for the assertions" \
      "$(grep -c 'linux' "$REPO_ROOT/src/platform.test.ts") linux cases in src/platform.test.ts"
  else
    check FAIL "A5-copy" "platform.ts is missing the Linux arm"
  fi
else
  check SKIP "A5-copy" "src/platform.ts not found (not run from the repo)"
fi

# --- A6: notifications --------------------------------------------------------
if have dbus-send && dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus \
  org.freedesktop.DBus.ListActivatableNames 2>/dev/null | grep -q 'org.freedesktop.Notifications'; then
  owner="$(dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus \
    org.freedesktop.DBus.GetNameOwner string:org.freedesktop.Notifications 2>/dev/null | tail -1 | tr -d ' "')"
  if [ "$OPEN" = 1 ] && have notify-send; then
    notify-send "ReCue verification" "linux-verify.sh --open (#365)" >/dev/null 2>&1
    rc=$?
    if [ $rc = 0 ]; then
      check PASS "A6-notify" "org.freedesktop.Notifications is activatable and notify-send delivered a toast" \
        "name owner: ${owner:-?}" \
        "a desktop notification should now be visible"
    else
      check FAIL "A6-notify" "notify-send failed (rc=$rc) despite an activatable Notifications service"
    fi
  else
    check PASS "A6-notify" "org.freedesktop.Notifications is activatable (a D-Bus notification daemon is running)" \
      "name owner: ${owner:-?}" \
      "re-run with --open to actually deliver a toast"
  fi
else
  check FAIL "A6-notify" "no org.freedesktop.Notifications provider on the session bus"
fi

# --- A7: clipboard image paste ------------------------------------------------
lock="$REPO_ROOT/src-tauri/Cargo.lock"
if [ -f "$lock" ]; then
  wl_n="$(grep -c '^name = "wl-clipboard-rs"' "$lock")"
  x11_n="$(grep -c '^name = "x11rb"' "$lock")"
  if [ "$wl_n" -ge 1 ] && [ "$x11_n" -ge 1 ]; then
    check PASS "A7-backends" "both clipboard backends are compiled in (arboard: Wayland + X11)" \
      "Cargo.lock: wl-clipboard-rs x$wl_n, x11rb x$x11_n"
  else
    check FAIL "A7-backends" "a clipboard backend is missing from Cargo.lock" \
      "wl-clipboard-rs=$wl_n x11rb=$x11_n"
  fi
else
  check SKIP "A7-backends" "src-tauri/Cargo.lock not found"
fi

if [ "${XDG_SESSION_TYPE:-}" = "wayland" ] && have wl-paste; then
  types="$(wl-paste --list-types 2>/dev/null | tr '\n' ' ')"
  if printf '%s' "$types" | grep -qi 'image/'; then
    check PASS "A7-clip" "an image is on the Wayland clipboard and visible to clients" \
      "wl-paste --list-types: $types"
  else
    check SKIP "A7-clip" "no image on the clipboard — copy one (e.g. 'wl-copy -t image/png < shot.png') and re-run" \
      "wl-paste --list-types: ${types:-<empty>}"
  fi
elif [ "${XDG_SESSION_TYPE:-}" = "x11" ] && have xclip; then
  types="$(xclip -selection clipboard -t TARGETS -o 2>/dev/null | tr '\n' ' ')"
  if printf '%s' "$types" | grep -qi 'image/'; then
    check PASS "A7-clip" "an image is on the X11 clipboard and visible to clients" "TARGETS: $types"
  else
    check SKIP "A7-clip" "no image on the X11 clipboard — copy one and re-run" "TARGETS: ${types:-<empty>}"
  fi
else
  check SKIP "A7-clip" "no clipboard tool for this session type (session=${XDG_SESSION_TYPE:-unset}; need wl-paste on Wayland / xclip on X11)"
fi

# --- A8: updater manifest -----------------------------------------------------
if have curl && have jq; then
  manifest="$(curl -fsSL --max-time 20 \
    https://github.com/ErikdeJager/ReCue/releases/latest/download/latest.json 2>/dev/null)"
  if [ -n "$manifest" ]; then
    ver="$(printf '%s' "$manifest" | jq -r '.version // "?"')"
    keys="$(printf '%s' "$manifest" | jq -r '.platforms | keys | join(", ")')"
    if printf '%s' "$manifest" | jq -e '.platforms["linux-x86_64"] | (.url != null) and (.signature != null and .signature != "")' >/dev/null 2>&1; then
      url="$(printf '%s' "$manifest" | jq -r '.platforms["linux-x86_64"].url')"
      check PASS "A8-manifest" "latest.json advertises a signed linux-x86_64 AppImage (the updater can see it)" \
        "version: $ver" \
        "platforms: $keys" \
        "url: $url"
    else
      check FAIL "A8-manifest" "latest.json has no signed linux-x86_64 entry" \
        "version: $ver  platforms: $keys"
    fi
  else
    check SKIP "A8-manifest" "could not fetch latest.json (offline, or no published release)"
  fi
else
  check SKIP "A8-manifest" "curl and/or jq not installed"
fi

# --- B/D: GPU inventory in linux_webkit::decide_dmabuf's own terms ------------
gpus=""
mesa=0
nvblob=0
for card in /sys/class/drm/card[0-9]*; do
  [ -e "$card/device/driver" ] || continue
  drv="$(basename "$(readlink -f "$card/device/driver")")"
  case "$drv" in
    i915 | xe | amdgpu | radeon | nouveau | msm | panfrost | lima | v3d | vc4) mesa=1; klass=mesa ;;
    nvidia) nvblob=1; klass=nvidia-blob ;;
    virtio_gpu | vmwgfx | qxl | bochs-drm | hyperv_drm | simpledrm | vboxvideo) klass=virtual ;;
    *) klass=unknown ;;
  esac
  gpus="$gpus,${drv}[${klass}]"
done
gpus="${gpus#,}"

nvflavor="none"
if [ -r /proc/driver/nvidia/version ]; then
  if grep -qi 'open kernel module' /proc/driver/nvidia/version; then nvflavor="open"; else nvflavor="proprietary"; fi
  nvver="$(grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' /proc/driver/nvidia/version | head -1)"
  nvflavor="$nvflavor ${nvver:-?}"
fi

vm_signals=0
[ -e /sys/hypervisor/type ] && [ "$(cat /sys/hypervisor/type 2>/dev/null)" != "xen" ] && vm_signals=$((vm_signals + 1))
grep -qm1 '^flags.*\bhypervisor\b' /proc/cpuinfo && vm_signals=$((vm_signals + 1))
case "$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null)" in
  QEMU | "VMware, Inc." | innotek\ GmbH | Microsoft\ Corporation | Xen | "Parallels Software International Inc.") vm_signals=$((vm_signals + 1)) ;;
esac

# Predict decide_dmabuf's outcome from ground truth (rules 3-6 of the #347 table).
if [ -n "${WEBKIT_DISABLE_DMABUF_RENDERER:-}" ]; then
  expect="untouched (user already exported WEBKIT_DISABLE_DMABUF_RENDERER)"
elif [ "${RECUE_DISABLE_DMABUF:-}" = "1" ]; then
  expect="disabled (RECUE_DISABLE_DMABUF forced on)"
elif [ "${RECUE_DISABLE_DMABUF:-}" = "0" ]; then
  expect="left on (RECUE_DISABLE_DMABUF forced off)"
elif [ "$nvblob" = 1 ] && { [ "${__GLX_VENDOR_LIBRARY_NAME:-}" = "nvidia" ] || [ "${__NV_PRIME_RENDER_OFFLOAD:-}" = "1" ]; }; then
  expect="disabled (NVIDIA GL selected via env / PRIME offload)"
elif [ "$nvblob" = 1 ] && [ "$mesa" = 0 ]; then
  expect="disabled (NVIDIA blob driver is the only renderer)"
elif [ "$vm_signals" -ge 2 ] && [ "$mesa" = 0 ]; then
  expect="disabled (virtual machine without a native Mesa GPU)"
else
  expect="left on (Mesa GPU present / no known-bad renderer)"
fi

check PASS "B-gpu" "GPU ground truth for the boot line (diff the app's '[recue] WebKitGTK:' line against this)" \
  "gpus: ${gpus:-<none readable>}" \
  "nvidia: $nvflavor; vm signals: $vm_signals; session: ${XDG_SESSION_TYPE:-unknown}" \
  "expected decide_dmabuf outcome on this box: DMA-BUF $expect"

# --- 350: AppImage child-env scrub (only meaningful inside a ReCue terminal) ---
if [ -n "${APPIMAGE:-}${APPDIR:-}" ]; then
  leaked="$(env | grep -E '^(APPDIR|APPIMAGE|APPIMAGE_UUID|OWD|ARGV0|GTK_THEME|GDK_BACKEND)=' | cut -d= -f1 | tr '\n' ' ')"
  mounted="$(for v in PATH XDG_DATA_DIRS LD_LIBRARY_PATH GSETTINGS_SCHEMA_DIR GIO_MODULE_DIR GI_TYPELIB_PATH; do
    val="${!v:-}"
    case "$val" in *"/tmp/.mount_"*) printf '%s ' "$v" ;; esac
  done)"
  if [ -z "$leaked" ] && [ -z "$mounted" ]; then
    check PASS "env-appimage" "running under an AppImage, yet no AppImage env leaked into this child"
  else
    check FAIL "env-appimage" "AppImage env leaked into this child process (#350 regression)" \
      "marker/forced vars still set: ${leaked:-none}" \
      "vars with a /tmp/.mount_ segment: ${mounted:-none}"
  fi
else
  check SKIP "env-appimage" "not running inside a ReCue AppImage terminal — open a ReCue shell panel under the AppImage and run this there" \
    "(#350's scrub only arms when \$APPIMAGE/\$APPDIR is set; here both are unset, so nothing to assert)"
fi

# ---------------------------------------------------------------------------
section "Summary"
printf '  %d PASS   %d FAIL   %d SKIP\n' "$PASS_N" "$FAIL_N" "$SKIP_N"
if [ "$OPEN" = 0 ]; then
  printf '  (re-run with --open for the checks that pop windows: A3-open, A4-dbus, A6-notify)\n'
fi
printf '  GUI-only items stay on the "Maintainer checklist" in TRAJECTORY_TO_LINUX.md.\n\n'

exit 0
