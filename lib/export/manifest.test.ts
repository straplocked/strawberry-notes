import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  safeComponent,
  toFrontmatter,
  uniquePath,
} from './manifest';

describe('safeComponent', () => {
  it('passes through ordinary names', () => {
    expect(safeComponent('Groceries')).toBe('Groceries');
  });

  it('strips path separators and control chars', () => {
    expect(safeComponent('../a/b\\c:d?e*f')).toBe('a b c d e f');
  });

  it('strips trailing dots and spaces', () => {
    expect(safeComponent('Windows hates me.  ')).toBe('Windows hates me');
  });

  it('replaces an empty result with the fallback', () => {
    expect(safeComponent('')).toBe('untitled');
    expect(safeComponent('   ')).toBe('untitled');
    expect(safeComponent('///', { fallback: 'note' })).toBe('note');
  });

  it('treats Windows-reserved device names as fallback', () => {
    expect(safeComponent('CON')).toBe('untitled');
    expect(safeComponent('com1')).toBe('untitled');
    expect(safeComponent('Normal.doc')).toBe('Normal.doc');
  });

  it('normalises Unicode (NFC) so composed/decomposed forms match', () => {
    // "é" in NFD = 0x65 0x0301, in NFC = 0x00e9
    const nfd = 'caf\u0065\u0301';
    const nfc = 'caf\u00e9';
    expect(safeComponent(nfd)).toBe(nfc);
  });

  it('caps length at the configured byte budget', () => {
    const long = 'a'.repeat(200);
    const out = safeComponent(long, { maxLen: 40 });
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(40);
    expect(out.startsWith('aaaa')).toBe(true);
  });

  it('never splits a multi-byte character when truncating', () => {
    // Each emoji is 4 bytes in UTF-8.
    const emoji = '🍓'.repeat(30);
    const out = safeComponent(emoji, { maxLen: 20 });
    const bytes = new TextEncoder().encode(out);
    expect(bytes.length).toBeLessThanOrEqual(20);
    // Round-trip decode must succeed.
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(out);
  });
});

describe('uniquePath', () => {
  it('returns the base when unused', () => {
    const s = new Set<string>();
    expect(uniquePath(s, 'notes/a', '.md')).toBe('notes/a.md');
    expect(s.has('notes/a.md')).toBe(true);
  });

  it('suffixes -1, -2 on collision', () => {
    const s = new Set<string>(['notes/a.md', 'notes/a-1.md']);
    expect(uniquePath(s, 'notes/a', '.md')).toBe('notes/a-2.md');
    expect(s.has('notes/a-2.md')).toBe(true);
  });

  it('honours an empty extension', () => {
    const s = new Set<string>(['folder/x']);
    expect(uniquePath(s, 'folder/x', '')).toBe('folder/x-1');
  });
});

describe('toFrontmatter', () => {
  it('emits a YAML block with delimiters and trailing blank line', () => {
    const out = toFrontmatter({ title: 'Hello', pinned: true });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    expect(out).toContain('title: "Hello"');
    expect(out).toContain('pinned: true');
  });

  it('renders null, booleans, numbers and arrays', () => {
    const out = toFrontmatter({
      folderId: null,
      pinned: false,
      count: 3,
      tagNames: ['a', 'b'],
    });
    expect(out).toContain('folderId: null');
    expect(out).toContain('pinned: false');
    expect(out).toContain('count: 3');
    expect(out).toContain('tagNames:\n  - "a"\n  - "b"');
  });

  it('quote-escapes problematic characters', () => {
    const out = toFrontmatter({ title: 'She said "hi"\nthen left' });
    expect(out).toContain('"She said \\"hi\\"\\nthen left"');
  });

  it('renders empty arrays as []', () => {
    expect(toFrontmatter({ tagNames: [] })).toContain('tagNames: []');
  });
});

describe('buildManifest', () => {
  it('packs notes + attachments with version and counts', () => {
    const now = new Date('2026-04-23T12:00:00Z');
    const m = buildManifest({
      includeTrash: false,
      notes: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          title: 'Hello',
          path: 'notes/_unfiled/hello-00000000.md',
          folderId: null,
          folderName: null,
          pinned: false,
          trashed: false,
          tagNames: ['a'],
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          trashedAt: null,
        },
      ],
      attachments: [
        {
          id: '00000000-0000-0000-0000-000000000002',
          noteId: '00000000-0000-0000-0000-000000000001',
          filename: 'berry.png',
          mime: 'image/png',
          size: 1024,
          path: 'uploads/berry-00000000.png',
        },
      ],
      now,
    });
    expect(m.version).toBe(1);
    expect(m.exportedAt).toBe(now.toISOString());
    expect(m.counts).toEqual({ notes: 1, attachments: 1 });
    expect(m.includeTrash).toBe(false);
    expect(m.notes[0].path).toBe('notes/_unfiled/hello-00000000.md');
    expect(m.attachments[0].path).toBe('uploads/berry-00000000.png');
  });
});
