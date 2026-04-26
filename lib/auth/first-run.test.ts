import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface InsertCall {
  values: Record<string, unknown>;
}

const state = {
  inserts: [] as InsertCall[],
  // Sequential ids for `.returning({id})`. seedFirstRunContent issues two
  // inserts (folder, note); we hand out 'folder-1' then 'note-1'.
  ids: ['folder-1', 'note-1'] as string[],
  cursor: 0,
};

function reset() {
  state.inserts = [];
  state.cursor = 0;
}

vi.mock('../db/client', () => ({
  db: {
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        state.inserts.push({ values: vals });
        return {
          returning: () => {
            const id = state.ids[state.cursor++ % state.ids.length];
            return Promise.resolve([{ id }]);
          },
        };
      },
    }),
  },
}));

import { seedFirstRunContent } from './first-run';

beforeEach(() => {
  reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seedFirstRunContent', () => {
  it('inserts the Journal folder and the Welcome note in that order', async () => {
    const result = await seedFirstRunContent('user-id-1');
    expect(result).toEqual({ folderId: 'folder-1', noteId: 'note-1' });
    expect(state.inserts).toHaveLength(2);

    expect(state.inserts[0].values).toMatchObject({
      userId: 'user-id-1',
      name: 'Journal',
      color: '#e33d4e',
      position: 0,
    });

    expect(state.inserts[1].values).toMatchObject({
      userId: 'user-id-1',
      folderId: 'folder-1',
      title: 'Welcome to Strawberry Notes',
      embeddingStale: true,
    });

    // The note has the wiki-link prompt and Today reference in its plain text.
    const contentText = String(state.inserts[1].values.contentText ?? '');
    expect(contentText).toContain('Welcome to Strawberry Notes');
    expect(contentText).toContain('Today');
  });
});
