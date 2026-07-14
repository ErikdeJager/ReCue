#!/usr/bin/env bash
# Re-pin the in-repo AUR package (packaging/aur/recue-bin) to a PUBLISHED ReCue release
# (#361).
#
#   scripts/aur-bump.sh <version>        e.g.  scripts/aur-bump.sh 1.3.0
#
# It downloads that release's .deb (the artifact the AUR `recue-bin` package repacks —
# the Linux CI leg builds `--bundles appimage,deb`), computes its sha256, rewrites
# `pkgver` / `pkgrel` / `sha256sums` in the PKGBUILD, regenerates .SRCINFO when `makepkg`
# is available, and prints the manual AUR publish runbook.
#
# It NEVER pushes anything: publishing to the AUR is a deliberate, manual maintainer step
# (this repo has no AUR account / SSH key, and auto-pushing a package on every release is
# not something CI should do). It also refuses to print the publish steps while
# `sha256sums` is still the committed `SKIP` placeholder, so a placeholder can never reach
# the AUR.
#
# Safe to re-run: it re-downloads and rewrites the same lines.

set -euo pipefail

readonly REPO_URL="https://github.com/ErikdeJager/ReCue"

usage() {
  echo "usage: scripts/aur-bump.sh <version>   (e.g. 1.3.0 — no leading 'v')" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
version="${1#v}"
[ -n "$version" ] || usage

# Repo root from this script's own location, so it runs from anywhere.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
pkgdir="${repo_root}/packaging/aur/recue-bin"
pkgbuild="${pkgdir}/PKGBUILD"

[ -f "$pkgbuild" ] || {
  echo "error: no PKGBUILD at ${pkgbuild}" >&2
  exit 1
}

deb="ReCue_${version}_amd64.deb"
url="${REPO_URL}/releases/download/v${version}/${deb}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> Downloading ${deb}"
echo "    ${url}"
if ! curl -fsSL --retry 3 -o "${tmp}/${deb}" "$url"; then
  cat >&2 <<EOF
error: no .deb asset for v${version} — is the release PUBLISHED, and did its Linux leg
       build \`--bundles appimage,deb\`? (Check the release's assets; the Linux job
       summary prints the .deb name + sha256.)
EOF
  exit 1
fi

sum="$(sha256sum "${tmp}/${deb}" | cut -d' ' -f1)"
echo "==> sha256: ${sum}"

echo "==> Rewriting ${pkgbuild#"${repo_root}"/}"
sed -i \
  -e "s|^pkgver=.*|pkgver=${version}|" \
  -e "s|^pkgrel=.*|pkgrel=1|" \
  -e "s|^sha256sums=.*|sha256sums=('${sum}')|" \
  "$pkgbuild"

# Guard: the committed placeholder must never survive a bump (and so never reach the AUR).
if grep -q "^sha256sums=('SKIP')" "$pkgbuild"; then
  echo "error: sha256sums is still the SKIP placeholder — refusing to continue." >&2
  exit 1
fi

if command -v makepkg >/dev/null 2>&1; then
  echo "==> Regenerating .SRCINFO"
  (cd "$pkgdir" && makepkg --printsrcinfo > .SRCINFO)
else
  echo "warning: \`makepkg\` not on PATH — .SRCINFO was NOT regenerated." >&2
  echo "         Run \`makepkg --printsrcinfo > .SRCINFO\` in ${pkgdir#"${repo_root}"/} on an Arch box." >&2
fi

cat <<EOF

==> Bumped recue-bin to ${version} (pkgrel=1).

Review the diff, then commit the bumped files in THIS repo:

    git add packaging/aur/recue-bin/PKGBUILD packaging/aur/recue-bin/.SRCINFO
    git commit -m "chore(aur): bump recue-bin to ${version}"

Publish to the AUR (manual, one-time setup: an AUR account + an SSH key registered with it):

    git clone ssh://aur@aur.archlinux.org/recue-bin.git /tmp/recue-bin-aur
    cp packaging/aur/recue-bin/PKGBUILD packaging/aur/recue-bin/.SRCINFO /tmp/recue-bin-aur/
    cd /tmp/recue-bin-aur
    makepkg -si          # optional: build + install locally to smoke-test
    namcap PKGBUILD      # optional: lint
    git add PKGBUILD .SRCINFO
    git commit -m "recue-bin ${version}"
    git push

See docs/linux-packaging.md for the full runbook (incl. the LICENSE caveat).
EOF
