import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoteList } from './NoteList';
import type { NoteListItemDTO, SearchMatch } from '@/lib/types';

beforeAll(() => {
  // useIsMobile reads matchMedia; jsdom doesn't implement it.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as typeof window.matchMedia;
  }
});

function note(id: string, matchedBy?: SearchMatch): NoteListItemDTO {
  return {
    id,
    folderId: null,
    title: `Note ${id}`,
    snippet: '',
    pinned: false,
    updatedAt: '2026-10-01T00:00:00Z',
    tagIds: [],
    hasImage: false,
    private: false,
    matchedBy,
  };
}

describe('NoteList search match marker', () => {
  it('marks only rows matched by meaning alone', () => {
    render(
      <NoteList
        notes={[note('a', 'text'), note('b', 'both'), note('c', 'meaning'), note('d')]}
        tags={[]}
        activeFolderName="Search"
        activeNoteId={null}
        onSelect={() => {}}
        search="sourdough"
        onSearch={() => {}}
        density="balanced"
      />,
    );
    const marks = screen.getAllByLabelText('Matched by meaning');
    expect(marks).toHaveLength(1);
    expect(marks[0].closest('[data-note-id]') ?? marks[0].parentElement).toHaveTextContent(
      'Note c',
    );
  });
});
