import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { selectMock, deliverOnceSpy } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  deliverOnceSpy: vi.fn(),
}));

vi.mock('../db/client', () => {
  const buildSelect = () => ({
    from: () => ({
      where: () => Promise.resolve(selectMock()),
    }),
  });
  return {
    db: {
      select: () => buildSelect(),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    },
  };
});

vi.mock('./delivery', () => ({ deliverOnce: deliverOnceSpy }));

import {
  fireNoteCreated,
  fireNoteUpdated,
  fireNoteTagged,
  fireNoteTrashed,
  fireNoteLinked,
  __flushUpdateForTests,
  __resetWebhooksForTests,
  __TEST,
} from './fire';

const stubNote = {
  id: 'note-1',
  title: 'Hi',
  folderId: null,
  pinned: false,
  tagIds: [],
  updatedAt: '2026-04-29T00:00:00.000Z',
};

beforeEach(() => {
  selectMock.mockReset();
  deliverOnceSpy.mockReset();
  deliverOnceSpy.mockResolvedValue({ ok: true });
  __resetWebhooksForTests();
});

afterEach(() => {
  __resetWebhooksForTests();
});

describe('fan-out', () => {
  it('delivers one event to each subscribed webhook', async () => {
    selectMock.mockReturnValueOnce([
      { id: 'wh-1', url: 'https://a.example.com', secretHash: 'hash-a' },
      { id: 'wh-2', url: 'https://b.example.com', secretHash: 'hash-b' },
    ]);
    fireNoteCreated('user-1', stubNote);
    // Allow the microtask queue to drain so deliverAll's awaited DB call resolves.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(deliverOnceSpy).toHaveBeenCalledTimes(2);
    const events = deliverOnceSpy.mock.calls.map((c) => c[1]);
    expect(events.every((e) => e === 'note.created')).toBe(true);
  });

  it('sends nothing when no webhooks are subscribed', async () => {
    selectMock.mockReturnValueOnce([]);
    fireNoteTagged('user-1', stubNote, { id: 't1', name: 'blog' });
    await new Promise((r) => setImmediate(r));
    expect(deliverOnceSpy).not.toHaveBeenCalled();
  });
});

describe('debounced note.updated', () => {
  it('coalesces rapid updates into one delivery', async () => {
    selectMock.mockReturnValue([{ id: 'wh-1', url: 'https://a', secretHash: 'h' }]);
    fireNoteUpdated('user-1', stubNote, ['title']);
    fireNoteUpdated('user-1', stubNote, ['content']);
    fireNoteUpdated('user-1', stubNote, ['content']);

    expect(deliverOnceSpy).not.toHaveBeenCalled();

    expect(__flushUpdateForTests('user-1', 'note-1')).toBe(true);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(deliverOnceSpy).toHaveBeenCalledTimes(1);
    const payload = deliverOnceSpy.mock.calls[0][2];
    expect(payload.event).toBe('note.updated');
    expect(new Set(payload.changedFields)).toEqual(new Set(['title', 'content']));
  });

  it('different notes are debounced independently', async () => {
    selectMock.mockReturnValue([{ id: 'wh-1', url: 'https://a', secretHash: 'h' }]);
    fireNoteUpdated('user-1', { ...stubNote, id: 'note-1' }, ['title']);
    fireNoteUpdated('user-1', { ...stubNote, id: 'note-2' }, ['content']);
    expect(__flushUpdateForTests('user-1', 'note-1')).toBe(true);
    expect(__flushUpdateForTests('user-1', 'note-2')).toBe(true);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(deliverOnceSpy).toHaveBeenCalledTimes(2);
  });
});

describe('other immediate events', () => {
  it('fire helpers carry their event name through', async () => {
    selectMock.mockReturnValue([{ id: 'wh-1', url: 'https://a', secretHash: 'h' }]);
    fireNoteTrashed('user-1', stubNote);
    fireNoteTagged('user-1', stubNote, { id: 't', name: 'blog' });
    fireNoteLinked('user-1', stubNote, { ...stubNote, id: 'note-2' });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const seen = deliverOnceSpy.mock.calls.map((c) => c[1]).sort();
    expect(seen).toEqual(['note.linked', 'note.tagged', 'note.trashed']);
  });
});

describe('debounce window', () => {
  it('is 5 seconds', () => {
    expect(__TEST.DEBOUNCE_MS).toBe(5000);
  });
});
