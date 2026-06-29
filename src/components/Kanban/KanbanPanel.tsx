import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Code2, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { noAutoCapitalize } from "../../inputProps";
import { kbdHint } from "../../platform";
import { kanbanColumnColor, useStore } from "../../store";
import { useAutoSaveFile } from "../../useAutoSaveFile";
import Checkbox from "../Checkbox/Checkbox";
import {
  makeCheckboxComponents,
  markdownLinkComponents,
  rehypeTaskListPositions,
} from "../markdownCheckboxes";
import { type Board, type Card, parseBoard, serializeBoard } from "./kanban";
import {
  addCard,
  addColumn,
  deleteCard,
  deleteColumn,
  moveCard,
  renameColumn,
  toggleCard,
  updateCard,
} from "./kanbanOps";
import styles from "./KanbanPanel.module.css";

interface KanbanPanelProps {
  repoPath: string;
  /** Repo-relative `.md` board path. */
  file: string;
  /** Only fetch/poll while shown. */
  active: boolean;
}

const cardId = (col: number, idx: number) => `card:${col}:${idx}`;
function parseCardId(id: string): [number, number] | null {
  const m = /^card:(\d+):(\d+)$/.exec(id);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Split a single composer/edit textarea value into a card's title + body using ONE
 * rule for both create and edit (#238), so the two parses can't diverge: first line →
 * title (trimmed), remaining lines → body (joined, trailing whitespace trimmed). */
function splitCardText(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const title = (lines[0] ?? "").trim();
  const body = lines.slice(1).join("\n").trimEnd();
  return { title, body };
}

interface CardProps {
  id: string;
  card: Card;
  editing: boolean;
  /** The single-field edit text while this card is being edited (#238) — first line is
   * the title, the rest the body; held locally and committed once on confirm (Save /
   * blur-out / Enter / switch) via `splitCardText`. null when not editing. */
  editText: string | null;
  onStartEdit: () => void;
  onStopEdit: () => void;
  /** Discard the edit and return to view mode (#238 — Cancel / Escape). */
  onCancelEdit: () => void;
  onEditTextChange: (text: string) => void;
  onToggle: () => void;
  /** Toggle a task-list checkbox inside the rendered body (#173) → new body markdown. */
  onBodyToggle: (nextBody: string) => void;
  onDelete: () => void;
}

/** One card — view mode (checkbox + title + rendered markdown body + a hover/focus
 * pencil/trash overlay) or edit mode (a single composer-style textarea + a flow
 * Save/Cancel/Delete row). The whole card surface (incl. the title) is the drag grip
 * (#233/#238); only interactive controls (checkbox, body links/checkboxes, the editor)
 * stop the drag. */
function SortableCard({
  id,
  card,
  editing,
  editText,
  onStartEdit,
  onStopEdit,
  onCancelEdit,
  onEditTextChange,
  onToggle,
  onBodyToggle,
  onDelete,
}: CardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  // Clickable task-list checkboxes inside the rendered body (#173): a toggle flips
  // the marker in the de-indented `card.body` and commits via `onBodyToggle`.
  const bodyComponents = useMemo(
    () =>
      makeCheckboxComponents({
        source: card.body,
        interactive: true,
        onToggle: onBodyToggle,
      }),
    [card.body, onBodyToggle],
  );
  // Commit-on-confirm (#160): while editing, the text binds to the local `editText`
  // (no per-keystroke write). The edit commits once when focus leaves the whole card
  // (click-away = commit, #238) — but NOT when it moves to one of the card's own
  // controls (Save/Cancel), so clicking those doesn't prematurely commit. Cancel
  // discards before any commit runs. (Delete lives only on the view-mode card now, #244.)
  const onEditBlur = (event: FocusEvent<HTMLElement>) => {
    if (!editing) return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    onStopEdit();
  };
  // The whole card is the drag grip (#233, replacing the separate grip column): the
  // 4px pointer activation distance keeps a plain click (edit / toggle / link) working.
  // Interactive controls stop pointerdown so they never start a drag.
  const noDrag = {
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${card.checked ? styles.cardDone : ""} ${
        isDragging ? styles.cardPlaceholder : ""
      }`}
      onBlur={onEditBlur}
      {...attributes}
      {...listeners}
    >
      {editing ? (
        // Single-field editor (#238): one composer-style textarea + a flow action row,
        // so create and edit share the same shape. `noDrag` on the wrapper stops a
        // pointerdown on the textarea/buttons from starting a card drag. The actions
        // render below the textarea (never overlaying the text, the #195 defect).
        <div className={styles.cardEdit} {...noDrag}>
          <textarea
            className={styles.cardEditInput}
            {...noAutoCapitalize}
            value={editText ?? ""}
            placeholder="Write a card… Shift+Enter for detail lines"
            autoFocus
            rows={5}
            onChange={(e) => onEditTextChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              // Enter commits; Shift+Enter inserts a detail line; Escape discards
              // (mirroring the add-card composer). IME-safe.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                onStopEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            aria-label="Edit card"
          />
          {/* preventDefault on mousedown keeps focus in the textarea so clicking a
              button doesn't blur it first (#238): without this, the article's
              commit-on-blur (onEditBlur) would fire before the click — and on WKWebView,
              where a clicked button doesn't take focus, `relatedTarget` is null so the
              blur reads as "left the card" and commits, making Cancel save instead of
              discard. Keyboard focus (Tab) is unaffected. */}
          <div
            className={styles.cardEditActions}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className={styles.composerAdd}
              onClick={onStopEdit}
            >
              Save <kbd className={styles.btnKbd}>⏎</kbd>
            </button>
            <button
              type="button"
              className={styles.composerCancel}
              onClick={onCancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.cardTop}>
            {/* Checkbox pinned top-left (#233); a plain-bullet card (#194, `checked
                === null`) renders no checkbox. */}
            {card.checked !== null && (
              <span {...noDrag} className={styles.cardCheck}>
                <Checkbox
                  checked={card.checked}
                  onChange={onToggle}
                  ariaLabel="Card done"
                />
              </span>
            )}
            {/* The title is plain display text and part of the drag surface (#238):
                clicking it drags the card, never opens edit (which is pencil-only). */}
            <div className={styles.cardTitle}>
              {card.title.trim() || (
                <span className={styles.untitled}>Untitled</span>
              )}
            </div>
          </div>
          {/* Edit/Delete in a hover/focus-revealed cluster absolutely positioned in
              the card's top-right (#195), out of the title's flex flow so the title
              gets the full row width. View mode only (#238 — edit uses the flow row
              above); revealed on `.card:hover`/`:focus-within` so keyboard users reach
              them. */}
          <span className={styles.cardActions} {...noDrag}>
            <button
              type="button"
              className={styles.cardBtn}
              onClick={onStartEdit}
              title="Edit card"
              aria-label="Edit card"
            >
              <Pencil size={12} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className={styles.cardBtn}
              onClick={onDelete}
              title="Delete card"
              aria-label="Delete card"
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          </span>
          {/* The body is part of the drag surface (#246): no `noDrag` here, so a
              press-drag on the grayed description moves the card (like the title).
              Body links + task-list checkboxes stay clickable — the 4px PointerSensor
              activation distance lets a plain click through without starting a drag. */}
          {card.body.trim() && (
            <div className={styles.cardBody}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeTaskListPositions]}
                components={bodyComponents}
              >
                {card.body}
              </ReactMarkdown>
            </div>
          )}
        </>
      )}
    </article>
  );
}

/** The floating card shown under the cursor while dragging (#161 DragOverlay): a
 * clean, static preview (no action buttons) with an elevated shadow, so the drag
 * reads as a lifted card while its origin slot shows the dashed insertion gap. */
function CardPreview({ card }: { card: Card }) {
  return (
    <article
      className={`${styles.card} ${styles.cardOverlay} ${
        card.checked ? styles.cardDone : ""
      }`}
    >
      <div className={styles.cardTop}>
        {/* A plain-bullet card (#194, `checked === null`) renders no checkbox. */}
        {card.checked !== null && (
          <span className={styles.cardCheck}>
            <Checkbox
              checked={card.checked}
              onChange={() => {}}
              ariaLabel="Card done"
            />
          </span>
        )}
        <span className={styles.cardTitle}>
          {card.title.trim() || (
            <span className={styles.untitled}>Untitled</span>
          )}
        </span>
      </div>
      {card.body.trim() && (
        <div className={styles.cardBody}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownLinkComponents}
          >
            {card.body}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}

interface ColumnProps {
  col: number;
  name: string;
  cards: Card[];
  renaming: boolean;
  /** The rename draft while this column is being renamed (#160) — bound to the
   * input, committed once on blur/Enter rather than per keystroke. */
  renameValue: string;
  confirmingDelete: boolean;
  editingCard: number | null;
  /** The single-field edit text for this column's editing card (#238), or null. */
  editText: string | null;
  onRenameStart: () => void;
  onRename: (name: string) => void;
  onRenameStop: () => void;
  onDelete: () => void;
  /** Add a card from the inline composer (#233): first line → title, rest → body. */
  onComposeCard: (title: string, body: string) => void;
  onCardStartEdit: (idx: number) => void;
  onCardStopEdit: () => void;
  onCardCancelEdit: () => void;
  onCardEditTextChange: (text: string) => void;
  onCardToggle: (idx: number) => void;
  /** A body task-list checkbox toggled (#173) → that card's new body markdown. */
  onCardBodyToggle: (idx: number, nextBody: string) => void;
  onCardDelete: (idx: number) => void;
}

/** One column (status lane, #233): a header (accent dot + UPPERCASE name + count pill
 * + "+"), a droppable sortable card list, and an inline add-card composer opened by
 * the "+" / the bottom dashed affordance. */
function BoardColumn(props: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${props.col}` });
  const items = props.cards.map((_, i) => cardId(props.col, i));
  // Per-column accent by NAME (#239, superseding the #233 by-index derivation): the
  // user-configured color for this column name (Settings → Kanban), else a stable
  // hashed-name color. Drives `--col-accent` (top border / header dot / composer).
  const columnColors = useStore((s) => s.settings.kanbanColumnColors);
  const accent = kanbanColumnColor(props.name, columnColors);

  // Inline add-card composer (#233): first line → title, remaining lines → body.
  const [composing, setComposing] = useState(false);
  const [composerText, setComposerText] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const openComposer = () => {
    setComposerText("");
    setComposing(true);
  };
  const cancelComposer = () => {
    setComposing(false);
    setComposerText("");
  };
  const submitComposer = () => {
    // Shared parse (#238): the same first-line→title / rest→body rule the inline card
    // editor uses, so create + edit can't diverge.
    const { title, body } = splitCardText(composerText);
    if (!title && !body.trim()) {
      // An empty submit (or Enter on a blank composer) closes the add flow.
      cancelComposer();
      return;
    }
    props.onComposeCard(title, body);
    // #276: keep the composer open with an empty, focused input so the user can
    // rapidly add the next card without re-clicking "+ Add card". Escape (or an
    // empty Enter, handled above) still closes it.
    setComposerText("");
    composerRef.current?.focus();
  };

  return (
    <section
      className={styles.column}
      style={{ "--col-accent": accent } as CSSProperties}
    >
      <header className={styles.columnHeader}>
        <span className={styles.colDot} aria-hidden />
        {props.renaming ? (
          <input
            className={styles.columnNameInput}
            {...noAutoCapitalize}
            value={props.renameValue}
            autoFocus
            onChange={(e) => props.onRename(e.currentTarget.value)}
            onBlur={props.onRenameStop}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") props.onRenameStop();
            }}
            aria-label="Column name"
          />
        ) : (
          <button
            type="button"
            className={styles.columnName}
            onClick={props.onRenameStart}
            title="Rename column"
          >
            {props.name.trim() || "Untitled"}
          </button>
        )}
        <span className={styles.count}>{props.cards.length}</span>
        <button
          type="button"
          className={styles.colAdd}
          onClick={openComposer}
          title="Add card"
          aria-label="Add card"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
        <span className={styles.columnActions}>
          {/* Columns move per-card via drag (#159) — no whole-column move buttons. */}
          <button
            type="button"
            className={`${styles.colBtn} ${props.confirmingDelete ? styles.colBtnDanger : ""}`}
            onClick={props.onDelete}
            title={
              props.confirmingDelete ? "Click again to delete" : "Delete column"
            }
            aria-label="Delete column"
          >
            {props.confirmingDelete ? (
              "Delete?"
            ) : (
              <X size={13} strokeWidth={1.5} />
            )}
          </button>
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={`${styles.cards} ${isOver ? styles.cardsOver : ""}`}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {props.cards.map((card, idx) => (
            <SortableCard
              key={cardId(props.col, idx)}
              id={cardId(props.col, idx)}
              card={card}
              editing={props.editingCard === idx}
              editText={props.editingCard === idx ? props.editText : null}
              onStartEdit={() => props.onCardStartEdit(idx)}
              onStopEdit={props.onCardStopEdit}
              onCancelEdit={props.onCardCancelEdit}
              onEditTextChange={props.onCardEditTextChange}
              onToggle={() => props.onCardToggle(idx)}
              onBodyToggle={(body) => props.onCardBodyToggle(idx, body)}
              onDelete={() => props.onCardDelete(idx)}
            />
          ))}
        </SortableContext>
        {/* Empty-column hint (#161): a subtle cue instead of a bare gap. */}
        {props.cards.length === 0 && !composing && (
          <p className={styles.emptyHint}>No cards yet</p>
        )}
        {composing ? (
          <div className={styles.composer}>
            <textarea
              ref={composerRef}
              className={styles.composerInput}
              {...noAutoCapitalize}
              value={composerText}
              placeholder="Write a card… Shift+Enter for detail lines"
              autoFocus
              rows={5}
              onChange={(e) => setComposerText(e.currentTarget.value)}
              onKeyDown={(e) => {
                // Enter submits; Shift+Enter inserts a detail line (#233). IME-safe.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  submitComposer();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelComposer();
                }
              }}
              aria-label="New card"
            />
            <div className={styles.composerActions}>
              <button
                type="button"
                className={styles.composerAdd}
                onClick={submitComposer}
              >
                Add card <kbd className={styles.btnKbd}>⏎</kbd>
              </button>
              <button
                type="button"
                className={styles.composerCancel}
                onClick={cancelComposer}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.addCard}
            onClick={openComposer}
          >
            <Plus size={13} strokeWidth={1.5} /> Add card
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Editable Kanban board (#143): reads the `.md`, parses it (#141), and lets the
 * user add/edit/delete/reorder cards (drag within or between columns = status
 * change) and add/rename/reorder/delete columns — never touching the markdown.
 * Every mutation updates the in-memory board, re-renders the read-only card body
 * via react-markdown (#142), and writes `serializeBoard` back to the file
 * **debounced** (#94), preserving the frontmatter + settings block (#141). The
 * #142 hot-reload poll is reconciled so the panel's own writes don't echo-reload
 * (compare against the last synced content) and unsaved local edits aren't
 * clobbered (skip reload while dirty). Works in the main + a detached window (#84).
 */
function KanbanPanel({
  repoPath,
  file,
  active,
}: KanbanPanelProps): ReactElement {
  const confirmDestructive = useStore((s) => s.settings.confirmDestructive);
  const platform = useStore((s) => s.platform);
  // Shared read + hot-reload-poll + debounced-autosave buffer (#148). BOTH the
  // Board view (#143) and the Raw view (#149) edit this one buffer — no second,
  // competing write loop — so they can't double-write or clobber each other.
  const {
    text,
    error,
    status,
    setText,
    dirty,
    manual,
    save,
    onFocus,
    onBlur,
    onCompositionStart,
    onCompositionEnd,
  } = useAutoSaveFile(repoPath, file, active);

  // Board ⟷ Raw view toggle (#147), local + reset per file; auto-defaults to Raw
  // on first load of a structure-less file.
  const [showRaw, setShowRaw] = useState(false);
  const [editing, setEditing] = useState<{ col: number; idx: number } | null>(
    null,
  );
  // Commit-on-confirm drafts (#160): the editing card's single-field text (#238) and
  // the renaming column's name live here while typing — NOT in the save buffer — so
  // keystrokes don't trigger per-keystroke writes; they're flushed once on confirm.
  const [editText, setEditText] = useState<string | null>(null);
  const [renamingCol, setRenamingCol] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);
  // The card currently being dragged (#161), for the DragOverlay floating preview.
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  // The per-file Board/Raw default is applied once on first load (#147), so later
  // hot-reload polls never override the user's toggle choice.
  const didInitView = useRef(false);

  // The board is DERIVED from the shared text buffer (#149): Board mode renders
  // parseBoard(text); a mutation serializes the next board back into the buffer
  // via setText, routing Board + Raw edits through the one #148 write path. The
  // #141 parse∘serialize round-trip keeps the toggle lossless.
  const board = useMemo(
    () => (text === null ? null : parseBoard(text)),
    [text],
  );
  const mutate = useCallback(
    (next: Board) => setText(serializeBoard(next)),
    [setText],
  );

  // Reset per-file view state; apply the Raw/Board default once text first loads.
  useEffect(() => {
    didInitView.current = false;
    setShowRaw(false);
    setEditing(null);
    setEditText(null);
    setRenamingCol(null);
    setRenameDraft(null);
    setConfirmDeleteCol(null);
  }, [repoPath, file]);
  useEffect(() => {
    if (text !== null && !didInitView.current) {
      didInitView.current = true;
      // A structure-less `.md` (no columns) opens in Raw so the user can author it
      // as raw text (#147/#149); a real board opens in Board.
      setShowRaw(parseBoard(text).columns.length === 0);
    }
  }, [text]);

  // Pause the #148 hot-reload poll while a card/column edit is open (#160): the
  // draft isn't in the save buffer (so the buffer isn't "dirty"), so without this an
  // external poll could shift the board under the editor. Treat an open edit as
  // focused; on close, resume the poll and flush the just-committed write.
  useEffect(() => {
    if (editing !== null || renamingCol !== null) onFocus();
    else onBlur();
  }, [editing, renamingCol, onFocus, onBlur]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    setActiveCardId(null);
    const { active: a, over } = event;
    if (!over || !board) return;
    const from = parseCardId(String(a.id));
    if (!from) return;
    const overId = String(over.id);
    const overCard = parseCardId(overId);
    let toCol: number;
    let toIdx: number;
    if (overCard) {
      [toCol, toIdx] = overCard;
    } else {
      const m = /^column:(\d+)$/.exec(overId);
      if (!m) return;
      toCol = Number(m[1]);
      toIdx = board.columns[toCol]?.cards.length ?? 0; // append to the column
    }
    if (from[0] === toCol && from[1] === toIdx) return;
    mutate(moveCard(board, from[0], from[1], toCol, toIdx));
  };

  if (error) {
    return <div className={styles.message}>Couldn’t read {file}.</div>;
  }
  if (board === null) {
    return <div className={styles.message}>Loading…</div>;
  }

  // --- Commit-on-confirm editing (#160) ---
  // Write the in-flight CARD draft to the buffer once, only if it actually changed
  // (a no-op edit shouldn't write). Callers also clear `editing`/`editText`.
  const commitCardDraft = () => {
    if (!editing || editText === null) return;
    const card = board.columns[editing.col]?.cards[editing.idx];
    if (!card) return;
    // Split the single edit field the SAME way the composer does (#238).
    const { title, body } = splitCardText(editText);
    if (card.title !== title || card.body !== body) {
      mutate(updateCard(board, editing.col, editing.idx, { title, body }));
    }
  };
  // Write the in-flight COLUMN-rename draft once, only if it changed.
  const commitRenameDraft = () => {
    if (renamingCol === null || renameDraft === null) return;
    const current = board.columns[renamingCol]?.name;
    if (current !== undefined && current !== renameDraft) {
      mutate(renameColumn(board, renamingCol, renameDraft));
    }
  };
  // Start editing a card: commit any in-flight draft first (commit-on-switch, so a
  // switch never loses typed edits), then seed this card's draft from the board.
  const startCardEdit = (col: number, idx: number) => {
    if (editing && (editing.col !== col || editing.idx !== idx))
      commitCardDraft();
    if (renamingCol !== null) commitRenameDraft();
    const card = board.columns[col]?.cards[idx];
    // Seed the single edit field from the card: title on line 1, body below (#238).
    setEditText(card ? card.title + (card.body ? "\n" + card.body : "") : "");
    setEditing({ col, idx });
    setRenamingCol(null);
    setRenameDraft(null);
  };
  // Confirm a card edit: commit once, then leave edit mode (Save / Enter / blur-out).
  const stopCardEdit = () => {
    commitCardDraft();
    setEditing(null);
    setEditText(null);
  };
  // Discard a card edit without committing (#238 — Cancel / Escape).
  const cancelCardEdit = () => {
    setEditing(null);
    setEditText(null);
  };
  // Add a card from the inline composer (#233): first line → title, rest → body.
  // Unlike the old immediate-edit flow, the card is added complete (no edit mode).
  const addComposedCard = (col: number, title: string, body: string) => {
    commitCardDraft();
    if (renamingCol !== null) commitRenameDraft();
    mutate(addCard(board, col, { title, body, checked: false }));
  };
  // Start renaming a column: commit in-flight drafts first, then seed the name.
  const startColumnRename = (col: number) => {
    commitCardDraft();
    if (renamingCol !== null && renamingCol !== col) commitRenameDraft();
    setRenameDraft(board.columns[col]?.name ?? "");
    setRenamingCol(col);
    setEditing(null);
    setEditText(null);
  };
  // Confirm a column rename (blur/Enter): commit once, then leave rename mode.
  const stopColumnRename = () => {
    commitRenameDraft();
    setRenamingCol(null);
    setRenameDraft(null);
  };
  // Add a column and immediately rename it (its draft starts as "New column").
  const addColumnAndRename = () => {
    commitCardDraft();
    if (renamingCol !== null) commitRenameDraft();
    const idx = board.columns.length;
    mutate(addColumn(board, "New column"));
    setRenameDraft("New column");
    setRenamingCol(idx);
    setEditing(null);
    setEditText(null);
  };

  const deleteColumnAt = (col: number) => {
    const hasCards = (board.columns[col]?.cards.length ?? 0) > 0;
    if (confirmDestructive && hasCards && confirmDeleteCol !== col) {
      setConfirmDeleteCol(col);
      return;
    }
    setConfirmDeleteCol(null);
    if (editing?.col === col) {
      setEditing(null);
      setEditText(null);
    }
    if (renamingCol === col) {
      setRenamingCol(null);
      setRenameDraft(null);
    }
    mutate(deleteColumn(board, col));
  };

  // The card being dragged (#161) → its floating DragOverlay preview.
  const activePos = activeCardId ? parseCardId(activeCardId) : null;
  const activeCard = activePos
    ? board.columns[activePos[0]]?.cards[activePos[1]]
    : undefined;

  return (
    <div className={styles.panel}>
      {/* Board ⟷ Raw toggle (#147, mirroring the #73 FileViewer control) + the
          auto-save status (#148) — or a Save button in manual mode (#162). */}
      <div className={styles.toolbar}>
        {manual ? (
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => save()}
            disabled={!dirty}
            title={
              dirty ? `Save (${kbdHint(platform, "⌘S", "Ctrl+S")})` : "Saved"
            }
          >
            {dirty ? "Save" : "Saved"}
          </button>
        ) : (
          status !== "idle" && (
            <span className={styles.status} role="status">
              {status === "saving"
                ? "Saving…"
                : status === "saved"
                  ? "Saved"
                  : "Save failed"}
            </span>
          )
        )}
        <div className={styles.segmented} role="group" aria-label="View mode">
          <button
            type="button"
            className={`${styles.segment} ${!showRaw ? styles.segmentActive : ""}`}
            onClick={() => setShowRaw(false)}
            aria-pressed={!showRaw}
          >
            <Eye size={13} strokeWidth={1.5} />
            Board
          </button>
          <button
            type="button"
            className={`${styles.segment} ${showRaw ? styles.segmentActive : ""}`}
            onClick={() => setShowRaw(true)}
            aria-pressed={showRaw}
          >
            <Code2 size={13} strokeWidth={1.5} />
            Raw
          </button>
        </div>
      </div>
      {showRaw ? (
        // Editable raw board markdown (#149), auto-saving via the shared #148 hook
        // — the same buffer the Board view edits, so the toggle round-trips losslessly.
        <textarea
          className={styles.rawEditor}
          {...noAutoCapitalize}
          value={text ?? ""}
          spellCheck={false}
          onChange={(event) => setText(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          aria-label={`Edit ${file}`}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event: DragStartEvent) => {
            // Commit any in-flight card/column edit before a drag (don't lose it).
            stopCardEdit();
            stopColumnRename();
            setConfirmDeleteCol(null);
            setActiveCardId(String(event.active.id));
          }}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveCardId(null)}
        >
          <div className={styles.board}>
            {board.columns.map((column, col) => (
              <BoardColumn
                key={col}
                col={col}
                name={column.name}
                cards={column.cards}
                renaming={renamingCol === col}
                renameValue={renameDraft ?? column.name}
                confirmingDelete={confirmDeleteCol === col}
                editingCard={editing?.col === col ? editing.idx : null}
                editText={editing?.col === col ? editText : null}
                onRenameStart={() => startColumnRename(col)}
                onRename={(name) => setRenameDraft(name)}
                onRenameStop={() => stopColumnRename()}
                onDelete={() => deleteColumnAt(col)}
                onComposeCard={(title, body) =>
                  addComposedCard(col, title, body)
                }
                onCardStartEdit={(idx) => startCardEdit(col, idx)}
                onCardStopEdit={() => stopCardEdit()}
                onCardCancelEdit={() => cancelCardEdit()}
                onCardEditTextChange={(t) => setEditText(t)}
                onCardToggle={(idx) => mutate(toggleCard(board, col, idx))}
                onCardBodyToggle={(idx, body) =>
                  mutate(updateCard(board, col, idx, { body }))
                }
                onCardDelete={(idx) => {
                  if (editing?.col === col && editing.idx === idx) {
                    setEditing(null);
                    setEditText(null);
                  }
                  mutate(deleteCard(board, col, idx));
                }}
              />
            ))}
            <button
              type="button"
              className={styles.addColumn}
              onClick={addColumnAndRename}
            >
              <Plus size={14} strokeWidth={1.5} /> Add column
            </button>
          </div>
          {/* Floating preview of the dragged card (#161). */}
          <DragOverlay dropAnimation={null}>
            {activeCard ? <CardPreview card={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default KanbanPanel;
