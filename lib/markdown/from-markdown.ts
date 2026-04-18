/**
 * Markdown → ProseMirror JSON. We lean on `marked` to produce a token stream
 * then translate to the node set TipTap / Strawberry Notes uses.
 */

import { Marked } from 'marked';
import type { Tokens } from 'marked';
import type { PMDoc } from '../types';

interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const marked = new Marked({ gfm: true, breaks: false });

export function markdownToDoc(md: string): PMDoc {
  const tokens = marked.lexer(md);
  const content: PMNode[] = [];
  for (const tok of tokens) content.push(...convertBlock(tok));
  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content: content as unknown as PMDoc['content'] };
}

function convertBlock(t: Tokens.Generic): PMNode[] {
  switch (t.type) {
    case 'heading': {
      const h = t as Tokens.Heading;
      return [{ type: 'heading', attrs: { level: h.depth }, content: inlineFrom(h.tokens ?? []) }];
    }
    case 'paragraph': {
      const p = t as Tokens.Paragraph;
      return [{ type: 'paragraph', content: inlineFrom(p.tokens ?? []) }];
    }
    case 'blockquote': {
      const bq = t as Tokens.Blockquote;
      const inner: PMNode[] = [];
      for (const sub of bq.tokens ?? []) inner.push(...convertBlock(sub));
      return [{ type: 'blockquote', content: inner }];
    }
    case 'list': {
      const list = t as Tokens.List;
      const isTask = (list.items ?? []).some((it) => it.task);
      if (isTask) {
        return [
          {
            type: 'taskList',
            content: list.items.map((it) => ({
              type: 'taskItem',
              attrs: { checked: !!it.checked },
              content: taskItemInner(it),
            })),
          },
        ];
      }
      return [
        {
          type: list.ordered ? 'orderedList' : 'bulletList',
          content: list.items.map((it) => ({
            type: 'listItem',
            content: (it.tokens ?? []).flatMap(convertBlock),
          })),
        },
      ];
    }
    case 'hr':
      return [{ type: 'horizontalRule' }];
    case 'code': {
      const c = t as Tokens.Code;
      return [
        {
          type: 'codeBlock',
          attrs: { language: c.lang ?? null },
          content: [{ type: 'text', text: c.text }],
        },
      ];
    }
    case 'space':
      return [];
    default: {
      // Fallback: treat unknown block as paragraph of its raw text.
      const raw = (t as { raw?: string }).raw ?? '';
      if (!raw.trim()) return [];
      return [{ type: 'paragraph', content: [{ type: 'text', text: raw.trim() }] }];
    }
  }
}

/**
 * Render a task list item's body. Marked sometimes leaves the `[x]`/`[ ]`
 * prefix inside the first text token even though `item.task` is set — strip
 * it so it doesn't leak into the rendered paragraph.
 */
function taskItemInner(it: Tokens.ListItem): PMNode[] {
  const text = (it.text ?? '').replace(/^\s*\[[ xX]\]\s*/, '');
  return [{ type: 'paragraph', content: [{ type: 'text', text }] }];
}

function inlineFrom(tokens: Tokens.Generic[], marks: PMNode['marks'] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const tok of tokens) {
    switch (tok.type) {
      case 'text': {
        const tt = tok as Tokens.Text;
        if (tt.tokens && tt.tokens.length > 0) {
          out.push(...inlineFrom(tt.tokens, marks));
        } else if (tt.text) {
          out.push({ type: 'text', text: tt.text, marks });
        }
        break;
      }
      case 'strong':
        out.push(...inlineFrom((tok as Tokens.Strong).tokens ?? [], [...(marks ?? []), { type: 'bold' }]));
        break;
      case 'em':
        out.push(...inlineFrom((tok as Tokens.Em).tokens ?? [], [...(marks ?? []), { type: 'italic' }]));
        break;
      case 'del':
        out.push(...inlineFrom((tok as Tokens.Del).tokens ?? [], [...(marks ?? []), { type: 'strike' }]));
        break;
      case 'codespan': {
        const cs = tok as Tokens.Codespan;
        out.push({ type: 'text', text: cs.text, marks: [...(marks ?? []), { type: 'code' }] });
        break;
      }
      case 'link': {
        const ln = tok as Tokens.Link;
        out.push(
          ...inlineFrom(ln.tokens ?? [], [
            ...(marks ?? []),
            { type: 'link', attrs: { href: ln.href } },
          ]),
        );
        break;
      }
      case 'image': {
        const im = tok as Tokens.Image;
        out.push({ type: 'image', attrs: { src: im.href, alt: im.text } });
        break;
      }
      case 'br':
        out.push({ type: 'hardBreak' });
        break;
      default: {
        const raw = (tok as { raw?: string; text?: string }).text ?? (tok as { raw?: string }).raw;
        if (raw) out.push({ type: 'text', text: raw, marks });
      }
    }
  }
  return out;
}
