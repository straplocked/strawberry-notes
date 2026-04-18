/**
 * Minimal ProseMirror JSON → Markdown serializer.
 * Covers the node set Strawberry Notes uses: paragraph, heading, bulletList,
 * orderedList, taskList, taskItem, blockquote, codeBlock, horizontalRule,
 * image, hardBreak, plus text marks (bold, italic, strike, code).
 */

import type { PMDoc } from '../types';

interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function docToMarkdown(doc: PMDoc): string {
  const node = doc as unknown as PMNode;
  return renderBlocks(node.content ?? []).trim() + '\n';
}

function renderBlocks(nodes: PMNode[], listDepth = 0): string {
  return nodes.map((n) => renderBlock(n, listDepth)).join('\n\n');
}

function renderBlock(n: PMNode, depth: number): string {
  switch (n.type) {
    case 'paragraph':
      return renderInline(n.content ?? []);
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(n.attrs?.level ?? 2)));
      return `${'#'.repeat(level)} ${renderInline(n.content ?? [])}`;
    }
    case 'blockquote':
      return renderBlocks(n.content ?? [], depth)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'bulletList':
      return (n.content ?? [])
        .map((li) => renderListItem(li, depth, '-'))
        .join('\n');
    case 'orderedList':
      return (n.content ?? [])
        .map((li, i) => renderListItem(li, depth, `${i + 1}.`))
        .join('\n');
    case 'taskList':
      return (n.content ?? [])
        .map((li) => renderTaskItem(li, depth))
        .join('\n');
    case 'codeBlock': {
      const lang = (n.attrs?.language as string) ?? '';
      const body = (n.content ?? []).map((c) => c.text ?? '').join('');
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = (n.attrs?.src as string) ?? '';
      const alt = (n.attrs?.alt as string) ?? '';
      return `![${alt}](${src})`;
    }
    default:
      return renderInline(n.content ?? []);
  }
}

function renderListItem(node: PMNode, depth: number, marker: string): string {
  const indent = '  '.repeat(depth);
  const body = renderBlocks(node.content ?? [], depth + 1);
  const [first, ...rest] = body.split('\n');
  const head = `${indent}${marker} ${first}`;
  if (rest.length === 0) return head;
  return [head, ...rest.map((l) => `${indent}  ${l}`)].join('\n');
}

function renderTaskItem(node: PMNode, depth: number): string {
  const checked = node.attrs?.checked === true ? 'x' : ' ';
  const indent = '  '.repeat(depth);
  const body = renderBlocks(node.content ?? [], depth + 1);
  const [first, ...rest] = body.split('\n');
  const head = `${indent}- [${checked}] ${first}`;
  if (rest.length === 0) return head;
  return [head, ...rest.map((l) => `${indent}  ${l}`)].join('\n');
}

function renderInline(nodes: PMNode[]): string {
  return nodes.map(renderInlineNode).join('');
}

function renderInlineNode(n: PMNode): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') {
    const src = (n.attrs?.src as string) ?? '';
    const alt = (n.attrs?.alt as string) ?? '';
    return `![${alt}](${src})`;
  }
  const text = n.text ?? renderInline(n.content ?? []);
  let out = text;
  const marks = n.marks ?? [];
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has('code')) out = `\`${out}\``;
  if (has('bold') && has('italic')) out = `***${out}***`;
  else if (has('bold')) out = `**${out}**`;
  else if (has('italic')) out = `*${out}*`;
  if (has('strike')) out = `~~${out}~~`;
  const linkMark = marks.find((m) => m.type === 'link');
  if (linkMark) {
    const href = (linkMark.attrs?.href as string) ?? '';
    out = `[${out}](${href})`;
  }
  return out;
}
