import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
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
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readTextFile, writeTextFile } from "../../ipc";
import { useStore } from "../../store";
import Checkbox from "../Checkbox/Checkbox";
import { type Board, type Card, parseBoard, serializeBoard } from "./kanban";
import {
  addCard,
  addColumn,
  deleteCard,
  deleteColumn,
  moveCard,
  moveColumn,
  newCard,
  renameColumn,
  toggleCard,
  updateCard,
} from "./kanbanOps";
import styles from "./KanbanPanel.module.css";

// Hot-reload poll while visible (the #44 FileViewer pattern).
const POLL_MS = 1000;
// Debounce write-back (the #94 ScheduledPanel auto-save pattern).
const SAVE_DEBOUNCE_MS = 600;

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

interface CardProps {
  id: string;
  card: Card;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onChange: (patch: Partial<Card>) => void;
  onToggle: () => void;
  onDelete: () => void;
}

/** One card — view mode (checkbox + title + rendered markdown body + edit/delete)
 * or edit mode (title input + markdown body textarea). Draggable by its grip
 * handle only, so the body textarea + buttons stay usable. */
function SortableCard({
  id,
  card,
  editing,
  onStartEdit,
  onStopEdit,
  onChange,
  onToggle,
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
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${card.checked ? styles.cardDone : ""}`}
    >
      <div className={styles.cardTop}>
        <button
          type="button"
          className={styles.cardGrip}
          title="Drag to move card"
          aria-label="Move card"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={13} strokeWidth={1.5} />
        </button>
        <Checkbox
          checked={card.checked}
          onChange={onToggle}
          ariaLabel="Card done"
          className={styles.cardCheck}
        />
        {editing ? (
          <input
            className={styles.cardTitleInput}
            value={card.title}
            placeholder="Card title…"
            autoFocus
            onChange={(e) => onChange({ title: e.currentTarget.value })}
            aria-label="Card title"
          />
        ) : (
          <button
            type="button"
            className={styles.cardTitle}
            onClick={onStartEdit}
            title="Edit card"
          >
            {card.title.trim() || (
              <span className={styles.untitled}>Untitled</span>
            )}
          </button>
        )}
        <span className={styles.cardActions}>
          {editing ? (
            <button
              type="button"
              className={styles.cardBtn}
              onClick={onStopEdit}
              title="Done editing"
              aria-label="Done editing"
            >
              <Check size={13} strokeWidth={1.5} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.cardBtn}
              onClick={onStartEdit}
              title="Edit card"
              aria-label="Edit card"
            >
              <Pencil size={12} strokeWidth={1.5} />
            </button>
          )}
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
      </div>
      {editing ? (
        <textarea
          className={styles.cardBodyInput}
          value={card.body}
          placeholder="Markdown body (optional) — tags, dates, links…"
          onChange={(e) => onChange({ body: e.currentTarget.value })}
          aria-label="Card body (markdown)"
          rows={4}
        />
      ) : (
        card.body.trim() && (
          <div className={styles.cardBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {card.body}
            </ReactMarkdown>
          </div>
        )
      )}
    </article>
  );
}

interface ColumnProps {
  col: number;
  name: string;
  cards: Card[];
  isFirst: boolean;
  isLast: boolean;
  renaming: boolean;
  confirmingDelete: boolean;
  editingCard: number | null;
  onRenameStart: () => void;
  onRename: (name: string) => void;
  onRenameStop: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onAddCard: () => void;
  onCardStartEdit: (idx: number) => void;
  onCardStopEdit: () => void;
  onCardChange: (idx: number, patch: Partial<Card>) => void;
  onCardToggle: (idx: number) => void;
  onCardDelete: (idx: number) => void;
}

/** One column (status lane): a header (rename / reorder / delete), a droppable,
 * sortable list of cards, and a "+ Add card". */
function BoardColumn(props: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${props.col}` });
  const items = props.cards.map((_, i) => cardId(props.col, i));
  return (
    <section className={styles.column}>
      <header className={styles.columnHeader}>
        {props.renaming ? (
          <input
            className={styles.columnNameInput}
            value={props.name}
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
        <span className={styles.columnActions}>
          <button
            type="button"
            className={styles.colBtn}
            onClick={() => props.onMove(-1)}
            disabled={props.isFirst}
            title="Move column left"
            aria-label="Move column left"
          >
            <ChevronLeft size={13} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className={styles.colBtn}
            onClick={() => props.onMove(1)}
            disabled={props.isLast}
            title="Move column right"
            aria-label="Move column right"
          >
            <ChevronRight size={13} strokeWidth={1.5} />
          </button>
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
              onStartEdit={() => props.onCardStartEdit(idx)}
              onStopEdit={props.onCardStopEdit}
              onChange={(patch) => props.onCardChange(idx, patch)}
              onToggle={() => props.onCardToggle(idx)}
              onDelete={() => props.onCardDelete(idx)}
            />
          ))}
        </SortableContext>
        <button
          type="button"
          className={styles.addCard}
          onClick={props.onAddCard}
        >
          <Plus size={13} strokeWidth={1.5} /> Add card
        </button>
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
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<{ col: number; idx: number } | null>(
    null,
  );
  const [renamingCol, setRenamingCol] = useState<number | null>(null);
  const [confirmDeleteCol, setConfirmDeleteCol] = useState<number | null>(null);

  const lastSynced = useRef<string | null>(null);
  const dirty = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const boardRef = useRef<Board | null>(null);
  boardRef.current = board;

  const load = useCallback(
    async (silent = false) => {
      // Skip while a fetch is in flight or we have unsaved local edits (so a poll
      // never clobbers in-progress changes or echo-reloads our own write).
      if (inFlight.current || dirty.current) return;
      inFlight.current = true;
      try {
        const raw = await readTextFile(repoPath, file);
        setError(false);
        if (raw !== lastSynced.current) {
          // Genuine external change → reload + drop stale edit UI.
          lastSynced.current = raw;
          setBoard(parseBoard(raw));
          setEditing(null);
          setRenamingCol(null);
          setConfirmDeleteCol(null);
        }
      } catch {
        if (!silent) {
          setBoard(null);
          setError(true);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [repoPath, file],
  );

  // Reset sync markers on file change; flush a pending write for the old file.
  useEffect(() => {
    lastSynced.current = null;
    dirty.current = false;
    setBoard(null);
    setEditing(null);
    setRenamingCol(null);
    setConfirmDeleteCol(null);
    return () => {
      if (writeTimer.current) {
        clearTimeout(writeTimer.current);
        writeTimer.current = null;
      }
      if (dirty.current && boardRef.current) {
        void writeTextFile(
          repoPath,
          file,
          serializeBoard(boardRef.current),
        ).catch(() => {});
        dirty.current = false;
      }
    };
  }, [repoPath, file]);

  // Fetch when shown / on file change.
  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // Poll for hot-reload while visible; pause when hidden, catch up on regain.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined && !document.hidden) {
        timer = setInterval(() => void load(true), POLL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void load(true);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, load]);

  const writeNow = useCallback(
    (b: Board) => {
      const raw = serializeBoard(b);
      if (raw === lastSynced.current) {
        dirty.current = false;
        return;
      }
      void writeTextFile(repoPath, file, raw)
        .then(() => {
          lastSynced.current = raw;
          dirty.current = false;
        })
        .catch(() => {
          // Keep dirty so the next mutation (or unmount flush) retries.
        });
    },
    [repoPath, file],
  );

  const mutate = useCallback(
    (next: Board) => {
      setBoard(next);
      dirty.current = true;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => writeNow(next), SAVE_DEBOUNCE_MS);
    },
    [writeNow],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
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

  const deleteColumnAt = (col: number) => {
    const hasCards = (board.columns[col]?.cards.length ?? 0) > 0;
    if (confirmDestructive && hasCards && confirmDeleteCol !== col) {
      setConfirmDeleteCol(col);
      return;
    }
    setConfirmDeleteCol(null);
    if (editing?.col === col) setEditing(null);
    mutate(deleteColumn(board, col));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={() => {
        setEditing(null);
        setConfirmDeleteCol(null);
      }}
      onDragEnd={onDragEnd}
    >
      <div className={styles.board}>
        {board.columns.map((column, col) => (
          <BoardColumn
            key={col}
            col={col}
            name={column.name}
            cards={column.cards}
            isFirst={col === 0}
            isLast={col === board.columns.length - 1}
            renaming={renamingCol === col}
            confirmingDelete={confirmDeleteCol === col}
            editingCard={editing?.col === col ? editing.idx : null}
            onRenameStart={() => setRenamingCol(col)}
            onRename={(name) => mutate(renameColumn(board, col, name))}
            onRenameStop={() => setRenamingCol(null)}
            onMove={(dir) => mutate(moveColumn(board, col, col + dir))}
            onDelete={() => deleteColumnAt(col)}
            onAddCard={() => {
              mutate(addCard(board, col, newCard()));
              setEditing({ col, idx: board.columns[col]?.cards.length ?? 0 });
            }}
            onCardStartEdit={(idx) => setEditing({ col, idx })}
            onCardStopEdit={() => setEditing(null)}
            onCardChange={(idx, patch) =>
              mutate(updateCard(board, col, idx, patch))
            }
            onCardToggle={(idx) => mutate(toggleCard(board, col, idx))}
            onCardDelete={(idx) => {
              if (editing?.col === col && editing.idx === idx) setEditing(null);
              mutate(deleteCard(board, col, idx));
            }}
          />
        ))}
        <button
          type="button"
          className={styles.addColumn}
          onClick={() => {
            mutate(addColumn(board, "New column"));
            setRenamingCol(board.columns.length);
          }}
        >
          <Plus size={14} strokeWidth={1.5} /> Add column
        </button>
      </div>
    </DndContext>
  );
}

export default KanbanPanel;
