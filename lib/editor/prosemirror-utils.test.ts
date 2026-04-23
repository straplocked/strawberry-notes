import { describe, expect, it } from 'vitest';
import {
  countTasks,
  docHasImage,
  docToPlainText,
  extractWikiLinks,
  snippetFromDoc,
} from './prosemirror-utils';
import type { PMDoc } from '../types';

const sample: PMDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Crust' }] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'flour' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'butter' }] }],
        },
      ],
    },
    { type: 'image', attrs: { src: '/x.png', alt: 'x' } },
  ],
} as unknown as PMDoc;

describe('prosemirror utils', () => {
  it('flattens to text preserving order', () => {
    const t = docToPlainText(sample);
    expect(t).toContain('Crust');
    expect(t).toContain('flour');
    expect(t).toContain('butter');
  });

  it('picks the first line for snippet', () => {
    const s = snippetFromDoc(sample);
    expect(s).toBe('Crust');
  });

  it('detects images', () => {
    expect(docHasImage(sample)).toBe(true);
  });

  it('counts tasks', () => {
    expect(countTasks(sample)).toEqual({ total: 2, done: 1 });
  });
});

describe('extractWikiLinks', () => {
  const docWith = (text: string): PMDoc =>
    ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }) as unknown as PMDoc;

  it('picks out basic [[Title]] tokens lowercased and deduped', () => {
    const links = extractWikiLinks(docWith('see [[Recipes]] and [[recipes]] and [[Meal Plans]]'));
    expect(links.sort()).toEqual(['meal plans', 'recipes']);
  });

  it('ignores escaped openers', () => {
    expect(extractWikiLinks(docWith('literal \\[[not a link]]'))).toEqual([]);
  });

  it('ignores newlines inside brackets', () => {
    expect(extractWikiLinks(docWith('[[broken\nlink]]'))).toEqual([]);
  });

  it('ignores empty brackets', () => {
    expect(extractWikiLinks(docWith('[[]] [[   ]]'))).toEqual([]);
  });

  it('walks nested content', () => {
    const doc: PMDoc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'see [[Deep Note]]' }],
            },
          ],
        },
      ],
    } as unknown as PMDoc;
    expect(extractWikiLinks(doc)).toEqual(['deep note']);
  });

  it('finds links across sibling text nodes without regex state bleed', () => {
    // Regression: a stateful `/g` regex hoisted out of the walker would reuse
    // `lastIndex` across siblings and miss the second link.
    const doc: PMDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'see [[First]]' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'see [[Second]]' }] },
      ],
    } as unknown as PMDoc;
    expect(extractWikiLinks(doc).sort()).toEqual(['first', 'second']);
  });
});
