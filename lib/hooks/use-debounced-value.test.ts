import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  it('settles once per 300 ms idle window, skipping intermediate keystrokes', () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ v }) => {
        const d = useDebouncedValue(v, 300);
        if (seen.at(-1) !== d) seen.push(d);
        return d;
      },
      { initialProps: { v: '' } },
    );

    for (const v of ['s', 'so', 'sou', 'sour']) {
      rerender({ v });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('sour');
    // Only the initial value and the settled value were ever emitted, so a
    // query keyed on it fires once for the whole burst.
    expect(seen).toEqual(['', 'sour']);
  });
});
