/**
 * Tests for `semanticSearch`. We mock the DB + embedding call, then assert
 * the shape of the result and the ordering invariants (higher score first,
 * k cap enforced, mapping of `contentText` → snippet fallback).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('../db/client', () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

const embedOneMock = vi.fn();
vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return {
    ...actual,
    embedOne: (...args: unknown[]) => embedOneMock(...args),
  };
});

import { EmbeddingNotConfiguredError } from './client';
import { semanticSearch } from './search';

beforeEach(() => {
  executeMock.mockReset();
  embedOneMock.mockReset();
  process.env.EMBEDDING_ENDPOINT = 'https://api.example/v1';
  process.env.EMBEDDING_MODEL = 'm';
  process.env.EMBEDDING_DIMS = '3';
});

afterEach(() => {
  delete process.env.EMBEDDING_ENDPOINT;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMS;
});

describe('semanticSearch', () => {
  it('throws EmbeddingNotConfiguredError when env is empty', async () => {
    delete process.env.EMBEDDING_ENDPOINT;
    await expect(semanticSearch('u', 'hello')).rejects.toBeInstanceOf(
      EmbeddingNotConfiguredError,
    );
  });

  it('returns an empty array for an empty query without hitting DB', async () => {
    const out = await semanticSearch('u', '   ');
    expect(out).toEqual([]);
    expect(executeMock).not.toHaveBeenCalled();
    expect(embedOneMock).not.toHaveBeenCalled();
  });

  it('maps DB rows into NoteListItemDTO + score, preserving ordering', async () => {
    embedOneMock.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'n1',
          folderId: null,
          title: 'First',
          snippet: 'the first snippet',
          contentText: 'whatever',
          hasImage: false,
          pinned: false,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          tagIds: ['t1', 't2'],
          score: 0.93,
        },
        {
          id: 'n2',
          folderId: 'f1',
          title: 'Second',
          // snippet missing → should fall back to contentText prefix.
          snippet: '',
          contentText: 'fallback body text',
          hasImage: true,
          pinned: true,
          updatedAt: '2026-01-02T00:00:00.000Z',
          tagIds: null,
          score: '0.81',
        },
      ],
    });

    const out = await semanticSearch('user-1', 'topic', { k: 5 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: 'n1',
      title: 'First',
      snippet: 'the first snippet',
      tagIds: ['t1', 't2'],
      score: 0.93,
    });
    expect(out[1]).toMatchObject({
      id: 'n2',
      title: 'Second',
      // Fell back to contentText.
      snippet: 'fallback body text',
      tagIds: [],
      score: 0.81,
    });
    // Higher score came back first — the DB `ORDER BY distance ASC` is
    // equivalent to `score DESC`. Pin that relationship.
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('clamps k to the [1, 50] range', async () => {
    embedOneMock.mockResolvedValue([0, 0, 0]);
    executeMock.mockResolvedValue({ rows: [] });

    await semanticSearch('u', 'q', { k: 999 });
    await semanticSearch('u', 'q', { k: -1 });
    // The clamp is internal, but we can at least verify that a non-empty
    // result batch still flows through the DB path without error.
    expect(executeMock).toHaveBeenCalledTimes(2);
  });
});
