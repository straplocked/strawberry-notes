/**
 * Content-script: runs inside the clipped page when the background /
 * popup asks for a clip payload.
 *
 * Responds to `chrome.runtime.sendMessage({ type: 'snb/clip', mode })`
 * where `mode` is `'page'` or `'selection'`.
 */

import { absolutizeUrls, buildTurndown } from '../lib/turndown';

interface ClipMessage {
  type: 'snb/clip';
  mode: 'page' | 'selection';
}

interface ClipResponse {
  ok: true;
  markdown: string;
  title: string;
  url: string;
}

interface ClipError {
  ok: false;
  error: string;
}

function htmlToMarkdownFromElement(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  absolutizeUrls(clone, document.baseURI);
  const td = buildTurndown();
  return td.turndown(clone).trim();
}

function getSelectionHtml(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const container = document.createElement('div');
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents());
  }
  const html = container.innerHTML.trim();
  return html.length > 0 ? html : null;
}

function clipPage(mode: 'page' | 'selection'): ClipResponse | ClipError {
  try {
    let markdown = '';
    if (mode === 'selection') {
      const html = getSelectionHtml();
      if (!html) {
        return { ok: false, error: 'No text is selected on this page.' };
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      markdown = htmlToMarkdownFromElement(wrap);
    } else {
      // MVP: send the body. A future pass can try a Readability-style
      // main-content heuristic (<article>, <main>, largest <div>, …).
      const source =
        document.querySelector('article') ??
        document.querySelector('main') ??
        document.body;
      markdown = htmlToMarkdownFromElement(source as HTMLElement);
    }
    return {
      ok: true,
      markdown,
      title: (document.title || document.location.hostname).trim(),
      url: document.location.href,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const m = message as ClipMessage | undefined;
  if (!m || m.type !== 'snb/clip') return false;
  const result = clipPage(m.mode);
  sendResponse(result);
  // Return true would be required only for async work; we respond
  // synchronously so `false` is fine.
  return false;
});
