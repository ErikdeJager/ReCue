// Canvas-template block registry (#117). A **single source of truth** for the
// placeable block kinds, mirroring #82's "one registry drives every addable view
// type": adding a new Canvas content kind later means adding **one** entry here and
// it becomes available as a template block (palette chip, editor placeholder, and —
// in #118 — instantiation) with no edits scattered across the editor. Kept
// dependency-light (the icon is a Lucide component) and the pure helpers are
// unit-testable.

import {
  Bot,
  FileDiff,
  FileText,
  FolderTree,
  type LucideIcon,
  SquareKanban,
  TerminalSquare,
} from "lucide-react";

import type { CanvasContent } from "../../types";

/** The block kinds a template leaf can hold (#117). Distinct from the live Canvas
 * content kinds (`agent` / `terminal` / `file` / `diff` / `scheduled`) they
 * instantiate into (#118). */
export type BlockKind =
  | "new-agent"
  | "new-terminal"
  | "open-file"
  | "open-diff"
  | "open-kanban"
  | "open-filetree";

/** How a block is configured in the editor: a `new-agent` prompt textarea, an
 * `open-file` relative-path input, or nothing. */
export type BlockConfig = "prompt" | "file" | "none";

/** One placeable block in the registry (#117). */
export interface BlockDescriptor {
  kind: BlockKind;
  /** Palette label, e.g. "Start session". */
  label: string;
  /** Lucide icon component (on-system, like the rest of the icon set). */
  icon: LucideIcon;
  /** What inline config the editor shows for this block. */
  config: BlockConfig;
  /** The live `CanvasContent.kind` this block becomes when instantiated (#118). */
  liveKind: string;
}

/**
 * The v1 block registry (#117). To add a block for a future Canvas content kind,
 * append one entry here — the palette, the editor placeholder, and the (#118)
 * instantiation all read from this list.
 */
export const BLOCK_REGISTRY: BlockDescriptor[] = [
  {
    kind: "new-agent",
    label: "Start session",
    icon: Bot,
    config: "prompt",
    liveKind: "agent",
  },
  {
    kind: "new-terminal",
    label: "Open terminal",
    icon: TerminalSquare,
    config: "none",
    liveKind: "terminal",
  },
  {
    kind: "open-file",
    label: "Open file",
    icon: FileText,
    config: "file",
    liveKind: "file",
  },
  {
    kind: "open-diff",
    label: "Open diff",
    icon: FileDiff,
    config: "none",
    liveKind: "diff",
  },
  {
    kind: "open-kanban",
    label: "Open Kanban board",
    icon: SquareKanban,
    config: "file",
    liveKind: "kanban",
  },
  {
    kind: "open-filetree",
    label: "Open file tree",
    icon: FolderTree,
    config: "none",
    liveKind: "filetree",
  },
];

/** The set of block kinds, for quick membership checks. */
const BLOCK_KINDS = new Set<string>(BLOCK_REGISTRY.map((b) => b.kind));

/** The descriptor for a block `kind`, or undefined for a non-block kind. */
export function blockDescriptor(kind: string): BlockDescriptor | undefined {
  return BLOCK_REGISTRY.find((b) => b.kind === kind);
}

/** Whether a leaf's content is a template **block** (vs live content). */
export function isBlockContent(content: CanvasContent): boolean {
  return BLOCK_KINDS.has(content.kind);
}

/**
 * The inert placeholder label shown for a block in the editor, e.g.
 * "Start session", "Open file: README.md", "Start session: <prompt…>".
 * Unknown kinds fall back to the raw kind so the editor never renders blank.
 */
export function blockPlaceholderLabel(content: CanvasContent): string {
  const desc = blockDescriptor(content.kind);
  if (!desc) return content.kind;
  if (desc.config === "file") {
    const f = content.file?.trim();
    return f ? `${desc.label}: ${f}` : desc.label;
  }
  if (desc.config === "prompt") {
    // A custom agent name (#136) takes precedence in the placeholder, so the editor
    // surface shows the chosen name; otherwise fall back to the prompt snippet.
    const name = content.name?.trim();
    if (name) return `${desc.label}: ${name}`;
    const p = content.prompt?.trim();
    if (!p) return desc.label;
    const short = p.length > 40 ? `${p.slice(0, 40)}…` : p;
    return `${desc.label}: ${short}`;
  }
  return desc.label;
}

/** A fresh block content descriptor for a newly placed palette block (#117). */
export function newBlockContent(kind: BlockKind): CanvasContent {
  return { kind };
}
