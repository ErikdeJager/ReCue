//! External-editor launching ("Open in editor").
//!
//! A static catalog of `EditorSpec`s — modeled on `agents.rs` — is the single source
//! of truth for every editor/IDE ReCue can open a folder in: how to **detect** an
//! install and how to **launch** it detached at a directory. Detection and launch
//! share one resolver (`resolve_editor`) so they can never disagree, and detection is
//! **existence-based only** — never a `--version` probe, because JetBrains launchers
//! boot a JVM and take seconds where a filesystem stat takes microseconds.
//!
//! The resolver tries, in order:
//! 1. a **CLI on the login-shell PATH** via `pty::resolve_command` (the #360
//!    `effective_path` seam, so a Finder/.desktop-launched app still finds `code`;
//!    PATHEXT + the `.cmd`→`cmd.exe /C` shim on Windows);
//! 2. a **JetBrains Toolbox shell script** (the per-OS `Toolbox/scripts` dir —
//!    Toolbox writes `idea`/`webstorm`/… there even when nothing is on PATH);
//! 3. a **macOS app bundle** in `/Applications` or `~/Applications`, launched with
//!    `open -na <app> --args <path>` (the JetBrains-documented form; `-n` guarantees
//!    the folder opens even when the app is already running);
//! 4. a **known Windows install path** (`%LOCALAPPDATA%`/`%ProgramFiles%` templates);
//! 5. the **versioned `%ProgramFiles%\JetBrains\<Product> <ver>\bin\<launcher>`**
//!    layout of standalone JetBrains installs (lexicographically newest dir).
//!
//! Launches are **fire-and-forget** (spawn + drop the `Child`), exactly like the
//! `os_open`/`open_url` openers: CLI/script launches go through `git::hidden_command`
//! (the `CREATE_NO_WINDOW` console-flash guard + `apply_path` + the #350 AppImage
//! scrub — mirroring the `binary_version` probe combo, which is the shipped-and-
//! verified way to run a PATH-resolved CLI), while `open` / direct GUI exes use
//! `child_env::command` (no console to hide; scrub still applied).
//!
//! The `"custom"` editor id is the inclusivity valve (terminal editors, anything):
//! the user's `customEditorCommand` Settings string is tokenized by
//! `agents::parse_custom_command` (argv, **not** a shell) and every `{path}`
//! occurrence is substituted with the target folder (appended as a final arg when no
//! token carries the placeholder) — e.g. `alacritty -e nvim {path}`.
//!
//! Prior art: task #87 shipped (and removed) a hardcoded "Open in Zed" button; its
//! binary-lookup scaffolding (`pty::find_on_path`, `SessionError::BinaryNotFound`)
//! survived and is reused here.

use std::path::{Path, PathBuf};

use crate::pty::SessionError;

/// What differs per editor. Fields that only one OS's resolver arm reads are
/// `cfg_attr(allow(dead_code))` on the others (the catalog unit test still reads
/// every field on every host, keeping the data honest).
pub struct EditorSpec {
    /// Stable id persisted in the `preferredEditor` setting.
    pub id: &'static str,
    /// Human label for the picker / Settings.
    pub display_name: &'static str,
    /// PATH binary names tried in order (first hit wins) — e.g. Zed installs as
    /// `zed` or `zeditor` depending on the Linux distro package.
    pub cli: &'static [&'static str],
    /// Editor-specific extra args inserted **before** the folder path on every
    /// launch arm (Notepad++ needs `-openFoldersAsWorkspace`).
    pub args: &'static [&'static str],
    /// macOS app-bundle names (without `.app`), stat'd under `/Applications` and
    /// `~/Applications`.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    pub mac_bundles: &'static [&'static str],
    /// Windows absolute-exe templates with a single leading `%VAR%` env prefix.
    #[cfg_attr(not(windows), allow(dead_code))]
    pub win_probes: &'static [&'static str],
    /// JetBrains Toolbox shell-script name (no extension; `.cmd` on Windows).
    pub toolbox_script: Option<&'static str>,
    /// Standalone JetBrains install probe: (dir-name prefix under
    /// `%ProgramFiles%\JetBrains`, launcher exe inside its `bin\`).
    #[cfg_attr(not(windows), allow(dead_code))]
    pub jetbrains_win: Option<(&'static str, &'static str)>,
}

/// Catalog-entry shorthand: the common fields, everything else defaulted empty.
const fn spec(
    id: &'static str,
    display_name: &'static str,
    cli: &'static [&'static str],
) -> EditorSpec {
    EditorSpec {
        id,
        display_name,
        cli,
        args: &[],
        mac_bundles: &[],
        win_probes: &[],
        toolbox_script: None,
        jetbrains_win: None,
    }
}

/// JetBrains-family shorthand: Toolbox script + mac bundle(s) + the versioned
/// Program Files layout. The Toolbox script name doubles as the PATH CLI name
/// (Toolbox can add its scripts dir to PATH; standalone installs offer the same
/// launcher names when the user creates shell scripts).
const fn jetbrains(
    id: &'static str,
    display_name: &'static str,
    script: &'static str,
    mac_bundles: &'static [&'static str],
    win_dir_prefix: &'static str,
    win_launcher: &'static str,
) -> EditorSpec {
    EditorSpec {
        mac_bundles,
        toolbox_script: Some(script),
        jetbrains_win: Some((win_dir_prefix, win_launcher)),
        ..spec(id, display_name, &[])
    }
}

/// Every editor ReCue can offer. Data only — adding an editor is one entry.
/// Entry-point research (CLI names, bundle names, install paths, the Notepad++
/// `-openFoldersAsWorkspace` flag, the Toolbox scripts dirs) is from each tool's
/// official docs; a wrong path degrades safely (not detected / `BinaryNotFound`).
pub const CATALOG: &[EditorSpec] = &[
    EditorSpec {
        mac_bundles: &["Visual Studio Code"],
        win_probes: &[
            r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe",
            r"%ProgramFiles%\Microsoft VS Code\Code.exe",
        ],
        ..spec("vscode", "Visual Studio Code", &["code"])
    },
    EditorSpec {
        mac_bundles: &["Cursor"],
        win_probes: &[r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe"],
        ..spec("cursor", "Cursor", &["cursor"])
    },
    EditorSpec {
        mac_bundles: &["Windsurf"],
        win_probes: &[r"%LOCALAPPDATA%\Programs\Windsurf\Windsurf.exe"],
        ..spec("windsurf", "Windsurf", &["windsurf"])
    },
    EditorSpec {
        mac_bundles: &["Zed"],
        // The Linux packages ship the binary as `zed` or `zeditor` per distro.
        ..spec("zed", "Zed", &["zed", "zeditor"])
    },
    EditorSpec {
        mac_bundles: &["Sublime Text"],
        win_probes: &[
            r"%ProgramFiles%\Sublime Text\subl.exe",
            r"%ProgramFiles%\Sublime Text 3\subl.exe",
        ],
        ..spec("sublime", "Sublime Text", &["subl"])
    },
    EditorSpec {
        // Windows-only in practice; opens the folder as a workspace (official
        // command-line manual) rather than trying to open its files individually.
        args: &["-openFoldersAsWorkspace"],
        win_probes: &[
            r"%ProgramFiles%\Notepad++\notepad++.exe",
            r"%ProgramFiles(x86)%\Notepad++\notepad++.exe",
        ],
        ..spec("notepadpp", "Notepad++", &["notepad++"])
    },
    EditorSpec {
        mac_bundles: &["TextMate"],
        ..spec("textmate", "TextMate", &["mate"])
    },
    // Linux-first (KDE); PATH-only.
    spec("kate", "Kate", &["kate"]),
    jetbrains(
        "idea",
        "IntelliJ IDEA",
        "idea",
        &[
            "IntelliJ IDEA",
            "IntelliJ IDEA CE",
            "IntelliJ IDEA Ultimate",
        ],
        "IntelliJ IDEA",
        "idea64.exe",
    ),
    jetbrains(
        "webstorm",
        "WebStorm",
        "webstorm",
        &["WebStorm"],
        "WebStorm",
        "webstorm64.exe",
    ),
    jetbrains(
        "pycharm",
        "PyCharm",
        "pycharm",
        &["PyCharm", "PyCharm CE"],
        "PyCharm",
        "pycharm64.exe",
    ),
    jetbrains(
        "phpstorm",
        "PhpStorm",
        "phpstorm",
        &["PhpStorm"],
        "PhpStorm",
        "phpstorm64.exe",
    ),
    jetbrains(
        "rustrover",
        "RustRover",
        "rustrover",
        &["RustRover"],
        "RustRover",
        "rustrover64.exe",
    ),
    jetbrains(
        "goland",
        "GoLand",
        "goland",
        &["GoLand"],
        "GoLand",
        "goland64.exe",
    ),
    jetbrains(
        "clion",
        "CLion",
        "clion",
        &["CLion"],
        "CLion",
        "clion64.exe",
    ),
    jetbrains(
        "rider",
        "Rider",
        "rider",
        &["Rider"],
        "Rider",
        "rider64.exe",
    ),
    EditorSpec {
        mac_bundles: &["Android Studio"],
        toolbox_script: Some("studio"),
        // Not under `JetBrains\` — Google installs to its own fixed dir.
        win_probes: &[r"%ProgramFiles%\Android\Android Studio\bin\studio64.exe"],
        ..spec("androidstudio", "Android Studio", &["studio"])
    },
    EditorSpec {
        mac_bundles: &["Fleet"],
        toolbox_script: Some("fleet"),
        ..spec("fleet", "Fleet", &["fleet"])
    },
];

/// One catalog entry's live detection result, for the picker + Settings
/// annotations (mirrors `AgentInfo`'s wire shape: snake_case fields,
/// `found == false` ⇒ not installed).
#[derive(Clone, serde::Serialize)]
pub struct EditorInfo {
    pub id: String,
    pub display_name: String,
    pub found: bool,
    /// Where it was found ("PATH" / "Toolbox" / "Applications" / "Program Files"),
    /// `None` when not found.
    pub via: Option<&'static str>,
}

/// A resolved way to launch an editor: `program [args…] [spec.args…] <folder>`.
struct ResolvedLaunch {
    program: String,
    /// Resolver-supplied args that precede the spec's own `args` and the folder
    /// (the `.cmd` shim's `/C <script>`, or `open`'s `-na <app> --args`).
    args: Vec<String>,
    via: &'static str,
    /// Launch through `git::hidden_command` (console-flash guard — CLI/script
    /// launches that may route through `cmd.exe`) instead of `child_env::command`
    /// (`open` / direct GUI exes, which have no console to hide).
    hidden: bool,
}

/// The JetBrains Toolbox shell-scripts directory for `os` — pure so every shape is
/// unit-tested on every host. Defaults per the official Toolbox docs; a user-moved
/// scripts dir is expected to be on PATH, which arm ① already covers.
fn toolbox_scripts_dir_from(
    os: &str,
    home: Option<&Path>,
    local_app_data: Option<&str>,
) -> Option<PathBuf> {
    match os {
        "windows" => local_app_data.map(|lad| {
            PathBuf::from(lad)
                .join("JetBrains")
                .join("Toolbox")
                .join("scripts")
        }),
        "macos" => home.map(|h| {
            h.join("Library")
                .join("Application Support")
                .join("JetBrains")
                .join("Toolbox")
                .join("scripts")
        }),
        _ => home.map(|h| {
            h.join(".local")
                .join("share")
                .join("JetBrains")
                .join("Toolbox")
                .join("scripts")
        }),
    }
}

/// Thin env-reading caller for `toolbox_scripts_dir_from`.
fn toolbox_scripts_dir() -> Option<PathBuf> {
    toolbox_scripts_dir_from(
        std::env::consts::OS,
        crate::path_env::home_dir().as_deref(),
        std::env::var("LOCALAPPDATA").ok().as_deref(),
    )
}

/// Expand a Windows probe template's single leading `%VAR%` prefix (handles
/// `%ProgramFiles(x86)%`) via the injected lookup. `None` when the template has no
/// prefix, the var is unset/empty, or the `%` is unterminated. Pure; widened with
/// `test` (the `explorer_select_arg` precedent) so the macOS host tests it.
#[cfg(any(windows, test))]
fn expand_win_probe(template: &str, get: impl Fn(&str) -> Option<String>) -> Option<PathBuf> {
    let rest = template.strip_prefix('%')?;
    let end = rest.find('%')?;
    let var = &rest[..end];
    let value = get(var).filter(|v| !v.is_empty())?;
    Some(PathBuf::from(format!("{value}{}", &rest[end + 1..])))
}

/// Pick the standalone JetBrains install dir for `product_prefix` out of a
/// `%ProgramFiles%\JetBrains` listing and join its launcher: entries look like
/// `IntelliJ IDEA 2025.1`, and the lexicographically-last match approximates the
/// newest (JetBrains versions as `<year>.<1-3>`, so plain string order holds).
/// Returns a path **relative to the JetBrains dir**. Pure; `test`-widened.
#[cfg(any(windows, test))]
fn jetbrains_versioned_exe(
    entries: &[String],
    product_prefix: &str,
    launcher: &str,
) -> Option<PathBuf> {
    entries
        .iter()
        .filter(|e| e.starts_with(product_prefix))
        .max()
        .map(|dir| PathBuf::from(dir).join("bin").join(launcher))
}

/// Wrap a Windows `.cmd`/`.bat` Toolbox script for spawning: batch files need
/// `cmd.exe /C` (mirroring `pty::launch_target`). Pure; `test`-widened.
#[cfg(any(windows, test))]
fn cmd_shim_launch(script: &Path, comspec: Option<&str>) -> (String, Vec<String>) {
    (
        comspec.unwrap_or("cmd.exe").to_string(),
        vec!["/C".to_string(), script.to_string_lossy().into_owned()],
    )
}

/// Resolve how to launch `spec` on this machine — the shared detection/launch
/// resolver (priority order in the module doc). `None` ⇒ not installed.
fn resolve_editor(spec: &EditorSpec) -> Option<ResolvedLaunch> {
    // ① A CLI on the login-shell PATH (blocking `effective_path` under the hood,
    //    so a Finder/.desktop-launched bundle still sees the user's real PATH).
    for name in spec.cli {
        if let Some((program, args)) = crate::pty::resolve_command(name) {
            return Some(ResolvedLaunch {
                program,
                args,
                via: "PATH",
                hidden: true,
            });
        }
    }
    // ② A JetBrains Toolbox shell script (present even when nothing is on PATH).
    if let Some(script) = spec.toolbox_script {
        if let Some(dir) = toolbox_scripts_dir() {
            #[cfg(windows)]
            {
                let candidate = dir.join(format!("{script}.cmd"));
                if candidate.is_file() {
                    let comspec = std::env::var("COMSPEC").ok();
                    let (program, args) = cmd_shim_launch(&candidate, comspec.as_deref());
                    return Some(ResolvedLaunch {
                        program,
                        args,
                        via: "Toolbox",
                        hidden: true,
                    });
                }
            }
            #[cfg(unix)]
            {
                let candidate = dir.join(script);
                if candidate.is_file() {
                    return Some(ResolvedLaunch {
                        program: candidate.to_string_lossy().into_owned(),
                        args: Vec::new(),
                        via: "Toolbox",
                        hidden: true,
                    });
                }
            }
        }
    }
    // ③ A macOS app bundle — launched via `open -na <app> --args <path>` so the
    //    folder opens even when the app is already running. The full stat'd path
    //    (not the bare name) disambiguates duplicate installs.
    #[cfg(target_os = "macos")]
    {
        let home = crate::path_env::home_dir();
        for bundle in spec.mac_bundles {
            let mut roots = vec![PathBuf::from("/Applications")];
            if let Some(h) = &home {
                roots.push(h.join("Applications"));
            }
            for root in roots {
                let app = root.join(format!("{bundle}.app"));
                if app.is_dir() {
                    return Some(ResolvedLaunch {
                        program: "open".to_string(),
                        args: vec![
                            "-na".to_string(),
                            app.to_string_lossy().into_owned(),
                            "--args".to_string(),
                        ],
                        via: "Applications",
                        hidden: false,
                    });
                }
            }
        }
    }
    // ④ A known Windows install path (GUI-subsystem exe — spawned directly).
    #[cfg(windows)]
    for template in spec.win_probes {
        let expanded = expand_win_probe(template, |var| std::env::var(var).ok());
        if let Some(exe) = expanded {
            if exe.is_file() {
                return Some(ResolvedLaunch {
                    program: exe.to_string_lossy().into_owned(),
                    args: Vec::new(),
                    via: "Program Files",
                    hidden: false,
                });
            }
        }
    }
    // ⑤ A standalone JetBrains install (`%ProgramFiles%\JetBrains\<Product> <ver>`).
    #[cfg(windows)]
    if let Some((prefix, launcher)) = spec.jetbrains_win {
        if let Ok(pf) = std::env::var("ProgramFiles") {
            let jetbrains_dir = Path::new(&pf).join("JetBrains");
            if let Ok(read) = std::fs::read_dir(&jetbrains_dir) {
                let entries: Vec<String> = read
                    .filter_map(|e| e.ok())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .collect();
                if let Some(rel) = jetbrains_versioned_exe(&entries, prefix, launcher) {
                    let exe = jetbrains_dir.join(rel);
                    if exe.is_file() {
                        return Some(ResolvedLaunch {
                            program: exe.to_string_lossy().into_owned(),
                            args: Vec::new(),
                            via: "Program Files",
                            hidden: false,
                        });
                    }
                }
            }
        }
    }
    None
}

/// Detection results for the whole catalog (the `detect_editors` command).
pub fn detect_all() -> Vec<EditorInfo> {
    CATALOG
        .iter()
        .map(|spec| {
            let resolved = resolve_editor(spec);
            EditorInfo {
                id: spec.id.to_string(),
                display_name: spec.display_name.to_string(),
                found: resolved.is_some(),
                via: resolved.map(|r| r.via),
            }
        })
        .collect()
}

/// Substitute the target folder into a custom command's arg tokens: every `{path}`
/// occurrence inside any token is replaced; when **no** token carried the
/// placeholder, the path is appended as a final arg (so a bare `code` works).
pub fn substitute_path(tokens: Vec<String>, path: &str) -> Vec<String> {
    let mut substituted = false;
    let mut out: Vec<String> = tokens
        .into_iter()
        .map(|token| {
            if token.contains("{path}") {
                substituted = true;
                token.replace("{path}", path)
            } else {
                token
            }
        })
        .collect();
    if !substituted {
        out.push(path.to_string());
    }
    out
}

/// Read the user's custom-editor command from the (opaque) settings blob —
/// mirrors `agents::read_custom_command`, for the `customEditorCommand` key.
pub fn read_custom_editor_command(settings: &serde_json::Value) -> Option<String> {
    settings
        .get("customEditorCommand")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// Launch `editor` (a catalog id, or `"custom"` with the user's command) at the
/// folder `path`, detached. Fire-and-forget like `os_open`: the `Child` is dropped,
/// never waited on. A missing editor is a typed `BinaryNotFound` so the frontend
/// can reopen the picker (self-heal) instead of dead-ending on a toast.
pub fn open_in_editor(path: &str, editor: &str, custom: Option<&str>) -> Result<(), SessionError> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(SessionError::Io(format!("`{path}` is not a folder")));
    }
    if editor == "custom" {
        let command = custom.ok_or_else(|| {
            SessionError::Io(
                "no custom editor command is set — add one in Settings → Editor".to_string(),
            )
        })?;
        let (program, args) = crate::agents::parse_custom_command(command)
            .ok_or_else(|| SessionError::Io("the custom editor command is empty".to_string()))?;
        let args = substitute_path(args, path);
        // Resolve exactly as the PTY spawn / `binary_version` probe do (#140): PATHEXT
        // + `.cmd`→`cmd /C` on Windows, the bare name on unix (with the login-shell
        // PATH applied to the spawn by `hidden_command`, already published because
        // `resolve_command` just blocked on it).
        let (resolved, prefix_args) =
            crate::pty::resolve_command(&program).ok_or(SessionError::BinaryNotFound(program))?;
        let mut cmd = crate::git::hidden_command(&resolved);
        cmd.args(&prefix_args).args(&args).current_dir(dir);
        cmd.spawn().map_err(|e| SessionError::Io(e.to_string()))?;
        return Ok(());
    }
    let spec = CATALOG
        .iter()
        .find(|s| s.id == editor)
        .ok_or_else(|| SessionError::Io(format!("unknown editor `{editor}`")))?;
    let resolved = resolve_editor(spec)
        .ok_or_else(|| SessionError::BinaryNotFound(spec.display_name.to_string()))?;
    let mut cmd = if resolved.hidden {
        crate::git::hidden_command(&resolved.program)
    } else {
        crate::child_env::command(&resolved.program)
    };
    cmd.args(&resolved.args)
        .args(spec.args)
        .arg(path)
        .current_dir(dir);
    cmd.spawn().map_err(|e| SessionError::Io(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_unique_and_fields_sane() {
        let mut seen = std::collections::HashSet::new();
        for spec in CATALOG {
            assert!(seen.insert(spec.id), "duplicate editor id `{}`", spec.id);
            assert!(!spec.display_name.is_empty());
            // Read every per-OS field on every host so the
            // `cfg_attr(allow(dead_code))` annotations stay honest: a detectable
            // editor must have at least one detection avenue.
            let avenues = spec.cli.len()
                + spec.mac_bundles.len()
                + spec.win_probes.len()
                + usize::from(spec.toolbox_script.is_some())
                + usize::from(spec.jetbrains_win.is_some());
            assert!(avenues > 0, "`{}` has no detection avenue", spec.id);
        }
        // Notepad++ opens the folder as a workspace instead of its files.
        let npp = CATALOG.iter().find(|s| s.id == "notepadpp").unwrap();
        assert_eq!(npp.args, &["-openFoldersAsWorkspace"]);
        // Every JetBrains-family entry carries the Toolbox script avenue.
        for id in ["idea", "webstorm", "pycharm", "rustrover", "fleet"] {
            let spec = CATALOG.iter().find(|s| s.id == id).unwrap();
            assert!(spec.toolbox_script.is_some(), "`{id}` misses toolbox");
        }
    }

    #[test]
    fn substitute_path_replaces_inside_tokens() {
        assert_eq!(
            substitute_path(vec!["-e".into(), "nvim".into(), "{path}".into()], "/repo/a"),
            vec!["-e", "nvim", "/repo/a"]
        );
        // Embedded and repeated occurrences both substitute.
        assert_eq!(
            substitute_path(vec!["--dir={path}".into(), "{path}/src".into()], "/repo/a"),
            vec!["--dir=/repo/a", "/repo/a/src"]
        );
    }

    #[test]
    fn substitute_path_appends_when_no_token_matches() {
        assert_eq!(
            substitute_path(vec!["-n".into()], "/repo/a"),
            vec!["-n", "/repo/a"]
        );
        assert_eq!(substitute_path(vec![], "/repo/a"), vec!["/repo/a"]);
    }

    #[test]
    fn expand_win_probe_expands_prefix_var() {
        let get = |var: &str| match var {
            "LOCALAPPDATA" => Some(r"C:\Users\e\AppData\Local".to_string()),
            "ProgramFiles(x86)" => Some(r"C:\Program Files (x86)".to_string()),
            _ => None,
        };
        assert_eq!(
            expand_win_probe(r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe", get),
            Some(PathBuf::from(
                r"C:\Users\e\AppData\Local\Programs\cursor\Cursor.exe"
            ))
        );
        // The parenthesized ProgramFiles(x86) var name expands too.
        assert_eq!(
            expand_win_probe(r"%ProgramFiles(x86)%\Notepad++\notepad++.exe", get),
            Some(PathBuf::from(
                r"C:\Program Files (x86)\Notepad++\notepad++.exe"
            ))
        );
    }

    #[test]
    fn expand_win_probe_returns_none_when_var_unset_or_malformed() {
        let none = |_: &str| None::<String>;
        assert_eq!(
            expand_win_probe(r"%ProgramFiles%\Sublime Text\subl.exe", none),
            None
        );
        // Empty value, missing prefix, and an unterminated `%` all refuse.
        assert_eq!(
            expand_win_probe(r"%X%\a.exe", |_| Some(String::new())),
            None
        );
        assert_eq!(expand_win_probe(r"C:\plain\path.exe", |_| None), None);
        assert_eq!(expand_win_probe(r"%LOCALAPPDATA\oops.exe", |_| None), None);
    }

    #[test]
    fn toolbox_scripts_dir_per_os() {
        let home = PathBuf::from("/home/e");
        assert_eq!(
            toolbox_scripts_dir_from("windows", None, Some(r"C:\Users\e\AppData\Local")),
            Some(
                PathBuf::from(r"C:\Users\e\AppData\Local")
                    .join("JetBrains")
                    .join("Toolbox")
                    .join("scripts")
            )
        );
        assert_eq!(
            toolbox_scripts_dir_from("macos", Some(&home), None),
            Some(
                home.join("Library")
                    .join("Application Support")
                    .join("JetBrains")
                    .join("Toolbox")
                    .join("scripts")
            )
        );
        assert_eq!(
            toolbox_scripts_dir_from("linux", Some(&home), None),
            Some(
                home.join(".local")
                    .join("share")
                    .join("JetBrains")
                    .join("Toolbox")
                    .join("scripts")
            )
        );
        // No home / no LOCALAPPDATA ⇒ no dir (arm ① PATH still covers it).
        assert_eq!(toolbox_scripts_dir_from("macos", None, None), None);
        assert_eq!(toolbox_scripts_dir_from("windows", None, None), None);
    }

    #[test]
    fn jetbrains_versioned_exe_picks_matching_newest_dir() {
        let entries: Vec<String> = [
            "CLion 2023.3",
            "IntelliJ IDEA 2024.1",
            "IntelliJ IDEA 2025.1",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert_eq!(
            jetbrains_versioned_exe(&entries, "IntelliJ IDEA", "idea64.exe"),
            Some(
                PathBuf::from("IntelliJ IDEA 2025.1")
                    .join("bin")
                    .join("idea64.exe")
            )
        );
        assert_eq!(
            jetbrains_versioned_exe(&entries, "Rider", "rider64.exe"),
            None
        );
        assert_eq!(jetbrains_versioned_exe(&[], "CLion", "clion64.exe"), None);
    }

    #[test]
    fn cmd_shim_launch_wraps_scripts_through_comspec() {
        let script = PathBuf::from(r"C:\Users\e\AppData\Local\JetBrains\Toolbox\scripts\idea.cmd");
        let (program, args) = cmd_shim_launch(&script, Some(r"C:\Windows\system32\cmd.exe"));
        assert_eq!(program, r"C:\Windows\system32\cmd.exe");
        assert_eq!(
            args,
            vec!["/C".to_string(), script.to_string_lossy().into_owned()]
        );
        // No COMSPEC ⇒ the bare `cmd.exe` fallback.
        assert_eq!(cmd_shim_launch(&script, None).0, "cmd.exe");
    }

    #[test]
    fn custom_command_parse_and_substitute_end_to_end() {
        // Terminal-editor form: the placeholder lands inside the arg list.
        let (program, args) =
            crate::agents::parse_custom_command("alacritty -e nvim {path}").unwrap();
        assert_eq!(program, "alacritty");
        assert_eq!(
            substitute_path(args, "/repo/a"),
            vec!["-e", "nvim", "/repo/a"]
        );
        // Bare command: the folder is appended.
        let (program, args) = crate::agents::parse_custom_command("code").unwrap();
        assert_eq!(program, "code");
        assert_eq!(substitute_path(args, "/repo/a"), vec!["/repo/a"]);
        // A quoted Windows program path survives tokenization as one program token.
        let (program, args) =
            crate::agents::parse_custom_command(r#""C:\Program Files\X\x.exe" {path}"#).unwrap();
        assert_eq!(program, r"C:\Program Files\X\x.exe");
        assert_eq!(substitute_path(args, r"C:\repo"), vec![r"C:\repo"]);
    }

    #[test]
    fn read_custom_editor_command_reads_blob() {
        let v = serde_json::json!({ "customEditorCommand": "  zed {path}  " });
        assert_eq!(
            read_custom_editor_command(&v),
            Some("zed {path}".to_string())
        );
        assert_eq!(read_custom_editor_command(&serde_json::json!({})), None);
        assert_eq!(
            read_custom_editor_command(&serde_json::json!({ "customEditorCommand": "   " })),
            None
        );
        assert_eq!(
            read_custom_editor_command(&serde_json::json!({ "customEditorCommand": 42 })),
            None
        );
    }

    #[test]
    fn open_in_editor_refuses_a_non_directory_path() {
        let err = open_in_editor("/definitely/not/a/real/dir", "vscode", None).unwrap_err();
        assert!(matches!(err, SessionError::Io(_)));
        // And an unknown id refuses before any resolution.
        let dir = std::env::temp_dir();
        let err = open_in_editor(dir.to_str().unwrap(), "not-an-editor", None).unwrap_err();
        assert!(matches!(err, SessionError::Io(_)));
    }

    #[test]
    fn open_in_editor_custom_requires_a_command() {
        let dir = std::env::temp_dir();
        let err = open_in_editor(dir.to_str().unwrap(), "custom", None).unwrap_err();
        assert!(matches!(err, SessionError::Io(_)));
    }
}
