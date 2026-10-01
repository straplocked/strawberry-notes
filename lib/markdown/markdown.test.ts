import { describe, expect, it } from 'vitest';
import { markdownToDoc } from './from-markdown';
import { docToMarkdown } from './to-markdown';
import type { PMDoc } from '../types';

describe('markdown round-trip', () => {
  it('preserves a simple heading + paragraph', () => {
    const md = '## Filling\n\n2 cups strawberries.\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim()).toEqual(md.trim());
  });

  it('keeps checklists', () => {
    const md = '- [x] done\n- [ ] todo\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out).toContain('- [x] done');
    expect(out).toContain('- [ ] todo');
  });

  it('keeps bold and italic', () => {
    const md = 'A **bold** and *italic* word.\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out).toContain('**bold**');
    expect(out).toContain('*italic*');
  });

  it('keeps blockquotes', () => {
    const md = '> Attention is the rarest form of generosity.\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim().startsWith('>')).toBe(true);
    expect(out).toContain('generosity');
  });
});

describe('table round-trip', () => {
  it('preserves per-column alignment', () => {
    const md = '| Name | Qty | Price |\n| :-- | :-: | --: |\n| Flour | 2 | $3.50 |\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim()).toEqual(md.trim());
    expect(out).toContain('| :-- | :-: | --: |');
  });

  it('round-trips escaped pipes inside a cell', () => {
    const md = '| A | B |\n| --- | --- |\n| a \\| b | plain |\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim()).toEqual(md.trim());
    // the pipe survives as data, not as an extra column
    expect(out).toContain('a \\| b');
  });

  it('round-trips inline code and bold inside cells, including a pipe inside a code span', () => {
    const md = '| A | B |\n| --- | --- |\n| `a\\|b` | **bold** |\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim()).toEqual(md.trim());
    expect(out).toContain('`a\\|b`');
    expect(out).toContain('**bold**');
  });

  it('round-trips empty cells', () => {
    const md = '| A | B |\n| --- | --- |\n|  | filled |\n| filled |  |\n';
    const doc = markdownToDoc(md);
    const out = docToMarkdown(doc);
    expect(out.trim()).toEqual(md.trim());
  });

  it('builds a valid GFM table from a freshly inserted 3x3 table doc (insertTable shape)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [0, 1, 2].map((rowIdx) => ({
            type: 'tableRow',
            content: [0, 1, 2].map(() => ({
              type: rowIdx === 0 ? 'tableHeader' : 'tableCell',
              content: [{ type: 'paragraph' }],
            })),
          })),
        },
      ],
    } as unknown as PMDoc;
    const md = docToMarkdown(doc);
    const lines = md.trim().split('\n');
    expect(lines).toHaveLength(4); // header + align row + 2 body rows
    expect(lines[1]).toEqual('| --- | --- | --- |');
    // re-importing the generated markdown must not throw and must keep 3 columns
    const reimported = markdownToDoc(md);
    const table = (reimported as unknown as { content: { content: unknown[] }[] }).content[0];
    expect(table.content).toHaveLength(3);
  });

  it('joins a multi-paragraph cell with <br> so the row stays on one line', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'line1' }] },
                    { type: 'paragraph', content: [{ type: 'text', text: 'line2' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    } as unknown as PMDoc;
    const md = docToMarkdown(doc);
    expect(md).toContain('line1<br>line2');
    expect(md.trim().split('\n')).toHaveLength(3); // header + align + one body row
  });
});
