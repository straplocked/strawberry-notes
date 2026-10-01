/**
 * Minimal ProseMirror JSON → Markdown serializer.
 * Covers the node set Strawberry Notes uses: paragraph, heading, bulletList,
 * orderedList, taskList, taskItem, blockquote, codeBlock, horizontalRule,
 * image, hardBreak, table, plus text marks (bold, italic, strike, code).
 */

import type { PMDoc } from '../types';

interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

type CellAlign = 'left' | 'center' | 'right';

/**
 * GFM pipe tables can't carry a literal newline inside a cell — a cell that
 * spans more than one block (the user pressed Enter inside a table cell) is
 * joined with `<br>` instead. Mirrors the convention most Markdown renderers
 * (GitHub included) already treat as a soft line break inside a table cell.
 */
const CELL_LINE_BREAK = '<br>';

export function docToMarkdown(doc: PMDoc): string {
  const node = doc as unknown as PMNode;
  return renderBlocks(node.content ?? []).trim() + '\n';
}

function renderBlocks(nodes: PMNode[], listDepth = 0): string {
  return nodes.map((n) => renderBlock(n, listDepth)).join('\n\n');
}

function renderBlock(n: PMNode, depth: number): string {
  switch (n.type) {
    case 'paragraph':
      return renderInline(n.content ?? []);
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(n.attrs?.level ?? 2)));
      return `${'#'.repeat(level)} ${renderInline(n.content ?? [])}`;
    }
    case 'blockquote':
      return renderBlocks(n.content ?? [], depth)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'bulletList':
      return (n.content ?? [])
        .map((li) => renderListItem(li, depth, '-'))
        .join('\n');
    case 'orderedList':
      return (n.content ?? [])
        .map((li, i) => renderListItem(li, depth, `${i + 1}.`))
        .join('\n');
    case 'taskList':
      return (n.content ?? [])
        .map((li) => renderTaskItem(li, depth))
        .join('\n');
    case 'codeBlock': {
      const lang = (n.attrs?.language as string) ?? '';
      const body = (n.content ?? []).map((c) => c.text ?? '').join('');
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = (n.attrs?.src as string) ?? '';
      const alt = (n.attrs?.alt as string) ?? '';
      return `![${alt}](${src})`;
    }
    case 'table':
      return renderTable(n);
    default:
      return renderInline(n.content ?? []);
  }
}

/**
 * Render a `table` node (rows of `tableHeader`/`tableCell`) as a GFM pipe
 * table: a header row, an alignment row, then one row per remaining
 * `tableRow`. The first row is always treated as the header line — that's
 * the only shape GFM syntax can express, and it's what `insertTable()` and
 * a Markdown import both produce.
 */
function renderTable(n: PMNode): string {
  const rows = n.content ?? [];
  if (rows.length === 0) return '';

  const rendered = rows.map((row) =>
    (row.content ?? []).map((cell) => ({
      text: renderTableCellText(cell),
      align: normalizeAlign(cell.attrs?.align),
    })),
  );

  const columnCount = rendered.reduce((max, r) => Math.max(max, r.length), 0);
  if (columnCount === 0) return '';

  // A column's alignment is whatever the first cell in that column declares
  // (GFM alignment is per-column, not per-cell, even though the extension
  // stores the attribute on each cell).
  const colAlign: (CellAlign | null)[] = Array.from({ length: columnCount }, () => null);
  for (const row of rendered) {
    for (let i = 0; i < columnCount; i++) {
      if (!colAlign[i] && row[i]?.align) colAlign[i] = row[i].align;
    }
  }

  const textAt = (row: { text: string; align: CellAlign | null }[], i: number): string =>
    row[i]?.text ?? '';

  const lines: string[] = [];
  lines.push(
    `| ${Array.from({ length: columnCount }, (_, i) => textAt(rendered[0], i)).join(' | ')} |`,
  );
  lines.push(`| ${colAlign.map(alignMarker).join(' | ')} |`);
  for (const row of rendered.slice(1)) {
    lines.push(`| ${Array.from({ length: columnCount }, (_, i) => textAt(row, i)).join(' | ')} |`);
  }
  return lines.join('\n');
}

function normalizeAlign(value: unknown): CellAlign | null {
  return value === 'left' || value === 'right' || value === 'center' ? value : null;
}

function alignMarker(align: CellAlign | null): string {
  if (align === 'left') return ':--';
  if (align === 'right') return '--:';
  if (align === 'center') return ':-:';
  return '---';
}

/** Render one `tableCell` / `tableHeader`'s body, escaped for a pipe-table line. */
function renderTableCellText(cell: PMNode): string {
  const raw = renderCellBlocks(cell.content ?? []);
  // Safety net: a literal newline would break the pipe-table line. In
  // practice this can only happen via `CELL_LINE_BREAK` joins below, but a
  // stray '\n' from a hand-built doc (e.g. a programmatic MCP write) is
  // folded in rather than corrupting the row.
  const singleLine = raw.replace(/\r\n|\r|\n/g, CELL_LINE_BREAK);
  return escapeTableCellPipes(singleLine);
}

/**
 * A cell's content is `block+` — usually one paragraph, but Enter inside a
 * cell produces a second one. Join multiple blocks with `<br>` since a pipe
 * table row can't span physical lines.
 */
function renderCellBlocks(blocks: PMNode[]): string {
  if (blocks.length === 0) return '';
  return blocks.map(renderCellBlock).join(CELL_LINE_BREAK);
}

function renderCellBlock(n: PMNode): string {
  // Non-paragraph block content inside a cell (rare — the toolbar only ever
  // inserts paragraphs) still needs flattening instead of crashing, so this
  // doesn't switch on `n.type` the way `renderBlock` does.
  return renderCellInline(n.content ?? []);
}

function renderCellInline(nodes: PMNode[]): string {
  return nodes.map(renderCellInlineNode).join('');
}

function renderCellInlineNode(n: PMNode): string {
  // Same mark/image/link handling as prose text, except a hard break can't
  // be a literal newline inside a table cell.
  if (n.type === 'hardBreak') return CELL_LINE_BREAK;
  return renderInlineNode(n);
}

/**
 * Escape bare `|` characters so the Markdown table parser doesn't read them
 * as extra column delimiters. A pipe that's already backslash-escaped (or
 * any other backslash-escaped character) is left untouched.
 */
function escapeTableCellPipes(text: string): string {
  return text.replace(/\\.|\|/g, (m) => (m === '|' ? '\\|' : m));
}

function renderListItem(node: PMNode, depth: number, marker: string): string {
  const indent = '  '.repeat(depth);
  const body = renderBlocks(node.content ?? [], depth + 1);
  const [first, ...rest] = body.split('\n');
  const head = `${indent}${marker} ${first}`;
  if (rest.length === 0) return head;
  return [head, ...rest.map((l) => `${indent}  ${l}`)].join('\n');
}

function renderTaskItem(node: PMNode, depth: number): string {
  const checked = node.attrs?.checked === true ? 'x' : ' ';
  const indent = '  '.repeat(depth);
  const body = renderBlocks(node.content ?? [], depth + 1);
  const [first, ...rest] = body.split('\n');
  const head = `${indent}- [${checked}] ${first}`;
  if (rest.length === 0) return head;
  return [head, ...rest.map((l) => `${indent}  ${l}`)].join('\n');
}

function renderInline(nodes: PMNode[]): string {
  return nodes.map(renderInlineNode).join('');
}

function renderInlineNode(n: PMNode): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') {
    const src = (n.attrs?.src as string) ?? '';
    const alt = (n.attrs?.alt as string) ?? '';
    return `![${alt}](${src})`;
  }
  const text = n.text ?? renderInline(n.content ?? []);
  let out = text;
  const marks = n.marks ?? [];
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has('code')) out = `\`${out}\``;
  if (has('bold') && has('italic')) out = `***${out}***`;
  else if (has('bold')) out = `**${out}**`;
  else if (has('italic')) out = `*${out}*`;
  if (has('strike')) out = `~~${out}~~`;
  const linkMark = marks.find((m) => m.type === 'link');
  if (linkMark) {
    const href = (linkMark.attrs?.href as string) ?? '';
    out = `[${out}](${href})`;
  }
  return out;
}
