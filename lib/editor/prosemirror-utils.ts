/**
 * ProseMirror document helpers. We store notes as PM JSON in `notes.content`
 * and mirror a flattened plain-text version in `notes.content_text` so that the
 * tsvector generated column + snippet previews don't have to traverse JSON.
 */

import type { PMDoc } from '../types';

export function emptyDoc(): PMDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

interface PMNode {
  type: string;
  text?: string;
  content?: PMNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Walk a ProseMirror JSON doc and produce newline-separated plain text.
 * Keeps block boundaries, drops marks — plenty for FTS + snippet.
 */
export function docToPlainText(doc: PMDoc): string {
  const out: string[] = [];
  const walk = (node: PMNode) => {
    if (node.text) out.push(node.text);
    if (node.content) {
      for (const child of node.content) walk(child);
      // add a break after block-level nodes
      if (BLOCK_TYPES.has(node.type)) out.push('\n');
    }
  };
  walk(doc as unknown as PMNode);
  return out.join('').replace(/\n{2,}/g, '\n').trim();
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'horizontalRule',
]);

/** Produce a short snippet for the note list (first non-title prose line). */
export function snippetFromDoc(doc: PMDoc, max = 180): string {
  const text = docToPlainText(doc);
  if (!text) return '';
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return firstLine.length > max ? firstLine.slice(0, max - 1).trimEnd() + '…' : firstLine;
}

/** Does the doc contain any image nodes? */
export function docHasImage(doc: PMDoc): boolean {
  let found = false;
  const walk = (node: PMNode) => {
    if (found) return;
    if (node.type === 'image') {
      found = true;
      return;
    }
    if (node.content) for (const c of node.content) walk(c);
  };
  walk(doc as unknown as PMNode);
  return found;
}

/** Count task items in a doc: { total, done }. */
export function countTasks(doc: PMDoc): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (node: PMNode) => {
    if (node.type === 'taskItem') {
      total += 1;
      if (node.attrs?.checked === true) done += 1;
    }
    if (node.content) for (const c of node.content) walk(c);
  };
  walk(doc as unknown as PMNode);
  return { total, done };
}
