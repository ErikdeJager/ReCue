import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bot,
  Database,
  Download,
  FlaskConical,
  FolderOpen,
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

import { agentCaps, agentIsUntested, SELECTABLE_AGENTS } from "../../agents";
import * as ipc from "../../ipc";
import { patchnotesFor } from "../../patchnotes";
import { kbdHint } from "../../platform";
import { DEFAULT_SETTINGS, REPO_PALETTE, useStore } from "../../store";
import type { Settings as SettingsType } from "../../types";
import Checkbox from "../Checkbox/Checkbox";
import { markdownLinkComponents } from "../markdownCheckboxes";
import PatchNotes from "../PatchNotes/PatchNotes";
import Slider from "../Slider/Slider";
import styles from "./Settings.module.css";

type Section =
  | "terminal"
  | "appearance"
  | "behavior"
  | "sessions"
  | "kanban"
  | "updates"
  | "data";

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
  {
    id: "behavior",
    label: "Behavior",
    icon: <MousePointerClick size={15} strokeWidth={1.5} />,
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

  const [draft, setDraft] = useState<SettingsType>(saved);
  const [section, setSection] = useState<Section>(
    () => (initialSection as Section | null) ?? "terminal",
  );
  const [appVer, setAppVer] = useState("");
  const [claudeVer, setClaudeVer] = useState<string | null>(null);
  // The running version's baked-in patch notes (#192), shown in the Updates pane.
  const currentNotes = appVer ? patchnotesFor(appVer) : null;

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
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    void ipc.clearRecents().catch(() => {});
    setRecents([]);
    pushToast("Recent folders cleared");
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
          {SECTIONS.map((s) => (
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
                  <span className={styles.fieldLabel}>Accent color</span>
                  <div className={styles.swatches}>
                    {REPO_PALETTE.map((color) => {
                      // Peach is the default → store "" so the --accent token
                      // stands; any other swatch overrides --accent with its hex.
                      const isDefault = color === DEFAULT_ACCENT;
                      const active =
                        (draft.accentColor || DEFAULT_ACCENT) === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          className={`${styles.swatch} ${active ? styles.swatchActive : ""}`}
                          style={{ background: color }}
                          onClick={() =>
                            update("accentColor", isDefault ? "" : color)
                          }
                          title={isDefault ? `${color} (default)` : color}
                          aria-label={`Accent ${color}${isDefault ? " (default)" : ""}`}
                          aria-pressed={active}
                        />
                      );
                    })}
                  </div>
                </div>
                <Checkbox
                  checked={draft.reduceMotion}
                  onChange={(v) => update("reduceMotion", v)}
                  label="Reduce motion"
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

            {section === "sessions" && (
              <>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Coding agent</span>
                  <div className={styles.segmented}>
                    {SELECTABLE_AGENTS.map((a) => (
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
                    The CLI new sessions launch under. Codex and OpenCode
                    sessions can't be resumed, forked, or auto-named, and have
                    no usage meter. Existing sessions keep their agent.
                  </span>
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
                              style={{ background: color }}
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
                                ? { background: row.color }
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
              <div className={styles.updates}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Current version
                    <span className={styles.fieldValue}>{appVer || "—"}</span>
                  </span>
                </div>

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

                {updateState.status === "idle" && (
                  <p className={styles.updateStatus}>
                    You&rsquo;re up to date.
                  </p>
                )}
                {updateState.status === "error" && (
                  <p
                    className={`${styles.updateStatus} ${styles.updateError}`}
                    role="alert"
                  >
                    {updateState.error ?? "Update check failed."}
                  </p>
                )}

                {(updateState.status === "available" ||
                  updateState.status === "downloading") &&
                  updateState.version && (
                    <div className={styles.field}>
                      <span className={styles.fieldLabel}>
                        Update available
                        <span className={styles.fieldValue}>
                          v{updateState.version}
                        </span>
                      </span>

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

                {/* Dev-only (#193): fake an available update to exercise the whole
                    flow without a real release. Tree-shaken from production builds. */}
                {import.meta.env.DEV && (
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
                  className={styles.dataButton}
                  onClick={clearRecents}
                  disabled={recentsCount === 0}
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                  Clear recents ({recentsCount})
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
              // Preserve the one-time onboarding flag across a reset so it doesn't
              // re-trigger the first-launch agent picker next launch.
              onClick={() =>
                setDraft({ ...DEFAULT_SETTINGS, onboarded: saved.onboarded })
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
