'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` once it has stopped changing for `delayMs`. The search box
 * uses it so typing issues one list request per pause, not one per keystroke
 * (each request may embed the query — see lib/notes/search.ts).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
