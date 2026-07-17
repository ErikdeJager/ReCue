//! Best-effort enumeration of the slash-invokable skills/commands `claude` would
//! offer for a given working directory (#114) — read from the same on-disk dirs
//! `claude` itself reads: **project** `<cwd>/.claude/{skills,commands}` and
//! **user** `~/.claude/{skills,commands}`. Powers the scheduled-prompt
//! autocomplete (a scheduled session boots `claude` pre-seeded with the prompt,
//! so `/<skill>` actually runs that skill on launch, #93).
//!
//! Best-effort by design: a missing / unreadable directory simply yields fewer
//! entries — this never errors and never blocks. Project entries **shadow** user
//! entries of the same name; the result is deduped and sorted. Plugin /
//! marketplace skills (`~/.claude/plugins/…`) are out of scope for v1.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Recursion cap for the (rarely nested) `commands` tree — mirrors `files.rs`.
const MAX_DEPTH: usize = 8;

/// Source scope of a skill; project shadows user on a name clash.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Scope {
    Project,
    User,
}

impl Scope {
    fn label(self) -> &'static str {
        match self {
            Scope::Project => "project",
            Scope::User => "user",
        }
    }
}

/// One slash-invokable skill or command (#114). `name` is the bare name (no
/// leading slash) inserted as `/<name>`; `source` is `"project"` or `"user"`.
#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
}

/// All skills/commands available to `claude` in `cwd`: project `<cwd>/.claude`
/// (shadowing) merged over user `~/.claude`, deduped by name and sorted.
pub fn list_skills(cwd: impl AsRef<Path>) -> Vec<SkillInfo> {
    let project = cwd.as_ref().join(".claude");
    let user = home_claude_dir();
    collect_skills(Some(project.as_path()), user.as_deref())
}

/// `~/.claude`, if the home dir is resolvable (`HOME` on unix, `USERPROFILE` on
/// Windows — #140). Dependency-free (mirrors the rest of the crate).
fn home_claude_dir() -> Option<PathBuf> {
    crate::path_env::home_dir().map(|h| h.join(".claude"))
}

/// Core merge (factored out so tests can pass two temp `.claude` roots): scan
/// user first, then project, so a project entry overwrites a same-named user one.
fn collect_skills(project_claude: Option<&Path>, user_claude: Option<&Path>) -> Vec<SkillInfo> {
    let mut by_name: HashMap<String, SkillInfo> = HashMap::new();
    for (claude_dir, scope) in [(user_claude, Scope::User), (project_claude, Scope::Project)] {
        let Some(dir) = claude_dir else {
            continue;
        };
        // Within a scope, commands are scanned after skills, so a command shadows
        // a same-named skill in the same scope (an unlikely tie; kept deterministic).
        for s in scan_skills_dir(&dir.join("skills"), scope) {
            by_name.insert(s.name.clone(), s);
        }
        for s in scan_commands_dir(&dir.join("commands"), scope) {
            by_name.insert(s.name.clone(), s);
        }
    }
    let mut out: Vec<SkillInfo> = by_name.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// `<dir>/*/SKILL.md` — one skill per immediate subdirectory. Name = frontmatter
/// `name` (fallback: the directory name); description = frontmatter `description`.
fn scan_skills_dir(dir: &Path, scope: Scope) -> Vec<SkillInfo> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(content) = fs::read_to_string(path.join("SKILL.md")) else {
            continue;
        };
        let (fm_name, fm_desc) = parse_frontmatter(&content);
        let name = fm_name
            .filter(|n| !n.is_empty())
            .or_else(|| path.file_name().map(|n| n.to_string_lossy().into_owned()));
        let Some(name) = name else {
            continue;
        };
        out.push(SkillInfo {
            name,
            description: fm_desc.unwrap_or_default(),
            source: scope.label().to_string(),
        });
    }
    out
}

/// `<dir>/**/*.md` — one command per markdown file. Name = the path relative to
/// `commands/`, without `.md`, with `/` segments joined by `:` (claude's
/// namespacing, e.g. `git/commit.md` → `git:commit`); description = frontmatter.
fn scan_commands_dir(dir: &Path, scope: Scope) -> Vec<SkillInfo> {
    let mut out = Vec::new();
    collect_commands(dir, dir, scope, &mut out, 0);
    out
}

fn collect_commands(root: &Path, dir: &Path, scope: Scope, out: &mut Vec<SkillInfo>, depth: usize) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_commands(root, &path, scope, out, depth + 1);
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let Ok(rel) = path.strip_prefix(root) else {
                continue;
            };
            let rel = rel.to_string_lossy().replace('\\', "/");
            let stem = rel.strip_suffix(".md").unwrap_or(&rel);
            let name = stem.replace('/', ":");
            if name.is_empty() {
                continue;
            }
            let description = fs::read_to_string(&path)
                .ok()
                .and_then(|c| parse_frontmatter(&c).1)
                .unwrap_or_default();
            out.push(SkillInfo {
                name,
                description,
                source: scope.label().to_string(),
            });
        }
    }
}

/// Pull `name` / `description` scalars from a leading `---` YAML frontmatter
/// block. Best-effort: handles single-line `key: value` pairs (surrounding
/// quotes stripped). Returns `(None, None)` when there's no frontmatter — no YAML
/// dependency, mirroring the crate's dependency-light style.
fn parse_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let mut lines = content.lines();
    if lines.next().map(str::trim_end) != Some("---") {
        return (None, None);
    }
    let mut name = None;
    let mut description = None;
    for line in lines {
        if line.trim_end() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = unquote(value.trim());
        if value.is_empty() {
            continue;
        }
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    (name, description)
}

/// Strip a single pair of matching surrounding quotes (`"…"` or `'…'`).
fn unquote(s: &str) -> String {
    let b = s.as_bytes();
    if s.len() >= 2
        && ((b[0] == b'"' && b[s.len() - 1] == b'"') || (b[0] == b'\'' && b[s.len() - 1] == b'\''))
    {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("recue-skills-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn write_skill(claude: &Path, dir: &str, frontmatter: &str) {
        let d = claude.join("skills").join(dir);
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("SKILL.md"), frontmatter).unwrap();
    }

    fn write_command(claude: &Path, rel: &str, body: &str) {
        let p = claude.join("commands").join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, body).unwrap();
    }

    #[test]
    fn parses_name_and_description_from_skill_frontmatter() {
        let proj = tmp("skill-fm");
        write_skill(
            &proj,
            "deep-research",
            "---\nname: deep-research\ndescription: \"Fan-out web research\"\n---\nbody",
        );
        let skills = collect_skills(Some(&proj), None);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "deep-research");
        assert_eq!(skills[0].description, "Fan-out web research");
        assert_eq!(skills[0].source, "project");
        let _ = fs::remove_dir_all(&proj);
    }

    #[test]
    fn falls_back_to_directory_name_without_frontmatter_name() {
        let proj = tmp("skill-fallback");
        // No frontmatter at all → name is the directory.
        write_skill(&proj, "my-skill", "Just a body, no frontmatter.");
        let skills = collect_skills(Some(&proj), None);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
        assert_eq!(skills[0].description, "");
        let _ = fs::remove_dir_all(&proj);
    }

    #[test]
    fn namespaces_nested_command_names_with_colon() {
        let proj = tmp("cmd-ns");
        write_command(&proj, "deploy.md", "---\ndescription: Ship it\n---\n");
        write_command(&proj, "git/commit.md", "no frontmatter");
        let mut skills = collect_skills(Some(&proj), None);
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["deploy", "git:commit"]);
        let deploy = skills.iter().find(|s| s.name == "deploy").unwrap();
        assert_eq!(deploy.description, "Ship it");
        let _ = fs::remove_dir_all(&proj);
    }

    #[test]
    fn project_shadows_user_and_results_are_sorted() {
        let proj = tmp("shadow-proj");
        let user = tmp("shadow-user");
        write_skill(
            &proj,
            "shared",
            "---\nname: shared\ndescription: project version\n---\n",
        );
        write_skill(
            &user,
            "shared",
            "---\nname: shared\ndescription: user version\n---\n",
        );
        write_skill(
            &user,
            "user-only",
            "---\nname: user-only\ndescription: only here\n---\n",
        );
        let skills = collect_skills(Some(&proj), Some(&user));
        // Deduped to two, sorted by name.
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["shared", "user-only"]);
        // The project entry won the clash.
        let shared = skills.iter().find(|s| s.name == "shared").unwrap();
        assert_eq!(shared.description, "project version");
        assert_eq!(shared.source, "project");
        let _ = fs::remove_dir_all(&proj);
        let _ = fs::remove_dir_all(&user);
    }

    #[test]
    fn missing_directories_yield_an_empty_list_without_error() {
        let proj = tmp("missing");
        // Create the root but no .claude/skills or .claude/commands at all.
        assert!(collect_skills(Some(&proj), None).is_empty());
        // A wholly nonexistent path is also fine.
        assert!(collect_skills(Some(Path::new("/no/such/dir/.claude")), None).is_empty());
        let _ = fs::remove_dir_all(&proj);
    }

    /// `list_skills` = project `<cwd>/.claude` merged (via `collect_skills`) with
    /// the user `~/.claude`. Differential over the REAL home (read-only — absent
    /// on CI ⇒ the user side is simply empty), anchored by a uniquely-named
    /// project skill that must surface with project scope.
    #[test]
    fn list_skills_merges_the_cwd_claude_dir_with_the_user_home() {
        let cwd = tmp("list-cwd");
        let unique = format!("recue-skills-cov-{}", std::process::id());
        write_skill(
            &cwd.join(".claude"),
            &unique,
            &format!("---\nname: {unique}\ndescription: from the project\n---\n"),
        );
        let skills = list_skills(&cwd);
        let hit = skills
            .iter()
            .find(|s| s.name == unique)
            .expect("the project skill must be listed");
        assert_eq!(hit.source, "project");
        assert_eq!(hit.description, "from the project");
        // The whole listing equals the two-root merge over the same dirs.
        let expected = collect_skills(
            Some(cwd.join(".claude").as_path()),
            home_claude_dir().as_deref(),
        );
        assert_eq!(skills, expected);
        let _ = fs::remove_dir_all(&cwd);
    }

    #[test]
    fn skills_scan_skips_stray_files_and_dirs_without_skill_md() {
        let proj = tmp("scan-edges");
        // A stray FILE directly under skills/ is not a skill…
        let skills_dir = proj.join("skills");
        fs::create_dir_all(&skills_dir).unwrap();
        fs::write(skills_dir.join("README.md"), "not a skill dir").unwrap();
        // …nor is a subdirectory without a SKILL.md…
        fs::create_dir_all(skills_dir.join("no-skill-md")).unwrap();
        // …while a real one beside them still lists.
        write_skill(&proj, "real", "---\nname: real\n---\n");
        let found = collect_skills(Some(&proj), None);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "real");
        let _ = fs::remove_dir_all(&proj);
    }

    #[test]
    fn commands_skip_non_md_files_and_respect_the_depth_cap() {
        let proj = tmp("cmd-edges");
        write_command(&proj, "top.md", "");
        // A non-markdown file is not a command.
        fs::write(proj.join("commands").join("notes.txt"), "not a command").unwrap();
        // 8 levels of nesting still list; a 9th (past MAX_DEPTH) is cut off.
        write_command(&proj, "a/b/c/d/e/f/g/h/ok.md", "");
        write_command(&proj, "a/b/c/d/e/f/g/h/i/deep.md", "");
        let names: Vec<String> = collect_skills(Some(&proj), None)
            .into_iter()
            .map(|s| s.name)
            .collect();
        assert!(names.contains(&"top".to_string()), "names: {names:?}");
        assert!(
            names.contains(&"a:b:c:d:e:f:g:h:ok".to_string()),
            "names: {names:?}"
        );
        assert!(
            !names.iter().any(|n| n.contains("deep")),
            "a command nested past MAX_DEPTH must be cut off: {names:?}"
        );
        assert!(
            !names.iter().any(|n| n.contains("notes")),
            "names: {names:?}"
        );
        let _ = fs::remove_dir_all(&proj);
    }

    #[test]
    fn frontmatter_tolerates_junk_lines_and_unknown_keys() {
        let (name, desc) = parse_frontmatter(
            "---\nnot a key-value line\nname:\nauthor: someone\nname: 'the-name'\ndescription: \"desc here\"\n---\nbody",
        );
        // The colon-less line, the empty `name:` value, and the unknown key are
        // all skipped; quoted values are unquoted (single AND double).
        assert_eq!(name.as_deref(), Some("the-name"));
        assert_eq!(desc.as_deref(), Some("desc here"));
        // No leading frontmatter fence at all → nothing extracted.
        assert_eq!(parse_frontmatter("name: nope"), (None, None));
    }
}
