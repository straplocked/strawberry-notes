import { describe, expect, it } from 'vitest';
import {
  countTasks,
  docHasImage,
  docToPlainText,
  snippetFromDoc,
} from './prosemirror-utils';
import type { PMDoc } from '../types';

const sample: PMDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Crust' }] },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'flour' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'butter' }] }],
        },
      ],
    },
    { type: 'image', attrs: { src: '/x.png', alt: 'x' } },
  ],
} as unknown as PMDoc;

describe('prosemirror utils', () => {
  it('flattens to text preserving order', () => {
    const t = docToPlainText(sample);
    expect(t).toContain('Crust');
    expect(t).toContain('flour');
    expect(t).toContain('butter');
  });

  it('picks the first line for snippet', () => {
    const s = snippetFromDoc(sample);
    expect(s).toBe('Crust');
  });

  it('detects images', () => {
    expect(docHasImage(sample)).toBe(true);
  });

  it('counts tasks', () => {
    expect(countTasks(sample)).toEqual({ total: 2, done: 1 });
  });
});
