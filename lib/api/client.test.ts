import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

type FetchArgs = Parameters<typeof fetch>;
interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

const calls: FetchCall[] = [];

function mockJsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.ok === false ? 'Bad Request' : 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((...args: FetchArgs) => {
      calls.push({ url: String(args[0]), init: args[1] });
      return Promise.resolve(mockJsonResponse({}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.notes.list', () => {
  it('builds an empty query string when no filters given', async () => {
    await api.notes.list({});
    expect(calls[0].url).toBe('/api/notes?');
  });

  it('includes each filter when provided', async () => {
    await api.notes.list({ folder: 'f1', tag: 't1', q: 'hello world' });
    const url = new URL(calls[0].url, 'http://localhost');
    expect(url.pathname).toBe('/api/notes');
    expect(url.searchParams.get('folder')).toBe('f1');
    expect(url.searchParams.get('tag')).toBe('t1');
    expect(url.searchParams.get('q')).toBe('hello world');
  });

  it('omits filters that are falsy', async () => {
    await api.notes.list({ q: '' });
    const url = new URL(calls[0].url, 'http://localhost');
    expect(url.search).toBe('');
  });
});

describe('api.folders', () => {
  it('POSTs JSON to create a folder', async () => {
    await api.folders.create({ name: 'Recipes', color: '#e33d4e' });
    const [{ url, init }] = calls;
    expect(url).toBe('/api/folders');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Recipes', color: '#e33d4e' });
  });

  it('DELETEs the folder at /api/folders/:id', async () => {
    await api.folders.delete('abc-123');
    expect(calls[0].url).toBe('/api/folders/abc-123');
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('api.notes mutations', () => {
  it('PATCHes only the provided fields', async () => {
    await api.notes.patch('n1', { title: 'New', pinned: true });
    const [{ url, init }] = calls;
    expect(url).toBe('/api/notes/n1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ title: 'New', pinned: true });
  });

  it('DELETEs a note by id', async () => {
    await api.notes.remove('n1');
    expect(calls[0].url).toBe('/api/notes/n1');
    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('error handling', () => {
  it('throws with status + body when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: async () => 'forbidden',
          json: async () => ({}),
        } as unknown as Response),
      ),
    );

    await expect(api.folders.list()).rejects.toThrow(/403 Forbidden/);
  });
});
