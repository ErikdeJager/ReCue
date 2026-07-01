---
name: release
description: >-
  Prepares a software release for the current project: detects the project's version source
  and its changelog / patch-notes conventions, bumps the version (patch by default, or a
  level / exact version you specify), updates the changelog or release notes, then creates a
  single `chore` release commit — and finally ASKS whether to commit-and-push it on the
  current branch, or open a PR from a new branch to the default branch. Use when the user
  invokes /release or asks to cut / prepare / make / do a release, bump / increment / roll the
  version, prep a version bump, "ship a new version", tag a release, or update the changelog
  for a release. Auto-detects package.json / Cargo.toml / pyproject.toml / build.gradle /
  *.csproj / pubspec.yaml / composer.json / a VERSION file / git tags, and Keep-a-Changelog
  CHANGELOG.md or per-version patch-note files. Always confirms before committing or pushing.
allowed-tools: Read Edit Write Glob Grep Bash
---

# release — bump the version, update the changelog, cut a release commit

Prepare a release for **whatever project you're in**: figure out how this project versions
and documents releases, bump the version, record the changes, make one `chore` release
commit, and then let the user choose how it lands (push on the current branch, or a PR from a
new branch). You **discover** the project's conventions rather than assuming any one stack.

## The rules that keep this safe

- **Discover, don't assume.** Every project stores its version and writes its changelog
  differently. Read the repo and detect the convention before you change anything (§1).
- **Read-mostly until the very end.** Inspect freely; the only writes are the version bump,
  the changelog/notes update, and the commit — all in one reviewable batch.
- **Never push or open a PR without an explicit choice.** §6 is a hard gate: you ask, the
  user picks, then you act. No force-pushes, ever.
- **Keep every version reference in sync.** If the version appears in more than one file,
  bump them all in the same commit.

## Configuration

Set these when the skill is installed (the installer replaces each token in the installed
copy; the source keeps the placeholder):

- `patch` — the semver level to bump when the user doesn't specify one.
  One of `patch` | `minor` | `major`. Default: `patch` (the least-significant / rightmost
  number, e.g. `1.4.2 → 1.4.3` — the conventional "routine release"). A level or exact
  version given at invocation time always overrides this.
- `src-tauri/tauri.conf.json:version` — optional hint pinning the **canonical** version location when a repo
  has several, as `path` or `path:field` (e.g. `pyproject.toml:project.version`,
  `VERSION`, `git-tag`). Default: `auto` — detect it (§1).

## 0 · Preflight

1. Confirm you're in a git repo (`git rev-parse --show-toplevel`); if not, say so and stop.
2. Check the working tree (`git status --porcelain`). If there are **unrelated** uncommitted
   changes, surface them and ask whether to include them, stash them, or stop — a release
   commit should contain the bump + notes, not stray edits.
3. Note the current branch (`git branch --show-current`) and the default branch
   (`git symbolic-ref --quiet refs/remotes/origin/HEAD` → strip `origin/`; fall back to
   `main`/`master` — whichever exists). You'll need both in §6.

## 1 · Discover the project's release conventions

Detect each of the following and **tell the user what you found** before proceeding. If a
signal is ambiguous or missing, ask rather than guess.

**a. The version source.** Where the canonical version lives. Honor `src-tauri/tauri.conf.json:version` if
set; otherwise probe, in this order, for whatever the project actually uses:

| Ecosystem / project | Version lives in | Field |
|---|---|---|
| Node / npm / Deno    | `package.json`, `deno.json`, `jsr.json` | `version` |
| Rust                 | `Cargo.toml` | `[package] version` |
| Python               | `pyproject.toml` (`project.version` or `tool.poetry.version`), `setup.cfg`, `setup.py`, `__init__.py` `__version__` |
| Java / Kotlin        | `build.gradle(.kts)`, `gradle.properties`, `pom.xml` | `version` |
| .NET                 | `*.csproj`, `Directory.Build.props` | `<Version>` |
| Dart / Flutter       | `pubspec.yaml` | `version` |
| PHP                  | `composer.json` | `version` |
| Go / generic         | a `VERSION` file, or **git tags** only |
| Desktop shells       | e.g. `tauri.conf.json`, `manifest.json` `version` |

```bash
# quick sweep for likely version files at the repo root
ls package.json Cargo.toml pyproject.toml setup.cfg build.gradle build.gradle.kts \
   gradle.properties pom.xml pubspec.yaml composer.json VERSION 2>/dev/null
git tag --list --sort=-v:refname | head -n 5          # is versioning tag-driven?
```

Grep for **all** copies of the current version string so none is missed:
`grep -rn --fixed-strings "<current-version>" -- . ':!*.lock' ':!node_modules'`.

**b. The changelog / release-notes convention.** Detect which the project uses:
- **`CHANGELOG.md`** (or `HISTORY`/`NEWS`/`RELEASES.md`) — usually
  [Keep a Changelog](https://keepachangelog.com) style (an `## [Unreleased]` section +
  dated `## [x.y.z] - YYYY-MM-DD` sections with `Added/Changed/Fixed/…` groups).
- **Per-version note files** — e.g. a `patchnotes/`, `changelog.d/`, `.changes/`, or
  `releases/` directory with one file per version. **Read an existing one** to mirror its
  exact schema (JSON/YAML/MD shape, field names) — don't invent a new format.
- **Release-body only** — notes authored on the git tag / forge release, no in-repo file.
- **None** — no changelog convention found.

**c. The commit convention.** Look at how past releases were committed so you match the
project's voice: `git log --oneline -n 30`. Watch for
[Conventional Commits](https://www.conventionalcommits.org) (`feat:`/`fix:`/`chore:`) and
existing release commits like `chore(release): v1.2.0`.

**d. The tagging convention.** `git tag` — does the project tag each release (`v1.2.0` vs
`1.2.0`)? If it doesn't tag, don't start.

## 2 · Determine the next version

1. Read the **current** version from the source found in §1a (for a tag-only project, the
   latest `v*` tag).
2. Pick the bump, in this precedence (highest first):
   1. **Exact version in the request** ("release 2.0.0", "cut 1.4.0-rc.1") → use it verbatim.
   2. **Level in the request** ("bump minor", "major release", "patch it") → bump that field.
   3. **Inferred from commits** *only if the user asks for it* and the project uses
      Conventional Commits: scan commits since the last release —
      `BREAKING CHANGE`/`!` → major, `feat:` → minor, else `fix:`/`perf:` → patch.
   4. **`patch`** (default `patch`) — when nothing above applies.
3. Compute the next version per [semver](https://semver.org): bumping a field resets every
   lower field to `0` (`1.4.2` → minor → `1.5.0`; → major → `2.0.0`; → patch → `1.4.3`).
   Preserve the project's own `v`-prefix style for tags.
4. **Show the user** `current → next` and the bump level, and confirm it looks right before
   writing (skip the confirm only if they gave an exact version/level explicitly).

## 3 · Apply the version bump

Edit **every** file that carries the version (from §1a's grep) to the new version — the
canonical source **and** any mirrors (a lockfile's own `version`, a second manifest, etc.).
Change only the version value; leave formatting untouched. If a lockfile needs regenerating
(e.g. `npm install --package-lock-only`, `cargo update -p <pkg>`), note it and offer to run
it, but never run a broad dependency update as part of a release.

## 4 · Update the changelog / release notes

Match the convention detected in §1b:

- **Keep a Changelog** — move the accumulated `## [Unreleased]` items into a new
  `## [<version>] - <YYYY-MM-DD>` section (today's date — get it with `date +%F`), leave a
  fresh empty `Unreleased`, and update the link refs at the bottom if the file uses them.
  If there's no `Unreleased` content, summarize the changes yourself (next bullet).
- **Per-version note file** — create the new file mirroring the existing schema exactly
  (same directory, extension, and fields as a prior version's file you read in §1b).
- **No existing convention** — ask whether to start a `CHANGELOG.md` (Keep a Changelog) or
  skip notes for this release.

To fill the notes, **summarize the actual changes** since the last release, grouped for
humans (Added / Changed / Fixed / Removed / Security):

```bash
git log <last-tag>..HEAD --no-merges --pretty='%s'    # last-tag = latest release tag, or use the last release commit
```

Read the project's `README`/docs if you need context to describe a change meaningfully.
Write for users, not commit-by-commit — collapse noise, keep what shipped.

## 5 · The release (chore) commit

Stage exactly the files you changed (version file(s) + changelog/notes) and commit. Match the
project's commit style from §1c; default to a **Conventional Commits `chore` release commit**:

```bash
git add <version-files> <changelog-or-notes>
git commit -m "chore(release): v<version>"     # or the project's existing style, e.g. "chore: release v<version>"
```

Do **not** tag or push yet — that's the user's call in §6. (Keep the subject to the version;
the changelog carries the detail.)

## 6 · Ask how it should land — then do it (hard gate)

**Always ask** (use `AskUserQuestion`) before anything leaves the machine. Two paths:

- **A — Push on the current branch.** Push the release commit to the current branch's
  upstream: `git push`. Use this when the user releases straight from their working/main
  branch.
- **B — New branch + PR to the default branch.** Create a release branch
  (`release/v<version>`, or match an existing naming pattern), move the commit there, push,
  and open a PR **into the default branch** (from §0):
  ```bash
  git switch -c release/v<version>          # the commit rides along onto the new branch
  git push -u origin release/v<version>
  gh pr create --base <default-branch> --title "chore(release): v<version>" --body "<changelog for this version>"
  ```
  If `gh` isn't available/authenticated, push the branch and give the user the compare URL to
  open the PR themselves.

Confirm the exact remote/branch before pushing. **Never** force-push and never rewrite
already-pushed history.

**Optional — tagging.** If §1d showed the project tags releases, offer to create the tag
(`git tag -a v<version> -m "v<version>"`) and push it (`git push origin v<version>`) — after
the commit lands (on path B, typically after the PR merges). Only if the project's convention
uses tags; otherwise skip. This skill stops at the commit + push/PR + optional tag — it does
**not** publish to a registry or trigger a deploy.

## 7 · Report

- **Version:** `current → next` and the bump level (and why — e.g. "patch, default").
- **Files changed:** every version file + the changelog/notes file.
- **Changelog:** a short preview of the section you wrote.
- **Commit:** the subject and its hash.
- **Landing:** which path (A push / B PR) and the branch, remote, and **PR URL** (or the
  compare URL if `gh` was unavailable); the tag, if one was created.
- **How to undo** if not yet pushed: `git reset --soft HEAD~1` (keeps the file changes).

## Reference — common release flows (baked-in from research)

- **Semantic Versioning** `MAJOR.MINOR.PATCH`: MAJOR = breaking, MINOR = backwards-compatible
  features, PATCH = backwards-compatible fixes. Bumping a field zeroes the lower fields.
- **Conventional Commits** map to bumps: `fix:` → patch, `feat:` → minor,
  `BREAKING CHANGE`/`!` → major; `chore:` (incl. the release commit itself) → no bump.
- **Keep a Changelog:** an always-present `## [Unreleased]`, then dated versioned sections
  grouped by `Added / Changed / Deprecated / Removed / Fixed / Security`.
- **The release commit** is conventionally `chore(release): vX.Y.Z` (administrative, not a
  feature/fix), often paired with an annotated git tag `vX.Y.Z`.
- Automated tools that encode these (for reference — this skill does the same steps by hand,
  no tool required): standard-version / commit-and-tag-version, semantic-release,
  release-please, changesets, nx release.

Sources: [semver.org](https://semver.org) · [conventionalcommits.org](https://www.conventionalcommits.org/en/v1.0.0/)
· [keepachangelog.com](https://keepachangelog.com/en/1.1.0/) ·
[release-please](https://github.com/googleapis/release-please) ·
[semantic-release](https://semantic-release.gitbook.io/)

## Guardrails

- **Discover before you write.** No hardcoded stack assumptions — detect the version source,
  changelog convention, commit style, and tagging from the repo (§1).
- **One coherent commit.** Only the bump + notes; surface unrelated working-tree changes
  first (§0).
- **Sync every version reference** so no file is left on the old number (§3).
- **Never push or PR without the §6 choice**; never force-push; don't publish/deploy.
- **When a convention is unclear** (which file is canonical, which changelog format, whether
  to tag), ask — don't guess.
