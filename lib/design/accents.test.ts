import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_SETTINGS, accentById } from './accents';

describe('accents', () => {
  it('exposes the six named accents in a stable order', () => {
    expect(ACCENTS.map((a) => a.id)).toEqual([
      'strawberry',
      'leaf',
      'jam',
      'cherry',
      'mint',
      'ink',
    ]);
  });

  it('gives every accent the colour fields the theme relies on', () => {
    for (const a of ACCENTS) {
      expect(a.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.ink).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.soft).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.softDark).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.name.length).toBeGreaterThan(0);
    }
  });

  it('looks up by id', () => {
    expect(accentById('mint').name).toBe('Mint');
    expect(accentById('leaf').hex).toBe('#5fae6a');
  });

  it('falls back to the first accent when the id is unknown', () => {
    // Simulate bad persisted data from an older build.
    expect(accentById('ghost' as unknown as 'strawberry')).toEqual(ACCENTS[0]);
  });

  it('defaults to the strawberry dark balanced theme', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      theme: 'dark',
      accent: 'strawberry',
      density: 'balanced',
      sidebarHidden: false,
      sidebarWidth: 232,
      noteListWidth: 300,
    });
  });
});
