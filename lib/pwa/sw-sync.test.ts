import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CACHE_VERSION, DATA_PATH_PREFIXES, OFFLINE_URL, PRECACHE_URLS } from './sw-policy';

/**
 * public/sw.js is a plain, non-bundled classic worker script — it can't
 * `import` lib/pwa/sw-policy.ts, so it duplicates that module's constants
 * and classification logic by hand. This test reads the raw SW source and
 * asserts the values that matter most (cache version, precache list, data
 * path prefixes) match the TypeScript source of truth, so a future edit to
 * one can't silently drift from the other.
 */

const swSource = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

function extractStringConst(name: string): string {
  const match = swSource.match(new RegExp(`const ${name} = '([^']*)'`));
  if (!match) throw new Error(`could not find const ${name} in public/sw.js`);
  return match[1];
}

function extractStringArrayConst(name: string): string[] {
  const match = swSource.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`));
  if (!match) throw new Error(`could not find const ${name} in public/sw.js`);
  // The arrays in sw.js are simple string-literal lists (no nesting), so a
  // quote-normalizing JSON.parse is safe here.
  const jsonish = match[1].replace(/'/g, '"').replace(/,\s*\]/, ']');
  return JSON.parse(jsonish) as string[];
}

describe('public/sw.js stays in sync with lib/pwa/sw-policy.ts', () => {
  it('has the same CACHE_VERSION', () => {
    expect(extractStringConst('CACHE_VERSION')).toBe(CACHE_VERSION);
  });

  it('has the same OFFLINE_URL', () => {
    expect(extractStringConst('OFFLINE_URL')).toBe(OFFLINE_URL);
  });

  it('has the same PRECACHE_URLS (order-independent)', () => {
    // sw.js inlines OFFLINE_URL as a bare identifier inside the array
    // literal (`[..., OFFLINE_URL]`), so compare against the TS list with
    // the same substitution rather than requiring literal string equality.
    const raw = extractRawArrayLiteral('PRECACHE_URLS');
    const normalized = raw
      .replace(/OFFLINE_URL/g, `'${extractStringConst('OFFLINE_URL')}'`)
      .replace(/'/g, '"');
    const parsed = JSON.parse(normalized) as string[];
    expect(parsed.sort()).toEqual([...PRECACHE_URLS].sort());
  });

  it('has the same DATA_PATH_PREFIXES', () => {
    expect(extractStringArrayConst('DATA_PATH_PREFIXES').sort()).toEqual(
      [...DATA_PATH_PREFIXES].sort(),
    );
  });
});

function extractRawArrayLiteral(name: string): string {
  const match = swSource.match(new RegExp(`const ${name} = (\\[[^\\]]*\\])`));
  if (!match) throw new Error(`could not find const ${name} in public/sw.js`);
  return match[1];
}
