import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";

import { searchFiles } from "../../ipc";
import { rankFileMatches } from "../../fileRank";
import { noAutoCapitalize } from "../../inputProps";
import styles from "./FilePicker.module.css";

interface FilePickerProps {
  /** Repo whose files are searched (repo-relative results). */
  repoPath: string;
  /** Restrict results to this extension (e.g. `.md` for the Kanban picker). */
  ext?: string;
  /** Called with the chosen repo-relative path. */
  onPick: (file: string) => void;
  /**
   * Optional create affordance (#151): when provided, the search box doubles as
   * a name field — a "Create '<typed><createSuffix>'" action (driven by the
   * search text) lets the user author a brand-new file in the same modal. Used
   * by the Kanban flow to create a board without a separate menu entry; omitted
   * for the plain file viewer, which keeps its open-only behavior.
   */
  onCreate?: (name: string) => void;
  /** Suffix shown in the create label (e.g. `.md`) so the user sees the real
   *  filename; the raw typed name is still passed to `onCreate`. */
  createSuffix?: string;
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Reusable searchable file picker (#56): an autofocused search box over a scrollable
 * list of matches. Each row shows the **basename** prominently with the containing
 * **directory dimmed**. The match is computed **server-side** (the backend
 * `search_files` — a case-insensitive substring over the whole repo, result-capped),
 * so it scales to very large repos without ever loading every path into the view
 * (#167); the query is debounced. Keyboard: type to search, Up/Down to move the
 * highlight, Enter to choose.
 */
function FilePicker({
  repoPath,
  ext,
  onPick,
  onCreate,
  createSuffix,
}: FilePickerProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Server-side matches; `null` until the first response (the loading state).
  const [matches, setMatches] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced server-side search. Stale results stay visible until the next response
  // arrives (no null flicker per keystroke), so the list never blanks while typing.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchFiles(repoPath, query, ext)
        .then((list) => {
          if (!cancelled) setMatches(list);
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        });
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [repoPath, query, ext]);

  // Rank the backend's walk-order matches best-match first (task 415) — a filename hit
  // (especially an exact/prefix basename) sorts above a directory-only match. Recomputed
  // when either the matches or the query changes; never mutates `matches`.
  const filtered = useMemo(
    () => rankFileMatches(query, matches ?? []),
    [matches, query],
  );

  // The trimmed search text, reused both as the filter and (#151) the new file's
  // name when a create affordance is offered.
  const trimmedQuery = query.trim();
  const canCreate = !!onCreate && trimmedQuery.length > 0;
  // The filename the create action would produce — show the real name (with its
  // suffix) so the user knows what gets written; mirrors the store's own
  // normalization (don't double-append an already-present suffix).
  const suffix = createSuffix ?? "";
  const createName =
    suffix && !trimmedQuery.toLowerCase().endsWith(suffix.toLowerCase())
      ? `${trimmedQuery}${suffix}`
      : trimmedQuery;

  // Reset the highlight to the top whenever the result set or its ranking changes —
  // `query` reorders `filtered` (task 415), so the top row moves as the user types.
  useEffect(() => setActive(0), [matches, query]);

  // Keep the highlighted row scrolled into view as it moves.
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      if (filtered.length === 0) return;
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Enter picks the highlighted match; with no matches, it creates the typed
      // board (#151) so a brand-new name flows straight through from the keyboard.
      if (filtered.length > 0) {
        const f = filtered[active];
        if (f) onPick(f);
      } else if (canCreate) {
        onCreate!(trimmedQuery);
      }
    }
  };

  return (
    <div className={styles.picker} onKeyDown={onKeyDown}>
      <div className={styles.searchRow}>
        <Search
          size={14}
          strokeWidth={1.5}
          className={styles.searchIcon}
          aria-hidden
        />
        <input
          ref={inputRef}
          {...noAutoCapitalize}
          type="text"
          className={styles.search}
          placeholder={
            onCreate ? "Search or name a new board…" : "Search files…"
          }
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          aria-label={onCreate ? "Search or name a board" : "Search files"}
        />
      </div>
      {matches === null ? (
        <p className={styles.hint}>Loading…</p>
      ) : filtered.length > 0 ? (
        <div
          className={styles.list}
          ref={listRef}
          role="listbox"
          aria-label="Files"
        >
          {filtered.map((f, i) => {
            const dir = dirname(f);
            return (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`${styles.row} ${i === active ? styles.rowActive : ""}`}
                title={f}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(f)}
              >
                <span className={styles.name}>{basename(f)}</span>
                {dir && <span className={styles.dir}>{dir}</span>}
              </button>
            );
          })}
        </div>
      ) : // No list to show — but with a create candidate (#151) the create row
      // below is the answer, so suppress the otherwise-confusing empty hint.
      canCreate ? null : (
        <p className={styles.hint}>
          {trimmedQuery
            ? "No matches."
            : onCreate
              ? "No boards yet — type a name to create one."
              : "No files in this repo."}
        </p>
      )}
      {canCreate && (
        <button
          type="button"
          className={styles.create}
          onClick={() => onCreate!(trimmedQuery)}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          <span className={styles.createLabel}>Create “{createName}”</span>
        </button>
      )}
    </div>
  );
}

export default FilePicker;
