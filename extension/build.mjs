#!/usr/bin/env node
/**
 * Build script for the Strawberry Notes web clipper.
 *
 * Produces a `dist/` tree that can be loaded unpacked in Chrome
 * (chrome://extensions → Load unpacked) or temporarily in Firefox
 * (about:debugging → Load Temporary Add-on).
 *
 * Deliberately tiny — no framework, no bundler config file — so the whole
 * extension is readable end-to-end in a few minutes.
 */

import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, 'src');
const distDir = resolve(here, 'dist');
const publicDir = resolve(here, 'public');

const watch = process.argv.includes('--watch');

const entries = {
  'background.js': resolve(srcDir, 'background.ts'),
  'popup/popup.js': resolve(srcDir, 'popup/popup.ts'),
  'content/clip.js': resolve(srcDir, 'content/clip.ts'),
};

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'firefox120'],
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

async function buildAll() {
  if (existsSync(distDir)) await rm(distDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(resolve(distDir, 'popup'), { recursive: true });
  await mkdir(resolve(distDir, 'content'), { recursive: true });

  // Static assets: manifest + popup HTML/CSS + icons.
  const manifestSrc = resolve(here, 'manifest.json');
  await cp(manifestSrc, resolve(distDir, 'manifest.json'));
  await cp(resolve(srcDir, 'popup/popup.html'), resolve(distDir, 'popup/popup.html'));
  await cp(resolve(srcDir, 'popup/popup.css'), resolve(distDir, 'popup/popup.css'));
  if (existsSync(publicDir)) {
    await cp(publicDir, distDir, { recursive: true });
  }

  // Bundle each entry separately so the manifest can reference explicit file paths.
  for (const [outFile, entry] of Object.entries(entries)) {
    const outPath = resolve(distDir, outFile);
    await mkdir(dirname(outPath), { recursive: true });
    if (watch) {
      const ctx = await context({ ...common, entryPoints: [entry], outfile: outPath });
      await ctx.watch();
    } else {
      await build({ ...common, entryPoints: [entry], outfile: outPath });
    }
  }

  if (!watch) {
    // Sanity-check manifest points at files that now exist.
    const manifest = JSON.parse(await readFile(manifestSrc, 'utf8'));
    const mustExist = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      ...(manifest.content_scripts?.flatMap((cs) => cs.js ?? []) ?? []),
    ].filter(Boolean);
    for (const p of mustExist) {
      if (!existsSync(resolve(distDir, p))) {
        throw new Error(`manifest references ${p} but it is missing from dist/`);
      }
    }
    // Compatibility note: Firefox requires `browser_specific_settings.gecko.id`
    // to install a signed build. The bundled manifest already sets one.
    await writeFile(
      resolve(distDir, 'BUILD_INFO.txt'),
      `Built ${new Date().toISOString()}\nLoad unpacked: chrome://extensions or about:debugging (Firefox temporary add-on).\n`,
    );
    console.log('[clipper] build complete ->', distDir);
  }
}

buildAll().catch((err) => {
  console.error('[clipper] build failed:', err);
  process.exit(1);
});
