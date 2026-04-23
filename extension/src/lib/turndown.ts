/**
 * Pre-configured Turndown service. Opinions:
 *
 * - ATX-style headings (`#`, `##`) because that's what the server's
 *   `markdownToDoc` parser reads most cleanly.
 * - Fenced code blocks with triple backticks.
 * - Strip `<script>` / `<style>` / `<noscript>` / `<iframe>` entirely —
 *   they are never useful in a clipped note and can pollute the document.
 * - Leave image `src` as absolute URLs. The server keeps them as remote
 *   references; there is no re-upload in v1 (see README).
 */

import TurndownService from 'turndown';

export function buildTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Remove noisy / non-content elements entirely.
  td.remove(['script', 'style', 'noscript', 'iframe', 'template']);

  return td;
}

/** Resolve an element's image and anchor URLs to absolute before Turndown sees them. */
export function absolutizeUrls(root: HTMLElement, baseHref: string): void {
  const resolve = (v: string | null): string | null => {
    if (!v) return null;
    try {
      return new URL(v, baseHref).toString();
    } catch {
      return null;
    }
  };
  for (const el of Array.from(root.querySelectorAll('a[href]'))) {
    const abs = resolve(el.getAttribute('href'));
    if (abs) el.setAttribute('href', abs);
  }
  for (const el of Array.from(root.querySelectorAll('img[src]'))) {
    const abs = resolve(el.getAttribute('src'));
    if (abs) el.setAttribute('src', abs);
  }
}
