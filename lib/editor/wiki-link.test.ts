import { describe, expect, it } from 'vitest';
import {
  WIKI_LINK_REGEX,
  WIKI_OPEN_REGEX,
  findWikiLinkRanges,
  matchTitles,
  wikiLinkAt,
} from './wiki-link';
import type { PMDoc } from '../types';

function doc(...blocks: unknown[]): PMDoc {
  return { type: 'doc', content: blocks } as unknown as PMDoc;
}
function para(...inlines: unknown[]) {
  return { type: 'paragraph', content: inlines };
}
function text(t: string) {
  return { type: 'text', text: t };
}

describe('WIKI_LINK_REGEX', () => {
  it('matches a simple wiki-link', () => {
    WIKI_LINK_REGEX.lastIndex = 0;
    const m = WIKI_LINK_REGEX.exec('hello [[World]]!');
    expect(m?.[1]).toBe('World');
  });

  it('matches multi-word titles', () => {
    WIKI_LINK_REGEX.lastIndex = 0;
    const m = WIKI_LINK_REGEX.exec('see [[Project Alpha]] for more');
    expect(m?.[1]).toBe('Project Alpha');
  });

  it('does not cross newlines', () => {
    WIKI_LINK_REGEX.lastIndex = 0;
    const m = WIKI_LINK_REGEX.exec('[[Foo\nBar]]');
    expect(m).toBeNull();
  });

  it('does not match nested brackets', () => {
    WIKI_LINK_REGEX.lastIndex = 0;
    // Regex class excludes `[` and `]` in the middle; won't match across nested.
    const all = 'foo [[Outer [Inner] Outer]] bar'.matchAll(WIKI_LINK_REGEX);
    const titles = [...all].map((m) => m[1]);
    // We should not capture anything that contains brackets.
    expect(titles.every((t) => !t.includes('['))).toBe(true);
  });
});

describe('WIKI_OPEN_REGEX', () => {
  it('matches an unclosed [[ at end of string', () => {
    const m = 'hello [[proj'.match(WIKI_OPEN_REGEX);
    expect(m?.[1]).toBe('proj');
  });

  it('matches the instant after the user types [[', () => {
    const m = '[['.match(WIKI_OPEN_REGEX);
    expect(m?.[1]).toBe('');
  });

  it('does not match if the user closed the brackets', () => {
    const m = 'hello [[proj]]'.match(WIKI_OPEN_REGEX);
    expect(m).toBeNull();
  });

  it('does not match across a nested [', () => {
    const m = 'hello [[pro[ject'.match(WIKI_OPEN_REGEX);
    expect(m).toBeNull();
  });
});

describe('findWikiLinkRanges', () => {
  it('returns an empty list when there are no wiki-links', () => {
    const d = doc(para(text('hello world')));
    expect(findWikiLinkRanges(d)).toEqual([]);
  });

  it('locates a wiki-link at the start of a paragraph', () => {
    const d = doc(para(text('[[Foo]]')));
    const ranges = findWikiLinkRanges(d);
    expect(ranges).toEqual([{ from: 1, to: 8, title: 'Foo' }]);
  });

  it('locates a wiki-link after other text in a paragraph', () => {
    const d = doc(para(text('see [[Bar]] now')));
    const ranges = findWikiLinkRanges(d);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 5, to: 12, title: 'Bar' });
  });

  it('locates multiple wiki-links in the same paragraph', () => {
    const d = doc(para(text('[[A]] and [[B]]')));
    const ranges = findWikiLinkRanges(d);
    expect(ranges).toEqual([
      { from: 1, to: 6, title: 'A' },
      { from: 11, to: 16, title: 'B' },
    ]);
  });

  it('locates wiki-links across multiple paragraphs', () => {
    const d = doc(
      para(text('[[First]]')),
      para(text('then [[Second]]')),
    );
    const ranges = findWikiLinkRanges(d);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].title).toBe('First');
    expect(ranges[1].title).toBe('Second');
    // second paragraph starts at pos = 1 + len('[[First]]') + 1 /*close*/ + 1 /*open*/ = 12
    // "then " is 5 chars, then "[[Second]]" starts at 12 + 5 = 17
    expect(ranges[1]).toEqual({ from: 17, to: 27, title: 'Second' });
  });

  it('ignores empty titles', () => {
    const d = doc(para(text('[[]] or [[   ]]')));
    expect(findWikiLinkRanges(d)).toEqual([]);
  });

  it('trims whitespace from the title', () => {
    const d = doc(para(text('[[  Trimmed  ]]')));
    const ranges = findWikiLinkRanges(d);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].title).toBe('Trimmed');
  });
});

describe('wikiLinkAt', () => {
  const d = doc(para(text('see [[Bar]] now')));
  // wiki-link occupies positions 5..12.

  it('returns the link when the position is inside the title', () => {
    const r = wikiLinkAt(d, 7);
    expect(r?.title).toBe('Bar');
  });

  it('returns the link when the position is on an opening bracket', () => {
    expect(wikiLinkAt(d, 5)?.title).toBe('Bar');
  });

  it('returns null when the position is outside any link', () => {
    expect(wikiLinkAt(d, 2)).toBeNull();
    expect(wikiLinkAt(d, 14)).toBeNull();
  });
});

describe('matchTitles', () => {
  const titles = [
    { id: '1', title: 'Apple Pie' },
    { id: '2', title: 'Blueberry Crumble' },
    { id: '3', title: 'Pineapple Upside Down' },
    { id: '4', title: 'Pie Dough' },
    { id: '5', title: 'Cherry Pie Recipe' },
  ];

  it('returns the first N candidates on an empty query', () => {
    const out = matchTitles('', titles, 3);
    expect(out.map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('prefers prefix matches over substring matches', () => {
    const out = matchTitles('pie', titles);
    expect(out[0].id).toBe('4'); // "Pie Dough" — prefix match, shortest.
  });

  it('ranks word-boundary matches ahead of arbitrary substrings', () => {
    const withSubstring = [
      ...titles,
      // Title whose only match for "pie" is mid-word, no word-boundary hit.
      { id: '6', title: 'Magpies' },
    ];
    // Query "pie" hits: prefix of "Pie Dough" (score 0),
    // word-start in "Apple Pie", "Cherry Pie Recipe" (score 1),
    // substring-only in "Magpies" (score 2).
    const out = matchTitles('pie', withSubstring);
    const ids = out.map((c) => c.id);
    expect(ids[0]).toBe('4');
    expect(ids.indexOf('1')).toBeLessThan(ids.indexOf('6'));
    expect(ids.indexOf('5')).toBeLessThan(ids.indexOf('6'));
  });

  it('is case-insensitive', () => {
    const out = matchTitles('APPLE', titles);
    expect(out.map((c) => c.id)).toContain('1');
    expect(out.map((c) => c.id)).toContain('3');
  });

  it('excludes titles that do not match at all', () => {
    const out = matchTitles('xyz', titles);
    expect(out).toEqual([]);
  });

  it('respects the limit', () => {
    const out = matchTitles('p', titles, 2);
    expect(out).toHaveLength(2);
  });

  it('handles regex-special characters in the query without throwing', () => {
    expect(() => matchTitles('a.b*c', titles)).not.toThrow();
    expect(matchTitles('(', titles)).toEqual([]);
  });
});
