/**
 * Wiki-link helpers. Shared between the ProseMirror decoration plugin (which
 * styles `[[Title]]` runs as inline chips) and the autocomplete popup (which
 * matches the user's half-typed `[[query` against their note titles).
 *
 * The serialized representation stays as plain text — `[[Title]]` — so that
 * the server-side scanner in `extractWikiLinks` (Slice 1) continues to work
 * and Markdown export is unaffected. We never touch the document schema.
 */

import type { PMDoc } from '../types';

export interface WikiRange {
  /** Absolute ProseMirror position where `[[` starts. */
  from: number;
  /** Absolute ProseMirror position just after `]]`. */
  to: number;
  /** The inner title (trimmed). */
  title: string;
}

/**
 * Matches a single completed `[[Title]]` run. The title may contain anything
 * except newlines, `[`, or `]` (keeps the match well-formed without greedy
 * backtracking, and matches what Slice 1's server scanner accepts).
 */
export const WIKI_LINK_REGEX = /\[\[([^\[\]\n]+?)\]\]/g;

/**
 * Matches an *open* wiki-link at the end of a text run — i.e. the user has
 * typed `[[` plus some prefix and has not yet closed with `]]`. Used to
 * trigger the autocomplete popup while typing.
 */
export const WIKI_OPEN_REGEX = /\[\[([^\[\]\n]*)$/;

interface PMNodeLike {
  type: string;
  text?: string;
  content?: PMNodeLike[];
  attrs?: Record<string, unknown>;
}

/**
 * Walk a ProseMirror JSON doc and return the absolute positions of every
 * completed `[[Title]]` run. Positions are the same space that the live
 * `EditorState` uses (1-indexed through block openings).
 *
 * Pure / synchronous — used by the decoration plugin and tested independently
 * of the editor.
 */
export function findWikiLinkRanges(doc: PMDoc | PMNodeLike): WikiRange[] {
  const out: WikiRange[] = [];
  let pos = 0;

  const walk = (node: PMNodeLike) => {
    // Text node: scan for wiki-link runs.
    if (typeof node.text === 'string') {
      const text = node.text;
      WIKI_LINK_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIKI_LINK_REGEX.exec(text)) !== null) {
        const title = m[1]!.trim();
        if (title.length === 0) continue;
        out.push({
          from: pos + m.index,
          to: pos + m.index + m[0].length,
          title,
        });
      }
      pos += text.length;
      return;
    }

    // Non-text node: account for the opening token, recurse, then closing.
    // A block-ish node contributes an enter + leave (+1 each) around its
    // children; a leaf inline node (e.g. image) contributes +1.
    if (node.content && node.content.length > 0) {
      pos += 1; // open
      for (const c of node.content) walk(c);
      pos += 1; // close
    } else if (node.type !== 'doc') {
      // Leaf inline node (image, hardBreak, etc.)
      pos += 1;
    }
  };

  // The doc node itself doesn't contribute a position, but its direct
  // children do — mirrors ProseMirror's own position semantics where the
  // very first position inside the first block is 1.
  if (doc.type === 'doc' && Array.isArray((doc as PMNodeLike).content)) {
    for (const c of (doc as PMNodeLike).content!) walk(c);
  } else {
    walk(doc as PMNodeLike);
  }

  return out;
}

/**
 * Find a completed `[[Title]]` run that contains the given position (i.e.
 * the click landed somewhere inside the brackets or the title text). Returns
 * `null` if the position is not inside any wiki-link.
 */
export function wikiLinkAt(doc: PMDoc | PMNodeLike, pos: number): WikiRange | null {
  const ranges = findWikiLinkRanges(doc);
  for (const r of ranges) {
    if (pos >= r.from && pos <= r.to) return r;
  }
  return null;
}

export interface TitleCandidate {
  id: string;
  title: string;
}

/**
 * Rank note titles against a user-typed query. Case-insensitive; prefers
 * prefix matches, then word-start matches, then substring. Ties broken by
 * shorter title. Returns at most `limit` matches.
 *
 * An empty query returns the first `limit` candidates in their original
 * order (server-provided, typically updatedAt desc) — this is what the
 * popup shows the instant the user types `[[`.
 */
export function matchTitles<T extends TitleCandidate>(
  query: string,
  candidates: readonly T[],
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return candidates.slice(0, limit);

  type Scored = { c: T; score: number };
  const scored: Scored[] = [];
  for (const c of candidates) {
    const title = c.title.toLowerCase();
    if (title.length === 0) continue;
    let score: number;
    if (title.startsWith(q)) {
      score = 0;
    } else if (new RegExp(`\\b${escapeRegExp(q)}`).test(title)) {
      score = 1;
    } else if (title.includes(q)) {
      score = 2;
    } else {
      continue;
    }
    scored.push({ c, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.c.title.length - b.c.title.length;
  });

  return scored.slice(0, limit).map((s) => s.c);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
