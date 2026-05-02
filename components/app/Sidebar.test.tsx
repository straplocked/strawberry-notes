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
    privateCount: 0,
    view: { kind: 'all' },
    onView,
    onNew,
    theme: 'dark',
    onToggleTheme,
    density: 'balanced',
    collapsedSections: { time: false, folders: false, tags: false },
    onToggleSection,
    ...overrides,
  };
  render(<Sidebar {...props} />);
  return { onView, onToggleSection, props };
}

describe('Sidebar — collapsible sections', () => {
  it('renders the pinned rows plus every section body when none are collapsed', () => {
    setup();
    expect(screen.getByText('All Notes')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    // Time labels come from timeRangeLabel; the row for "today" is rendered.
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Recipes')).toBeInTheDocument();
    expect(screen.getByText('#recipes')).toBeInTheDocument();
  });

  it('hides a section body when collapsedSections marks it true', () => {
    setup({
      collapsedSections: { time: false, folders: false, tags: true },
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
      collapsedSections: { time: true, folders: false, tags: false },
    });
    // Folders is expanded -> aria-expanded="true"; Time is collapsed -> "false".
    expect(screen.getByRole('button', { name: 'Folders' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Time' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps All Notes and Pinned visible without a Library header', () => {
    // Library was retired — those rows are pinned open at the top of the
    // rail and there is no "Library" button to toggle.
    setup({
      collapsedSections: { time: true, folders: true, tags: true },
    });
    expect(screen.getByText('All Notes')).toBeInTheDocument();
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
  });

  it('hides the Tags section entirely when there are no tags', () => {
    setup({ tags: [] });
    expect(screen.queryByRole('button', { name: 'Tags' })).not.toBeInTheDocument();
  });

  it('hides the Private row when privateCount is 0', () => {
    setup({ privateCount: 0 });
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
  });

  it('renders the Private row in Library when privateCount > 0', () => {
    setup({ privateCount: 3 });
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('clicking the Private row fires onView with kind=private', () => {
    const { onView } = setup({ privateCount: 1 });
    fireEvent.click(screen.getByText('Private'));
    expect(onView).toHaveBeenCalledWith({ kind: 'private' });
  });

  it('expands a collapsed Folders section when "+" is pressed so the new-folder draft is visible', () => {
    const onAddFolder = vi.fn();
    const { onToggleSection } = setup({
      collapsedSections: { time: false, folders: true, tags: false },
      onAddFolder,
    });
    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    expect(onToggleSection).toHaveBeenCalledWith('folders');
  });
});
