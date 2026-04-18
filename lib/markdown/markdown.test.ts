import { describe, expect, it } from 'vitest';
import { markdownToDoc } from './from-markdown';
import { docToMarkdown } from './to-markdown';

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
