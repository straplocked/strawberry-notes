#!/usr/bin/env node
/**
 * Reproducibly renders the PWA maskable icons + Apple touch icon from
 * public/icons/favicon.svg using sharp (already resolved in
 * package-lock.json as an optional dependency of Next.js for next/image;
 * listed directly in devDependencies here so this script doesn't rely on
 * that staying true).
 *
 * Run with: npm run icons:generate
 *
 * Does NOT touch icon-192.png / icon-512.png (purpose "any") — those are
 * fine full-bleed and aren't regenerated here to avoid an unnecessary diff.
 * It regenerates:
 *   - icon-192-maskable.png / icon-512-maskable.png: the logo scaled to a
 *     centered 72% of the canvas on an opaque brand background, so it sits
 *     safely inside Android's 80% maskable safe zone regardless of which
 *     mask shape (circle, squircle, rounded square) the launcher applies.
 *   - apple-touch-icon.png: 180x180 on the same opaque background (iOS
 *     doesn't handle a transparent touch icon predictably) with slightly
 *     more padding, since iOS applies its own rounded-square mask on top.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');
const SVG_PATH = join(ICONS_DIR, 'favicon.svg');

// Matches app/manifest.ts's background_color/theme_color and
// app/globals.css's dark --bg token — the app's own brand background.
const BRAND_BG = '#15100f';

const svgBuffer = readFileSync(SVG_PATH);

/** Renders the logo scaled to `scale` (0-1) of `size`, centered on an
 * opaque `size`x`size` canvas filled with `bg`. */
async function renderPadded(size, scale, bg) {
  const logoSize = Math.max(1, Math.round(size * scale));
  const logo = await sharp(svgBuffer).resize(logoSize, logoSize).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  const outputs = [
    // 72% logo / 28% total margin (14% per side) — comfortably inside the
    // 80% safe-zone circle even accounting for the logo's bounding box.
    ['icon-192-maskable.png', await renderPadded(192, 0.72, BRAND_BG)],
    ['icon-512-maskable.png', await renderPadded(512, 0.72, BRAND_BG)],
    // Slightly more margin for iOS's own corner-rounding mask.
    ['apple-touch-icon.png', await renderPadded(180, 0.68, BRAND_BG)],
  ];

  for (const [name, buffer] of outputs) {
    writeFileSync(join(ICONS_DIR, name), buffer);
    console.log(`wrote public/icons/${name} (${buffer.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
