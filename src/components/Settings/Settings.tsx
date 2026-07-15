import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  ChevronDown,
  Code,
  Copy,
  Database,
  Download,
  FlaskConical,
  FolderOpen,
  Keyboard,
  MonitorCog,
  MousePointerClick,
  Palette,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  SquareKanban,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { agentCaps, agentIsUntested, SETTINGS_AGENTS } from "../../agents";
import { EDITORS } from "../../editors";
import * as ipc from "../../ipc";
import { ensureNotificationPermission } from "../../notify";
import {
  allPatchnotes,
  compareVersions,
  patchnotesFor,
} from "../../patchnotes";
import { isLinux, kbdHint, selfUpdates } from "../../platform";
import {
  DEFAULT_SETTINGS,
  MAX_DISPLAY_SIZE,
  MIN_DISPLAY_SIZE,
  REPO_PALETTE,
  useStore,
} from "../../store";
import type { RendererReport, Settings as SettingsType } from "../../types";
import Checkbox from "../Checkbox/Checkbox";
import { markdownLinkComponents } from "../markdownCheckboxes";
import PatchNotes from "../PatchNotes/PatchNotes";
import Slider from "../Slider/Slider";
import { chordForAction, chordLabel } from "../../keybinds";
import { terminalRendererReport } from "../Terminal/terminalPool";
import styles from "./Settings.module.css";
import ShortcutsPane from "./ShortcutsPane";

type Section =
  | "terminal"
  | "appearance"
  | "rendering"
  | "behavior"
  | "editor"
  | "sessions"
  | "kanban"
  | "updates"
  | "shortcuts"
  | "data";

/** The live terminal-renderer readout (#357) — the frontend half of the diagnostics. */
type TerminalRendererInfo = ReturnType<typeof terminalRendererReport>;

/** How each `RendererReport["source"]` reads in the diagnostics block (#357). */
const DMABUF_SOURCE_LABELS: Record<string, string> = {
  auto: "auto-detection",
  setting: "Settings",
  env: "the RECUE_DISABLE_DMABUF environment variable",
  user_env: "your exported WEBKIT_DISABLE_DMABUF_RENDERER",
};

/**
 * The copy-pasteable rendering diagnostics (#357): what ReCue decided about WebKitGTK's
 * DMA-BUF renderer at boot (decision + reason + the evidence the probes saw + what decided
 * it), and which xterm renderer the terminals are using plus the probed WebGL renderer
 * string. Plain text, so it drops straight into a bug report.
 *
 * `report === null` means the boot report is unavailable (the command failed, or this is a
 * non-Linux build) — the terminal half still renders.
 */
function diagnosticsText(
  report: RendererReport | null,
  term: TerminalRendererInfo,
): string {
  const lines: string[] = [];
  if (report) {
    const outcome = report.dmabuf_disabled ? "disabled" : "left on";
    lines.push(`DMA-BUF renderer: ${outcome} — ${report.reason}`);
    lines.push(
      `  decided by: ${DMABUF_SOURCE_LABELS[report.source] ?? report.source}   setting: ${report.setting}`,
    );
    lines.push(`  evidence: ${report.evidence}`);
  } else {
    lines.push("DMA-BUF renderer: boot diagnostics unavailable.");
  }
  lines.push(
    `Terminal renderer: ${term.active === "webgl" ? "WebGL" : "DOM"} — ${term.reason}`,
  );
  lines.push(
    `  setting: ${term.mode}   probed: ${term.renderer ?? "no WebGL context"}`,
  );
  return lines.join("\n");
}

/** Peach — the default `--accent` token (#102). The Appearance picker maps this
 * swatch to `accentColor: ""` (no override, so the token stands). */
const DEFAULT_ACCENT = "#fab387";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  {
    id: "terminal",
    label: "Terminal",
    icon: <SlidersHorizontal size={15} strokeWidth={1.5} />,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette size={15} strokeWidth={1.5} />,
  },
  // Linux only (#357) — filtered out of the nav on macOS/Windows, where neither decision
  // exists (see `visibleSections`).
  {
    id: "rendering",
    label: "Rendering",
    icon: <MonitorCog size={15} strokeWidth={1.5} />,
  },
  {
    id: "behavior",
    label: "Behavior",
    icon: <MousePointerClick size={15} strokeWidth={1.5} />,
  },
  {
    id: "editor",
    label: "Editor",
    icon: <Code size={15} strokeWidth={1.5} />,
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: <Bot size={15} strokeWidth={1.5} />,
  },
  {
    id: "kanban",
    label: "Kanban",
    icon: <SquareKanban size={15} strokeWidth={1.5} />,
  },
  {
    id: "updates",
    label: "Updates",
    icon: <RefreshCw size={15} strokeWidth={1.5} />,
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: <Keyboard size={15} strokeWidth={1.5} />,
  },
  {
    id: "data",
    label: "Data & About",
    icon: <Database size={15} strokeWidth={1.5} />,
  },
];

/**
 * Settings modal (#100, #102, #103): the **Terminal**, **Appearance**, **Behavior**,
 * **Sessions**, and **Data & About** sections, opened from the sidebar footer gear.
 * Reuses the app modal pattern: a dimmed scrim, a focus-trap, and Escape-to-close.
 * Edits are staged in modal-local **draft** state and applied + persisted only on
 * **Save**; **Cancel** / Escape / scrim discard.
 *
 * Mounted only while open (the default export gates on the store flag), so the
 * draft re-initializes from the saved settings each time it opens.
 */
function SettingsModal() {
  const saved = useStore((s) => s.settings);
  const platform = useStore((s) => s.platform);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const saveSettings = useStore((s) => s.saveSettings);
  const setRecents = useStore((s) => s.setRecents);
  const recentsCount = useStore((s) => s.recents.length);
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const pushToast = useStore((s) => s.pushToast);
  // Deep-link target (#191): the section the opener requested (e.g. the updater
  // indicator → "updates"); else the default (Terminal).
  const initialSection = useStore((s) => s.settingsSection);
  // Updater (#190) — the Updates pane (#191) drives it manually; no new logic.
  // Named `updateState` to avoid the local `update()` settings-draft helper below.
  const updateState = useStore((s) => s.update);
  const checkForUpdate = useStore((s) => s.checkForUpdate);
  const installUpdate = useStore((s) => s.installUpdate);
  const mockUpdate = useStore((s) => s.mockUpdate);
  // #361: a distro-packaged install (pacman / the AUR `recue-bin` / the .deb) is owned
  // by the package manager — the Updates pane then hides every self-update action and
  // points at the package manager instead. "Current version" + the #192 patch notes
  // still render. Every other install kind (incl. the "" pre-load default) is unchanged.
  const installKind = useStore((s) => s.installKind);
  const canSelfUpdate = selfUpdates(installKind);

  const [draft, setDraft] = useState<SettingsType>(saved);
  // Rendering is Linux-only (#357): drop it from the nav everywhere else, so macOS/Windows
  // render byte-for-byte as before.
  const visibleSections = SECTIONS.filter(
    (s) => s.id !== "rendering" || isLinux(platform),
  );
  const [section, setSection] = useState<Section>(() => {
    // Clamp the deep-link / persisted target to what's actually visible, so a stale
    // "rendering" id on macOS/Windows can never leave a blank pane.
    const wanted = initialSection as Section | null;
    return wanted && visibleSections.some((s) => s.id === wanted)
      ? wanted
      : "terminal";
  });
  const [appVer, setAppVer] = useState("");
  const [claudeVer, setClaudeVer] = useState<string | null>(null);
  // The running version's baked-in patch notes (#192), shown in the Updates pane.
  const currentNotes = appVer ? patchnotesFor(appVer) : null;
  // Older versions' notes for the expandable "history" disclosure — previous
  // versions only, newest-first (allPatchnotes is already sorted newest-first).
  const historyNotes = allPatchnotes.filter((n) =>
    appVer ? compareVersions(n.version, appVer) < 0 : n.version !== appVer,
  );
  const [showHistory, setShowHistory] = useState(false);
  // Inline two-click confirm for the destructive "Clear recents" button (#319),
  // honoring the confirm-destructive setting like the app's other destructive
  // actions (TemplateManager delete, FileTree, Sidebar).
  const [confirmingClear, setConfirmingClear] = useState(false);

  // Rendering diagnostics (#357), Linux only. The boot report comes from Rust (a OnceLock
  // captured before GTK init); the terminal half is read straight from the pool, which runs
  // the WebGL probe on demand — so the readout works with zero terminals open.
  const [report, setReport] = useState<RendererReport | null>(null);
  const [termInfo, setTermInfo] = useState<TerminalRendererInfo | null>(null);

  // Which editors the "Open in editor" detection found (ids), fetched once on the
  // Editor section's first visit — it only annotates the select ("— detected"), so
  // every catalog option renders immediately and a failure just drops the suffix.
  const [detectedEditors, setDetectedEditors] = useState<Set<string> | null>(
    null,
  );
  useEffect(() => {
    if (section !== "editor" || detectedEditors !== null) return;
    let cancelled = false;
    void ipc
      .detectEditors()
      .then((infos) => {
        if (cancelled) return;
        setDetectedEditors(
          new Set(infos.filter((i) => i.found).map((i) => i.id)),
        );
      })
      .catch(() => {
        if (!cancelled) setDetectedEditors(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [section, detectedEditors]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus the dialog on open; restore focus to the opener (the gear) on close.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => openerRef.current?.focus?.();
  }, []);

  // About: app + claude versions, best-effort.
  useEffect(() => {
    void ipc
      .appVersion()
      .then(setAppVer)
      .catch(() => {});
    void ipc
      .claudeVersion()
      .then(setClaudeVer)
      .catch(() => {});
  }, []);

  // Rendering diagnostics (#357). Fetched once per open, Linux only — the command returns
  // null off Linux anyway, but skipping the call entirely keeps macOS/Windows untouched.
  // Best-effort: a failure leaves `report` null and the pane says so.
  useEffect(() => {
    if (!isLinux(platform)) return;
    setTermInfo(terminalRendererReport());
    void ipc
      .rendererDiagnostics()
      .then(setReport)
      .catch(() => {});
  }, [platform]);

  const close = () => setOpen(false);
  const save = () => {
    void saveSettings(draft);
    setOpen(false);
  };
  function update<K extends keyof SettingsType>(
    key: K,
    value: SettingsType[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // Focus-trap + Escape (#49), mirroring NewSessionModal.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const clearRecents = () => {
    // First click arms the confirm (unless the user turned off the gate);
    // the second click (or a single click when unguarded) actually clears.
    if (confirmDestructive && !confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    void ipc.clearRecents().catch(() => {});
    setRecents([]);
    pushToast("Recent folders cleared");
    setConfirmingClear(false);
  };

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <nav className={styles.sections} aria-label="Settings sections">
          <h2 className={styles.title}>Settings</h2>
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.sectionTab} ${
                section === s.id ? styles.sectionActive : ""
              }`}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>

        <div className={styles.pane}>
          <div className={styles.content}>
            {section === "terminal" && (
              <>
                <Slider
                  label="Font size"
                  valueLabel={`${draft.terminalFontSize}px`}
                  min={10}
                  max={16}
                  step={0.5}
                  value={draft.terminalFontSize}
                  onChange={(v) => update("terminalFontSize", v)}
                />
                <Slider
                  label="Line height"
                  valueLabel={draft.terminalLineHeight.toFixed(1)}
                  min={1}
                  max={1.8}
                  step={0.1}
                  value={draft.terminalLineHeight}
                  onChange={(v) => update("terminalLineHeight", v)}
                />
                <Checkbox
                  checked={draft.terminalCursorBlink}
                  onChange={(v) => update("terminalCursorBlink", v)}
                  label="Cursor blink"
                  className={styles.checkRow}
                />
              </>
            )}

            {section === "appearance" && (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Theme</span>
                  <div className={styles.segmented}>
                    {(["dark", "light"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`${styles.segment} ${draft.theme === t ? styles.segmentActive : ""}`}
                        onClick={() => update("theme", t)}
                        aria-pressed={draft.theme === t}
                      >
                        {t === "dark" ? "Dark" : "Light"}
                      </button>
                    ))}
                  </div>
                  <span className={styles.fieldWarn}>
                    <TriangleAlert size={13} strokeWidth={2} aria-hidden />
                    Dark mode is the recommended experience.
                  </span>
                  {/* #349: GTK reads GTK_THEME at init, so the native dialogs
                      adopt a changed theme only on the next launch. */}
                  {isLinux(platform) && (
                    <p className={styles.helpText}>
                      Native file dialogs adopt this theme the next time ReCue
                      starts.
                    </p>
                  )}
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Accent color</span>
                  <div className={styles.swatches}>
                    {REPO_PALETTE.map((color) => {
                      // Peach is the default → store "" so the --accent token
                      // stands; any other swatch overrides --accent with its hex.
                      // A "random" draft never equals a palette hex, so no palette
                      // swatch reads active alongside the "?" swatch below.
                      const isDefault = color === DEFAULT_ACCENT;
                      const active =
                        (draft.accentColor || DEFAULT_ACCENT) === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          className={`${styles.swatch} ${active ? styles.swatchActive : ""}`}
                          // `color` too: the active ring is the swatch's own color
                          // via currentColor (UI v2 §10).
                          style={{ background: color, color }}
                          onClick={() =>
                            update("accentColor", isDefault ? "" : color)
                          }
                          title={isDefault ? `${color} (default)` : color}
                          aria-label={`Accent ${color}${isDefault ? " (default)" : ""}`}
                          aria-pressed={active}
                        />
                      );
                    })}
                    {/* "?" random accent (UI v2 task 373): persists the literal
                        "random", resolved to a random palette member each launch. */}
                    <button
                      type="button"
                      className={`${styles.swatch} ${styles.swatchRandom} ${
                        draft.accentColor === "random"
                          ? styles.swatchActive
                          : ""
                      }`}
                      onClick={() => update("accentColor", "random")}
                      title="Random accent — a new palette color each launch"
                      aria-label="Random accent"
                      aria-pressed={draft.accentColor === "random"}
                    >
                      ?
                    </button>
                  </div>
                </div>
                <Checkbox
                  checked={draft.reduceMotion}
                  onChange={(v) => update("reduceMotion", v)}
                  label="Reduce motion"
                  className={styles.checkRow}
                />
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.densePanels}
                    onChange={(v) => update("densePanels", v)}
                    label="Dense panels"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    Tile panels edge-to-edge with no gaps
                    {(() => {
                      // The live (draft) binding, so a rebind in this same modal
                      // session reads back correctly here.
                      const chord = chordForAction(
                        "dense-panels",
                        draft.keybinds,
                      );
                      const label = chordLabel(chord, platform);
                      return label ? ` (${label})` : "";
                    })()}
                    .
                  </p>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.backgroundAnimation}
                    onChange={(v) => update("backgroundAnimation", v)}
                    label="Background animation"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    Animate the app background. Off keeps it static.
                  </p>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.pauseWaveWhenCovered}
                    onChange={(v) => update("pauseWaveWhenCovered", v)}
                    disabled={!draft.backgroundAnimation}
                    label="Pause when covered by panels"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    Pauses the background animation while panels tile over it.
                    It resumes the moment the stage is clear.
                  </p>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.capAgentWidth}
                    onChange={(v) => update("capAgentWidth", v)}
                    label="Cap Overview panel width"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    Limit Overview panels to a comfortable maximum width.
                  </p>
                </div>
                <Checkbox
                  checked={draft.showDiffLineCounts}
                  onChange={(v) => update("showDiffLineCounts", v)}
                  label="Show added/removed line counts on agent rows"
                  className={styles.checkRow}
                />
                <Slider
                  label="Overview panel min width"
                  valueLabel={`${draft.overviewPanelMinWidth}px`}
                  min={320}
                  max={600}
                  step={20}
                  value={draft.overviewPanelMinWidth}
                  onChange={(v) => update("overviewPanelMinWidth", v)}
                />
                <Slider
                  label="Display size"
                  valueLabel={`${draft.displaySize}%`}
                  min={MIN_DISPLAY_SIZE}
                  max={MAX_DISPLAY_SIZE}
                  step={5}
                  value={draft.displaySize}
                  onChange={(v) => update("displaySize", v)}
                />
                <p className={styles.helpText}>
                  Scales the entire interface. The terminal font size is set
                  separately under Terminal.
                </p>
                <Slider
                  label="Terminal background"
                  valueLabel={`${draft.terminalBackgroundLightness}%`}
                  min={0}
                  max={100}
                  step={5}
                  value={draft.terminalBackgroundLightness}
                  onChange={(v) => update("terminalBackgroundLightness", v)}
                />
                <p className={styles.helpText}>
                  Lighten the agent terminal background from near-black toward
                  gray.
                </p>
              </>
            )}

            {/* Rendering (#357) — Linux only. Tauri's own Linux-graphics guidance is to
                ship these switches: WebKitGTK masks the WebGL renderer string and the
                auto-detection is unreliable, and a user who launches the AppImage from a
                desktop menu can't set the RECUE_* environment variables at all. The
                `isLinux` guard is belt-and-braces on top of the nav filter. */}
            {section === "rendering" && isLinux(platform) && (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>DMA-BUF renderer</span>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["auto", "Auto (recommended)"],
                        ["on", "On"],
                        ["off", "Off"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.linuxDmabufRenderer === v ? styles.segmentActive : ""}`}
                        onClick={() => update("linuxDmabufRenderer", v)}
                        aria-pressed={draft.linuxDmabufRenderer === v}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.helpText}>
                    WebKitGTK&rsquo;s zero-copy GPU path for the app window.{" "}
                    <strong>Off</strong> renders the window on the CPU — the fix
                    when the GPU path is broken (the NVIDIA proprietary driver,
                    or a VM with no real GPU), which reads as a sluggish or
                    blank window. <strong>On</strong> keeps it when
                    auto-detection wrongly turns it off. Auto detects your GPU
                    and is right for almost everyone.
                  </p>
                  {/* Compared against the NORMALIZED mode that was in effect at boot, so a
                      fresh install (nothing persisted ⇒ "auto") whose draft is still auto
                      shows no spurious note. */}
                  {report && report.setting !== draft.linuxDmabufRenderer && (
                    <span className={styles.fieldWarn}>
                      <TriangleAlert size={13} strokeWidth={2} aria-hidden />
                      Restart ReCue to apply this. (The window&rsquo;s renderer
                      is chosen before it opens.)
                    </span>
                  )}
                  {report?.source === "env" && (
                    <span className={styles.fieldHelp}>
                      Overridden this run by <code>RECUE_DISABLE_DMABUF</code>.
                      The setting still saves, and applies once that variable is
                      gone.
                    </span>
                  )}
                  {report?.source === "user_env" && (
                    <span className={styles.fieldHelp}>
                      Overridden this run by your exported{" "}
                      <code>WEBKIT_DISABLE_DMABUF_RENDERER</code>. The setting
                      still saves, and applies once that variable is gone.
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Terminal renderer</span>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["auto", "Auto (detect)"],
                        ["webgl", "WebGL"],
                        ["dom", "DOM"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.linuxTerminalRenderer === v ? styles.segmentActive : ""}`}
                        onClick={() => update("linuxTerminalRenderer", v)}
                        aria-pressed={draft.linuxTerminalRenderer === v}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.helpText}>
                    How the terminals draw their text. <strong>WebGL</strong> is
                    the fast GPU glyph renderer; when the GPU context is only
                    software-rasterized (llvmpipe / SwiftShader) the{" "}
                    <strong>DOM</strong> renderer is faster, which Auto detects.
                    Applies immediately on Save — open terminals keep their
                    contents. Detached canvas windows always use the DOM
                    renderer.
                  </p>
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Diagnostics</span>
                  <p className={styles.helpText}>
                    What ReCue detected and decided at startup — paste this into
                    a bug report.
                  </p>
                  {termInfo ? (
                    <>
                      <pre className={styles.diagnostics}>
                        {diagnosticsText(report, termInfo)}
                      </pre>
                      <button
                        type="button"
                        className={styles.dataButton}
                        onClick={() => {
                          void ipc
                            .clipboardWriteText(
                              diagnosticsText(report, termInfo),
                            )
                            .then(() => pushToast("Diagnostics copied"))
                            .catch(() => pushToast("Could not copy"));
                        }}
                      >
                        <Copy size={15} strokeWidth={1.5} />
                        Copy diagnostics
                      </button>
                    </>
                  ) : (
                    <p className={styles.helpText}>Diagnostics unavailable.</p>
                  )}
                </div>
              </>
            )}

            {section === "behavior" && (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Default view on launch
                  </span>
                  <div className={styles.segmented}>
                    {(["overview", "canvas"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.defaultView === v ? styles.segmentActive : ""}`}
                        onClick={() => update("defaultView", v)}
                        aria-pressed={draft.defaultView === v}
                      >
                        {v === "overview" ? "Overview" : "Canvas"}
                      </button>
                    ))}
                  </div>
                </div>
                <Checkbox
                  checked={draft.confirmDestructive}
                  onChange={(v) => update("confirmDestructive", v)}
                  label="Confirm destructive actions"
                  className={styles.checkRow}
                />
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.autoFocusOnHover}
                    onChange={(v) => update("autoFocusOnHover", v)}
                    label="Auto-focus agents and panels on hover"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    When on, moving the mouse over an agent or panel selects it
                    (the highlight border follows the pointer) and an agent or
                    terminal panel is focused so you can type immediately.
                    Hovering a panel without terminal input unfocuses the
                    previous terminal, so keystrokes never keep going to it.
                    Text fields you are editing are never interrupted.
                  </p>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    checked={draft.autoSave}
                    onChange={(v) => update("autoSave", v)}
                    label="Auto-save files"
                    className={styles.checkRow}
                  />
                  <p className={styles.helpText}>
                    {draft.autoSave
                      ? "Edits to files and Kanban boards are written automatically."
                      : `Save manually with ${kbdHint(
                          platform,
                          "⌘S",
                          "Ctrl+S",
                        )} or the Save button.`}
                  </p>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Closing a Canvas tab with contents
                  </span>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["ask", "Ask every time"],
                        ["kill", "Always kill"],
                        ["keep", "Never kill"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.canvasCloseBehavior === v ? styles.segmentActive : ""}`}
                        onClick={() => update("canvasCloseBehavior", v)}
                        aria-pressed={draft.canvasCloseBehavior === v}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Diff display mode</span>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["focused", "Focused single file"],
                        ["accordion", "Accordion files"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.diffDisplayMode === v ? styles.segmentActive : ""}`}
                        onClick={() => update("diffDisplayMode", v)}
                        aria-pressed={draft.diffDisplayMode === v}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.helpText}>
                    How the diff viewer lays out changed files. Each diff panel
                    can still be toggled independently; the last in-panel choice
                    becomes the default for newly-opened panels.
                  </p>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Diff line mode</span>
                  <div className={styles.segmented}>
                    {(
                      [
                        ["unified", "Unified"],
                        ["split", "Split"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`${styles.segment} ${draft.diffLineMode === v ? styles.segmentActive : ""}`}
                        onClick={() => update("diffLineMode", v)}
                        aria-pressed={draft.diffLineMode === v}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.helpText}>
                    Whether the diff viewer shows changes in one column
                    (unified) or side-by-side (split). The last in-panel choice
                    becomes the default for newly-opened panels.
                  </p>
                </div>
              </>
            )}

            {section === "editor" && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Open in editor</span>
                <select
                  className={styles.editorSelect}
                  value={draft.preferredEditor ?? ""}
                  onChange={(e) =>
                    update(
                      "preferredEditor",
                      e.currentTarget.value === ""
                        ? null
                        : e.currentTarget.value,
                    )
                  }
                  aria-label="Preferred editor"
                >
                  <option value="">Ask every time</option>
                  {EDITORS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                      {detectedEditors?.has(e.id) ? " — detected" : ""}
                    </option>
                  ))}
                  <option value="custom">Custom command…</option>
                </select>
                <span className={styles.fieldHelp}>
                  The editor {"“Open in editor”"} launches — from the agent{" "}
                  {"⋯"} menu, a folder's right-click menu, or{" "}
                  {chordLabel(
                    chordForAction("open-in-editor", draft.keybinds),
                    platform,
                  ) || "its shortcut"}
                  . {"“Ask every time”"} opens the picker on each use.
                </span>
                {draft.preferredEditor === "custom" && (
                  <>
                    <input
                      type="text"
                      className={styles.commandInput}
                      value={draft.customEditorCommand}
                      onChange={(e) =>
                        update("customEditorCommand", e.currentTarget.value)
                      }
                      placeholder="alacritty -e nvim {path}"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      aria-label="Custom editor command"
                    />
                    <span className={styles.fieldHelp}>
                      A program and its arguments, as you'd type it in a
                      terminal (split on spaces; quote to group) — not a shell
                      line. Every {"{path}"} is replaced with the folder;
                      without it the folder is appended as the last argument.
                      Terminal editors go through their emulator, e.g.{" "}
                      <code>alacritty -e nvim {"{path}"}</code>.
                    </span>
                    {draft.customEditorCommand.trim() === "" && (
                      <span className={styles.fieldWarn}>
                        <TriangleAlert size={13} strokeWidth={2} aria-hidden />
                        Enter a command — opening a folder with none set will
                        fail.
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            {section === "sessions" && (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Coding agent</span>
                  <div className={styles.segmented}>
                    {SETTINGS_AGENTS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className={`${styles.segment} ${draft.defaultAgent === a.id ? styles.segmentActive : ""}`}
                        onClick={() => update("defaultAgent", a.id)}
                        aria-pressed={draft.defaultAgent === a.id}
                      >
                        {a.displayName}
                      </button>
                    ))}
                  </div>
                  <span className={styles.fieldHelp}>
                    The CLI new sessions launch under. Codex, OpenCode, and
                    Custom sessions can't be resumed, forked, or auto-named, and
                    have no usage meter. Existing sessions keep their agent.
                  </span>
                  {draft.defaultAgent === "custom" && (
                    <>
                      <input
                        type="text"
                        className={styles.commandInput}
                        value={draft.customAgentCommand}
                        onChange={(e) =>
                          update("customAgentCommand", e.currentTarget.value)
                        }
                        placeholder="my-agent --flag"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoCorrect="off"
                        aria-label="Custom agent command"
                      />
                      <span className={styles.fieldHelp}>
                        The exact command ReCue runs to start each new agent — a
                        program and its arguments, as you'd type it in a
                        terminal (split on spaces; quote to group). Resume,
                        fork, auto-naming, and the usage meter aren't available
                        for a custom agent.
                      </span>
                      {draft.customAgentCommand.trim() === "" && (
                        <span className={styles.fieldWarn}>
                          <TriangleAlert
                            size={13}
                            strokeWidth={2}
                            aria-hidden
                          />
                          Enter a command — starting a session with none set
                          will fail.
                        </span>
                      )}
                    </>
                  )}
                  {agentIsUntested(draft.defaultAgent) && (
                    <span className={styles.fieldWarn}>
                      <TriangleAlert size={13} strokeWidth={2} aria-hidden />
                      {agentCaps(draft.defaultAgent).displayName} is untested.
                      Claude Code is the recommended agent.
                    </span>
                  )}
                </div>
                <Checkbox
                  checked={draft.autoName}
                  onChange={(v) => update("autoName", v)}
                  label="Auto-name agents from claude's session title"
                  className={styles.checkRow}
                />
                <div className={styles.field}>
                  <Checkbox
                    // #326: the privacy toggle gating the usage bar AND the Claude
                    // OAuth token read. Off → no usage IPC is ever invoked.
                    checked={draft.showSessionUsage}
                    onChange={(v) => update("showSessionUsage", v)}
                    label="Show session usage"
                    className={styles.checkRow}
                  />
                  <span className={styles.fieldHelp}>
                    Display the five-hour Claude usage bar above the sidebar
                    footer. When off, ReCue never reads your Claude auth token.
                  </span>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    // Claude-only (#296): shown off + disabled for a non-Claude
                    // default agent (the usage feed the machine reads is Claude's).
                    // Also requires session usage to be on (#326) — the machine
                    // reads the same usage feed, which is off when usage is hidden.
                    checked={
                      draft.defaultAgent === "claude" &&
                      draft.showSessionUsage &&
                      draft.autoContinueAfterLimit
                    }
                    onChange={(v) => update("autoContinueAfterLimit", v)}
                    disabled={
                      draft.defaultAgent !== "claude" || !draft.showSessionUsage
                    }
                    label="Auto continue after limit reset"
                    className={styles.checkRow}
                  />
                  {draft.defaultAgent !== "claude" ? (
                    <span className={styles.fieldHelp}>
                      Requires Claude as the default agent.
                    </span>
                  ) : !draft.showSessionUsage ? (
                    <span className={styles.fieldHelp}>
                      Requires session usage to be enabled.
                    </span>
                  ) : (
                    <span className={styles.fieldHelp}>
                      When the five-hour usage limit is hit, wait for the window
                      to reset, then nudge the running Claude agents to
                      continue.
                    </span>
                  )}
                </div>
                <div className={styles.field}>
                  <Checkbox
                    // #309: gates the sidebar-footer "Enable auto restart on
                    // limit reset" prompt button. Not Claude-gated here — the
                    // button itself gates on the active set being Claude. Disabled
                    // when session usage is off (#326): the prompt can only ever
                    // appear when usage data exists.
                    checked={draft.promptEnableAutoContinueAtLimit}
                    onChange={(v) =>
                      update("promptEnableAutoContinueAtLimit", v)
                    }
                    disabled={!draft.showSessionUsage}
                    label="Offer to enable auto continue when the limit is reached"
                    className={styles.checkRow}
                  />
                  <span className={styles.fieldHelp}>
                    Show a button above the usage bar to turn on auto continue
                    when the five-hour limit is reached and it's off.
                  </span>
                </div>
                <div className={styles.field}>
                  <Checkbox
                    // Global master switch for per-agent "watch" (#336): on → EVERY
                    // agent notifies on busy→idle regardless of its per-agent flag
                    // (those flags are retained for when this is turned back off).
                    checked={draft.watchAllAgents}
                    onChange={(v) => {
                      update("watchAllAgents", v);
                      // Request notification permission at opt-in time (turning it on).
                      if (v) void ensureNotificationPermission();
                    }}
                    label="Watch all agents"
                    className={styles.checkRow}
                  />
                  <span className={styles.fieldHelp}>
                    Pop up a notification whenever any agent finishes a turn or
                    is waiting for input. Otherwise, turn on watch per agent.
                  </span>
                </div>
              </>
            )}

            {section === "kanban" && (
              // Column colors by name (#239): a global, editable name→color list. A
              // column whose name isn't listed falls back to a stable hashed-name color.
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Column colors</span>
                <p className={styles.helpText}>
                  Color board columns by name — applied to every Kanban board. A
                  column whose name isn't listed gets a stable color hashed from
                  its name.
                </p>
                <div className={styles.kanbanColors}>
                  {draft.kanbanColumnColors.map((row, i) => {
                    const setRow = (
                      patch: Partial<{ name: string; color: string }>,
                    ) =>
                      update(
                        "kanbanColumnColors",
                        draft.kanbanColumnColors.map((r, j) =>
                          j === i ? { ...r, ...patch } : r,
                        ),
                      );
                    // A non-palette color is shown as the active state on the "+"
                    // free-picker swatch (filled with that color) rather than any
                    // palette swatch.
                    const onPalette = REPO_PALETTE.includes(row.color);
                    const customActive = !onPalette && !!row.color;
                    return (
                      <div key={i} className={styles.kanbanColorRow}>
                        <input
                          className={styles.kanbanColorName}
                          value={row.name}
                          placeholder="Column name"
                          onChange={(e) =>
                            setRow({ name: e.currentTarget.value })
                          }
                          aria-label="Column name"
                        />
                        <div className={styles.swatches}>
                          {REPO_PALETTE.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`${styles.swatch} ${row.color === color ? styles.swatchActive : ""}`}
                              // `color` too: the active ring is the swatch's own
                              // color via currentColor (UI v2 §10).
                              style={{ background: color, color }}
                              onClick={() => setRow({ color })}
                              title={color}
                              aria-label={`Color ${color}`}
                              aria-pressed={row.color === color}
                            />
                          ))}
                          {/* "+" free color picker (#239): a deliberate exception to
                              the palette-only convention. A hidden native color input
                              fills the swatch; when a custom color is set the swatch
                              shows it (active), otherwise a "+". */}
                          <label
                            className={`${styles.swatch} ${styles.swatchCustom} ${customActive ? styles.swatchActive : ""}`}
                            style={
                              customActive
                                ? { background: row.color, color: row.color }
                                : undefined
                            }
                            title="Custom color"
                          >
                            {!customActive && (
                              <Plus size={13} strokeWidth={1.5} />
                            )}
                            <input
                              type="color"
                              className={styles.colorInput}
                              value={row.color || "#cba6f7"}
                              onChange={(e) =>
                                setRow({ color: e.currentTarget.value })
                              }
                              aria-label="Custom color"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className={styles.kanbanColorRemove}
                          onClick={() =>
                            update(
                              "kanbanColumnColors",
                              draft.kanbanColumnColors.filter(
                                (_, j) => j !== i,
                              ),
                            )
                          }
                          title="Remove"
                          aria-label="Remove column color"
                        >
                          <X size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={styles.addRowBtn}
                  onClick={() =>
                    update("kanbanColumnColors", [
                      ...draft.kanbanColumnColors,
                      { name: "", color: "" },
                    ])
                  }
                >
                  <Plus size={14} strokeWidth={1.5} /> Add column color
                </button>
              </div>
            )}

            {section === "updates" && (
              // Manual "review then install" surface (#191) over #190's updater:
              // current version + a Check button, status feedback, and — when an
              // update is available — the new version, a labelled "What's new" slot
              // (filled by #192), and an "Update now" button driving #190's
              // download→freeze/progress→restart flow. No new updater logic here.
              //
              // #361: on a **package-managed** install (`installKind === "system"` — a
              // Linux release binary with no $APPIMAGE: pacman / the AUR `recue-bin` /
              // the .deb) every self-update action is hidden and replaced by a note
              // pointing at the package manager. The current version and the baked-in
              // patch notes below still render — they're just information.
              <div className={styles.updates}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Current version
                    <span className={styles.fieldValue}>{appVer || "—"}</span>
                  </span>
                </div>

                {!canSelfUpdate && (
                  <p className={styles.updateStatus}>
                    ReCue was installed by your package manager, so the in-app
                    updater is disabled — the package manager owns this install.
                    {isLinux(platform) ? (
                      <>
                        {" "}
                        Update it with{" "}
                        <code className={styles.updateCmd}>
                          sudo pacman -Syu recue-bin
                        </code>{" "}
                        (Arch/AUR), or your distro&rsquo;s updater.
                      </>
                    ) : (
                      <> Update it with your package manager.</>
                    )}
                  </p>
                )}

                {canSelfUpdate && (
                  <button
                    type="button"
                    className={styles.dataButton}
                    onClick={() => void checkForUpdate()}
                    disabled={
                      updateState.status === "checking" ||
                      updateState.status === "downloading"
                    }
                  >
                    <RefreshCw
                      size={15}
                      strokeWidth={1.5}
                      className={
                        updateState.status === "checking"
                          ? styles.spin
                          : undefined
                      }
                    />
                    {updateState.status === "checking"
                      ? "Checking…"
                      : "Check for updates"}
                  </button>
                )}

                {canSelfUpdate && updateState.status === "idle" && (
                  <p className={styles.updateStatus}>
                    You&rsquo;re up to date.
                  </p>
                )}
                {canSelfUpdate && updateState.status === "error" && (
                  <p
                    className={`${styles.updateStatus} ${styles.updateError}`}
                    role="alert"
                  >
                    {updateState.error ?? "Update check failed."}
                  </p>
                )}

                {canSelfUpdate &&
                  (updateState.status === "available" ||
                    updateState.status === "downloading") &&
                  updateState.version && (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>
                        Update available
                        <span className={styles.fieldValue}>
                          v{updateState.version}
                        </span>
                      </span>

                      {/* The install action sits directly under the label, above
                          the (potentially long) release notes (#286) — so a long
                          "What's new" block can never push the button below the
                          scrollable fold where it's unreachable. */}
                      {updateState.status === "downloading" ? (
                        <div className={styles.updateProgress}>
                          <div className={styles.progressTrack}>
                            <div
                              className={styles.progressBar}
                              style={{ width: `${updateState.progress}%` }}
                            />
                          </div>
                          <span className={styles.fieldValue}>
                            Installing… {updateState.progress}%
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.updateNow}
                          onClick={() => void installUpdate()}
                        >
                          <Download size={15} strokeWidth={1.5} />
                          Update now &amp; restart
                        </button>
                      )}

                      {/* "What will be installed" (#192): the release-carried notes
                          (markdown from latest.json → update.body), so a
                          not-yet-installed version's notes are readable here. */}
                      <div className={styles.whatsNew}>
                        <span className={styles.whatsNewLabel}>
                          What&rsquo;s new in v{updateState.version}
                        </span>
                        <div
                          className={styles.whatsNewSlot}
                          data-update-version={updateState.version}
                        >
                          {updateState.notes ? (
                            <div className={styles.markdownNotes}>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownLinkComponents}
                              >
                                {updateState.notes}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className={styles.whatsNewEmpty}>
                              No release notes provided.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                {/* The running version's baked-in notes (#192) — an in-app
                    changelog of what's already installed. */}
                {currentNotes && (
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>
                      What&rsquo;s new in this version
                    </span>
                    <PatchNotes notes={currentNotes} />
                  </div>
                )}

                {/* Expandable history of every earlier version's notes — an
                    opt-in disclosure so the pane stays clean by default. */}
                {historyNotes.length > 0 && (
                  <div className={styles.historySection}>
                    <button
                      type="button"
                      className={styles.historyToggle}
                      aria-expanded={showHistory}
                      onClick={() => setShowHistory((v) => !v)}
                    >
                      <ChevronDown
                        size={14}
                        strokeWidth={1.5}
                        className={
                          showHistory ? undefined : styles.chevronCollapsed
                        }
                      />
                      {showHistory
                        ? "Hide earlier versions"
                        : "Show earlier versions"}
                    </button>
                    {showHistory && (
                      <div className={styles.history}>
                        {historyNotes.map((n) => (
                          <div key={n.version} className={styles.historyEntry}>
                            <span className={styles.historyVersion}>
                              v{n.version}
                              <span className={styles.historyDate}>
                                {n.date}
                              </span>
                            </span>
                            <PatchNotes notes={n} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Dev-only (#193): fake an available update to exercise the whole
                    flow without a real release. Tree-shaken from production builds.
                    Hidden on a package-managed install (#361) — every surface the
                    mock drives (the indicator, this pane's available block) is gated
                    off there, so the button would be inert. */}
                {import.meta.env.DEV && canSelfUpdate && (
                  <button
                    type="button"
                    className={styles.dataButton}
                    onClick={() => mockUpdate()}
                  >
                    <FlaskConical size={15} strokeWidth={1.5} />
                    Simulate update (dev)
                  </button>
                )}
              </div>
            )}

            {section === "shortcuts" && (
              // Editable keybinds (the keybind rework, superseding the #318
              // read-only reference): rebindable actions stage into the draft
              // like every other section; the fixed contextual chords render
              // read-only below.
              <ShortcutsPane
                platform={platform}
                keybinds={draft.keybinds}
                onChange={(next) => update("keybinds", next)}
              />
            )}

            {section === "data" && (
              <div className={styles.dataSection}>
                <button
                  type="button"
                  className={styles.dataButton}
                  onClick={() => void ipc.openDataFolder().catch(() => {})}
                >
                  <FolderOpen size={15} strokeWidth={1.5} />
                  Open data folder
                </button>
                <button
                  type="button"
                  className={`${styles.dataButton} ${
                    confirmingClear ? styles.dataButtonArmed : ""
                  }`}
                  onClick={clearRecents}
                  onMouseLeave={() => setConfirmingClear(false)}
                  disabled={recentsCount === 0}
                  title={
                    confirmingClear
                      ? "Click again to clear all recent folders"
                      : undefined
                  }
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                  {confirmingClear
                    ? "Clear all recent folders?"
                    : `Clear recents (${recentsCount})`}
                </button>
                <dl className={styles.about}>
                  <div className={styles.aboutRow}>
                    <dt>ReCue</dt>
                    <dd>{appVer || "—"}</dd>
                  </div>
                  <div className={styles.aboutRow}>
                    <dt>claude</dt>
                    <dd>{claudeVer ?? "not found"}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          <footer className={styles.actions}>
            <button
              type="button"
              className={styles.resetButton}
              // Preserve the one-time flags across a reset so it doesn't re-trigger the
              // first-launch agent picker (`onboarded`), re-arm the #367 line-height
              // migration (`terminalLineHeightMigrated`), or re-arm the #414 terminal
              // background migration (`terminalBackgroundMigrated`) next launch.
              onClick={() =>
                setDraft({
                  ...DEFAULT_SETTINGS,
                  onboarded: saved.onboarded,
                  terminalLineHeightMigrated: saved.terminalLineHeightMigrated,
                  terminalBackgroundMigrated: saved.terminalBackgroundMigrated,
                })
              }
            >
              Reset to defaults
            </button>
            <div className={styles.actionsRight}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={save}
              >
                Save
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

/** Gate: render the modal only while open, so its draft state is fresh each time. */
function Settings() {
  const open = useStore((s) => s.settingsOpen);
  if (!open) return null;
  return <SettingsModal />;
}

export default Settings;
