import { describe, expect, it } from 'vitest';
import { injectOptimisticTags, resortUnlessSearch } from './hooks';
import type { NoteListItemDTO, TagDTO } from '../types';

const seed: TagDTO[] = [
  { id: 't-recipes', name: 'recipes', count: 4 },
  { id: 't-work', name: 'work', count: 7 },
];

describe('injectOptimisticTags', () => {
  it('returns null when every name is already in the cache', () => {
    expect(injectOptimisticTags(seed, ['recipes'])).toBeNull();
    expect(injectOptimisticTags(seed, ['recipes', 'work'])).toBeNull();
  });

  it('appends a new tag with a tmp id and count=1', () => {
    const out = injectOptimisticTags(seed, ['recipes', 'launch']);
    expect(out).not.toBeNull();
    expect(out!).toHaveLength(seed.length + 1);
    const fresh = out!.find((t) => t.name === 'launch')!;
    expect(fresh).toEqual({ id: 'tmp-tag-launch', name: 'launch', count: 1 });
    // Existing entries are preserved verbatim (no count math here — the
    // onSuccess invalidate refetches authoritative counts).
    expect(out!.find((t) => t.name === 'recipes')).toEqual(seed[0]);
    expect(out!.find((t) => t.name === 'work')).toEqual(seed[1]);
  });

  it('normalises names (trim + lowercase + 40-char cap) before comparing', () => {
    const out = injectOptimisticTags(seed, ['  RECIPES  ', '  Launch  ']);
    expect(out).not.toBeNull();
    // RECIPES collides with the existing 'recipes' so isn't added; Launch is fresh.
    expect(out!).toHaveLength(seed.length + 1);
    expect(out!.find((t) => t.name === 'launch')).toBeTruthy();
    expect(out!.find((t) => t.name === 'RECIPES')).toBeUndefined();
  });

  it('drops empty / overlong names', () => {
    const out = injectOptimisticTags(seed, ['', '   ', 'a'.repeat(41), 'okay']);
    expect(out).not.toBeNull();
    // Only 'okay' should be added.
    expect(out!).toHaveLength(seed.length + 1);
    expect(out!.find((t) => t.name === 'okay')).toBeTruthy();
  });

  it('de-dupes within the patch itself', () => {
    const out = injectOptimisticTags(seed, ['novel', 'novel', 'novel']);
    expect(out).not.toBeNull();
    expect(out!).toHaveLength(seed.length + 1);
  });

  it('handles the empty-cache case (fresh user)', () => {
    const out = injectOptimisticTags([], ['first']);
    expect(out).toEqual([{ id: 'tmp-tag-first', name: 'first', count: 1 }]);
  });
});

describe('resortUnlessSearch', () => {
  const item = (id: string, updatedAt: string, pinned = false): NoteListItemDTO => ({
    id,
    folderId: null,
    title: id,
    snippet: '',
    pinned,
    updatedAt,
    tagIds: [],
    hasImage: false,
    private: false,
  });
  // Relevance order from the server: the best match was edited longest ago,
  // and the note just patched (c) now has the newest updatedAt.
  const ranked = [
    item('a', '2026-01-01T00:00:00Z'),
    item('b', '2026-02-01T00:00:00Z'),
    item('c', '2026-10-09T00:00:00Z'),
  ];

  it('keeps relevance order for a search list', () => {
    expect(resortUnlessSearch(ranked, 'sourdough').map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('re-sorts a plain list by pinned, then updatedAt', () => {
    const list = [...ranked, item('p', '2025-01-01T00:00:00Z', true)];
    expect(resortUnlessSearch(list, '').map((n) => n.id)).toEqual(['p', 'c', 'b', 'a']);
  });
});
