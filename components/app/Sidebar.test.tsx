import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sidebar, type SidebarProps } from './Sidebar';
import type { FolderDTO, TagDTO } from '@/lib/types';

const folders: FolderDTO[] = [
  { id: 'f-recipes', parentId: null, name: 'Recipes', color: '#e33d4e', position: 0, count: 3 },
];

const tags: TagDTO[] = [
  { id: 't-recipes', name: 'recipes', count: 4 },
  { id: 't-ideas', name: 'ideas', count: 2 },
];

function setup(overrides: Partial<SidebarProps> = {}) {
  const onView = vi.fn();
  const onNew = vi.fn();
  const onToggleTheme = vi.fn();
  const onToggleSection = vi.fn();
  const props: SidebarProps = {
    folders,
    tags,
    allCount: 9,
    pinnedCount: 1,
    trashCount: 0,
    view: { kind: 'all' },
    onView,
    onNew,
    theme: 'dark',
    onToggleTheme,
    density: 'balanced',
    collapsedSections: { library: false, time: false, folders: false, tags: false },
    onToggleSection,
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return { onView, onToggleSection, props };
}

describe('Sidebar — collapsible sections', () => {
  it('renders all four section bodies when none are collapsed', () => {
    setup();
    expect(screen.getByText('All Notes')).toBeInTheDocument();
    // Time labels come from timeRangeLabel; the row for "today" is rendered.
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Recipes')).toBeInTheDocument();
    expect(screen.getByText('#recipes')).toBeInTheDocument();
  });

  it('hides a section body when collapsedSections marks it true', () => {
    setup({
      collapsedSections: { library: false, time: false, folders: false, tags: true },
    });
    // Tags body is hidden, but the toggle remains.
    expect(screen.queryByText('#recipes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tags' })).toBeInTheDocument();
  });

  it('clicking a section header fires onToggleSection with its key', () => {
    const { onToggleSection } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    expect(onToggleSection).toHaveBeenCalledWith('tags');
    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));
    expect(onToggleSection).toHaveBeenCalledWith('folders');
  });

  it('reflects the collapsed/expanded state via aria-expanded', () => {
    setup({
      collapsedSections: { library: false, time: true, folders: false, tags: false },
    });
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Time' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides the Tags section entirely when there are no tags', () => {
    setup({ tags: [] });
    expect(screen.queryByRole('button', { name: 'Tags' })).not.toBeInTheDocument();
  });

  it('expands a collapsed Folders section when "+" is pressed so the new-folder draft is visible', () => {
    const onAddFolder = vi.fn();
    const { onToggleSection } = setup({
      collapsedSections: { library: false, time: false, folders: true, tags: false },
      onAddFolder,
    });
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    expect(onToggleSection).toHaveBeenCalledWith('folders');
  });
});
