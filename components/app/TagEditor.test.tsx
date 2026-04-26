import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TagEditor } from './TagEditor';
import type { TagDTO } from '@/lib/types';

const tags: TagDTO[] = [
  { id: 't-recipes', name: 'recipes', count: 4 },
  { id: 't-recurring', name: 'recurring', count: 2 },
  { id: 't-work', name: 'work', count: 7 },
];

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(value: string[] = []) {
  const onChange = vi.fn();
  render(<TagEditor value={value} available={tags} onChange={onChange} />);
  const input = screen.getByLabelText('Add tag') as HTMLInputElement;
  return { onChange, input };
}

describe('TagEditor', () => {
  it('renders existing tags as chips', () => {
    setup(['recipes', 'work']);
    expect(screen.getByText('#recipes')).toBeInTheDocument();
    expect(screen.getByText('#work')).toBeInTheDocument();
  });

  it('adds a typed tag on Enter (lowercased + trimmed)', () => {
    const { onChange, input } = setup(['recipes']);
    fireEvent.change(input, { target: { value: '  Reading  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['recipes', 'reading']);
  });

  it('adds a typed tag on comma', () => {
    const { onChange, input } = setup([]);
    fireEvent.change(input, { target: { value: 'idea' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(onChange).toHaveBeenCalledWith(['idea']);
  });

  it('refuses to add a duplicate (no onChange call)', () => {
    const { onChange, input } = setup(['recipes']);
    fireEvent.change(input, { target: { value: 'recipes' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last tag on Backspace when the input is empty', () => {
    const { onChange, input } = setup(['a', 'b', 'c']);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('does NOT remove a tag on Backspace when the input has text', () => {
    const { onChange, input } = setup(['a']);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a tag when its × button is clicked', () => {
    const onChange = vi.fn();
    render(<TagEditor value={['recipes', 'work']} available={tags} onChange={onChange} />);
    const removeBtn = screen.getByRole('button', { name: 'Remove tag recipes' });
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(['work']);
  });

  it('shows existing-tag suggestions while typing', () => {
    const { input } = setup([]);
    fireEvent.change(input, { target: { value: 'rec' } });
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    // Both `recipes` and `recurring` start with "rec".
    const optionNames = options.map((o) => o.textContent);
    expect(optionNames.some((n) => n?.includes('#recipes'))).toBe(true);
    expect(optionNames.some((n) => n?.includes('#recurring'))).toBe(true);
  });

  it('hides already-attached tags from suggestions', () => {
    const { input } = setup(['recipes']);
    fireEvent.change(input, { target: { value: 'rec' } });
    const list = screen.getByRole('listbox');
    const optionNames = within(list)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(optionNames.some((n) => n?.includes('#recipes'))).toBe(false);
    expect(optionNames.some((n) => n?.includes('#recurring'))).toBe(true);
  });

  it('appends a "Create new" suggestion when nothing matches exactly', () => {
    const { input } = setup([]);
    fireEvent.change(input, { target: { value: 'novel' } });
    const list = screen.getByRole('listbox');
    const fresh = within(list)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('new'));
    expect(fresh).toBeTruthy();
    expect(fresh?.textContent).toContain('#novel');
  });

  it('does not show a "Create new" suggestion when the typed value is an existing tag', () => {
    const { input } = setup([]);
    fireEvent.change(input, { target: { value: 'work' } });
    const list = screen.getByRole('listbox');
    const fresh = within(list)
      .getAllByRole('option')
      .find((o) => o.textContent?.includes('new'));
    expect(fresh).toBeUndefined();
  });

  it('Enter picks the active suggestion (not the raw draft) when one exists', () => {
    const { onChange, input } = setup([]);
    fireEvent.change(input, { target: { value: 'rec' } });
    // First suggestion (active by default) is the prefix-best match.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0][0] as string[];
    expect(called).toEqual(['recipes']);
  });

  it('ArrowDown moves the highlight; Enter then commits the new active suggestion', () => {
    const { onChange, input } = setup([]);
    fireEvent.change(input, { target: { value: 'rec' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    const called = onChange.mock.calls[0][0] as string[];
    // Was on recipes; Down moves to recurring.
    expect(called).toEqual(['recurring']);
  });

  it('readOnly hides the input and the × buttons', () => {
    render(<TagEditor value={['work']} available={tags} onChange={() => {}} readOnly />);
    expect(screen.queryByLabelText('Add tag')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove tag work' })).toBeNull();
    expect(screen.getByText('#work')).toBeInTheDocument();
  });

  it('truncates names longer than 40 chars', () => {
    const { onChange, input } = setup([]);
    const longName = 'a'.repeat(60);
    fireEvent.change(input, { target: { value: longName } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const called = onChange.mock.calls[0][0] as string[];
    expect(called[0].length).toBe(40);
  });
});
