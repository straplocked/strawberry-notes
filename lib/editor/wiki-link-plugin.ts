/**
 * ProseMirror plugin that powers Slice 1b of wiki-links:
 *
 *  1. Rebuilds a `DecorationSet` of inline decorations keyed off the
 *     `[[Title]]` regex on every doc change — completed runs render as
 *     styled chips without mutating the document schema. The serialized
 *     text remains `[[Title]]` so Slice 1's server-side scanner + Markdown
 *     export continue to work unchanged.
 *
 *  2. Detects when the caret sits immediately after `[[<partial>` in a text
 *     context and fires `onTriggerChange` with the query string + screen
 *     coordinates (or `null` when the trigger is gone). The React host uses
 *     this to position and populate the autocomplete popup.
 *
 *  3. Intercepts clicks on a decorated wiki-link chip and calls
 *     `onLinkClick(title)` — the React host resolves the title to a note
 *     id and updates `useUIStore.activeNoteId`.
 *
 * Extension surface is deliberately minimal: one plugin, three callbacks.
 */

import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Extension } from '@tiptap/react';
import {
  WIKI_LINK_REGEX,
  WIKI_OPEN_REGEX,
  findWikiLinkRanges,
} from './wiki-link';

export interface WikiLinkTriggerState {
  /** Text after the `[[`, possibly empty. */
  query: string;
  /** Absolute position of the first `[` — where a selected title will be spliced in. */
  from: number;
  /** Absolute position of the caret — end of the partial query. */
  to: number;
  /** Screen coordinates of the caret, for popup positioning. */
  coords: { left: number; top: number; bottom: number };
}

export interface WikiLinkPluginOptions {
  /** Fires when the trigger state changes (open/close/query change). */
  onTriggerChange: (trigger: WikiLinkTriggerState | null) => void;
  /** Fires when a rendered wiki-link chip is clicked. */
  onLinkClick: (title: string) => void;
}

export const wikiLinkPluginKey = new PluginKey<DecorationSet>('wikiLink');

/**
 * Build a `DecorationSet` of chip decorations for every `[[Title]]` run in
 * the document. Lives outside the plugin so the logic can be tested
 * independently of ProseMirror state.
 */
export function buildWikiLinkDecorations(
  doc: EditorState['doc'],
): DecorationSet {
  const ranges = findWikiLinkRanges(doc.toJSON() as Parameters<typeof findWikiLinkRanges>[0]);
  if (ranges.length === 0) return DecorationSet.empty;
  const decos = ranges.map((r) =>
    Decoration.inline(
      r.from,
      r.to,
      {
        class: 'sn-wiki-link',
        'data-wiki-title': r.title,
      },
    ),
  );
  return DecorationSet.create(doc, decos);
}

/**
 * Inspect the current selection. If the caret sits inside a text node and
 * the portion of that node immediately before the caret matches
 * `[[<partial>`, return the trigger state so the popup can show.
 */
function computeTrigger(
  state: EditorState,
  view: { coordsAtPos: (pos: number) => { left: number; top: number; bottom: number } },
): WikiLinkTriggerState | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;

  // Only consider positions inside a text-container block.
  if (!$from.parent.isTextblock) return null;

  // Text of the current block up to the caret, relative to the block start.
  const blockStart = $from.start();
  const caret = $from.pos;
  const before = state.doc.textBetween(blockStart, caret, '\n', '\0');

  const m = before.match(WIKI_OPEN_REGEX);
  if (!m) return null;

  // Guard: if the user typed `]]` *after* the `[[`, the substring would
  // have included `]` and the regex would have bailed. Still, double-check
  // that we're not inside a completed run (e.g. caret placed by click
  // between the brackets of `[[Foo]]`).
  const partial = m[1] ?? '';
  const from = caret - m[0].length;
  if (from < 0) return null;

  // If the char immediately before the opening `[[` is itself `[`, the user
  // is mid-`[[[`-like sequence — treat as a literal, not a trigger.
  if (from > blockStart && before[from - blockStart - 1] === '[') return null;

  // Popup position is pinned to the `[[` so it doesn't jump as the query grows.
  const coords = view.coordsAtPos(from);
  return { query: partial, from, to: caret, coords };
}

/**
 * Create the raw ProseMirror plugin. Exported so tests can construct it
 * without going through TipTap's Extension wrapper.
 */
export function createWikiLinkPlugin(options: WikiLinkPluginOptions): Plugin<DecorationSet> {
  let lastTriggerKey = '__init__';
  const emit = (next: WikiLinkTriggerState | null) => {
    const key = next ? `${next.from}:${next.to}:${next.query}` : 'null';
    if (key === lastTriggerKey) return;
    lastTriggerKey = key;
    options.onTriggerChange(next);
  };

  return new Plugin<DecorationSet>({
    key: wikiLinkPluginKey,
    state: {
      init(_config, state) {
        return buildWikiLinkDecorations(state.doc);
      },
      apply(tr: Transaction, old: DecorationSet) {
        if (tr.docChanged) {
          return buildWikiLinkDecorations(tr.doc);
        }
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return wikiLinkPluginKey.getState(state) ?? null;
      },
      handleClick(_view, _pos, event) {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        const chip = target.closest('.sn-wiki-link') as HTMLElement | null;
        if (!chip) return false;
        const title = chip.getAttribute('data-wiki-title');
        if (!title) return false;
        // Any click on a wiki-link chip navigates to the linked note. The
        // chip text (`[[Title]]`) is still editable — the user just has to
        // place the caret via keyboard or click *outside* the chip first.
        event.preventDefault();
        options.onLinkClick(title);
        return true;
      },
    },
    view(editorView) {
      emit(computeTrigger(editorView.state, editorView));
      return {
        update(view, prev) {
          if (view.state.doc === prev.doc && view.state.selection.eq(prev.selection)) {
            return;
          }
          emit(computeTrigger(view.state, view));
        },
        destroy() {
          emit(null);
        },
      };
    },
  });
}

/**
 * TipTap extension wrapper. Consumes the raw plugin so the editor only needs
 * to add `WikiLinkExtension.configure({ ... })` to its extensions array.
 */
export const WikiLinkExtension = Extension.create<WikiLinkPluginOptions>({
  name: 'wikiLink',

  addOptions() {
    return {
      onTriggerChange: () => {},
      onLinkClick: () => {},
    };
  },

  addProseMirrorPlugins() {
    return [
      createWikiLinkPlugin({
        onTriggerChange: (t) => this.options.onTriggerChange(t),
        onLinkClick: (title) => this.options.onLinkClick(title),
      }),
    ];
  },
});

// Re-export for test/editor convenience.
export { WIKI_LINK_REGEX };
