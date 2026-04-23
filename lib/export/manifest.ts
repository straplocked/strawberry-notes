/**
 * Manifest builder + filename helpers for the export-all zip.
 *
 * The manifest captures enough metadata for a future import to reconstruct the
 * note tree: per-note ids, folder names, tags, timestamps, and per-attachment
 * filenames. Exported paths inside the zip are the canonical keys.
 */

/** Keep filenames filesystem-safe on Linux, macOS, Windows, and inside zip. */
const UNSAFE_CHARS = /[\x00-\x1f\x7f<>:"/\\|?*]+/g;
const TRAILING_DOTS_OR_SPACES = /[. ]+$/;
const LEADING_DOTS_OR_SPACES = /^[. ]+/;
// Windows-reserved device names.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Sanitise a component of a path (folder name or file stem).
 * - Strips path separators and control characters.
 * - Normalises Unicode (NFC) so composed/decomposed forms collapse.
 * - Collapses whitespace.
 * - Strips trailing dots/spaces (Windows rejects those).
 * - Caps to `maxLen` bytes when UTF-8 encoded (default 80).
 * - Falls back to `fallback` if the result is empty or reserved.
 */
export function safeComponent(
  raw: string,
  opts: { maxLen?: number; fallback?: string } = {},
): string {
  const maxLen = opts.maxLen ?? 80;
  const fallback = opts.fallback ?? 'untitled';

  const normalised = (raw ?? '').normalize('NFC');
  let out = normalised.replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  // Strip leading and trailing dots/spaces: Windows rejects trailing ones and
  // a leading ".." or "." is never what the user meant after path separators
  // have been flattened to spaces.
  out = out.replace(LEADING_DOTS_OR_SPACES, '').replace(TRAILING_DOTS_OR_SPACES, '');

  if (!out || RESERVED.test(out)) out = fallback;

  // Byte-cap (UTF-8): keep truncating code units until under budget.
  // We prefer code-point truncation to byte-slicing so we never split a
  // surrogate pair or a multi-byte sequence mid-character.
  const enc = new TextEncoder();
  while (enc.encode(out).length > maxLen && out.length > 1) {
    out = out.slice(0, -1);
  }
  out = out.replace(LEADING_DOTS_OR_SPACES, '').replace(TRAILING_DOTS_OR_SPACES, '') || fallback;
  return out;
}

/**
 * Allocate a unique path inside the given namespace, appending `-1`, `-2`, ...
 * before the extension if needed. Mutates the supplied Set.
 */
export function uniquePath(taken: Set<string>, base: string, ext = ''): string {
  const candidate = ext ? `${base}${ext}` : base;
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  for (let i = 1; i < 10_000; i++) {
    const c = ext ? `${base}-${i}${ext}` : `${base}-${i}`;
    if (!taken.has(c)) {
      taken.add(c);
      return c;
    }
  }
  // Astronomically unlikely — fall back to a timestamped suffix.
  const c = ext ? `${base}-${Date.now()}${ext}` : `${base}-${Date.now()}`;
  taken.add(c);
  return c;
}

// --- Manifest types ---------------------------------------------------------

export interface ManifestNote {
  id: string;
  title: string;
  path: string; // relative path inside the zip (notes/...)
  folderId: string | null;
  folderName: string | null;
  pinned: boolean;
  trashed: boolean;
  tagNames: string[];
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
}

export interface ManifestAttachment {
  id: string;
  noteId: string | null;
  filename: string; // original upload filename (display)
  mime: string;
  size: number;
  path: string; // relative path inside the zip (uploads/...)
}

export interface Manifest {
  version: 1;
  exportedAt: string;
  includeTrash: boolean;
  counts: {
    notes: number;
    attachments: number;
  };
  notes: ManifestNote[];
  attachments: ManifestAttachment[];
}

/** Build the manifest JSON from already-computed note/attachment paths. */
export function buildManifest(input: {
  notes: ManifestNote[];
  attachments: ManifestAttachment[];
  includeTrash: boolean;
  now?: Date;
}): Manifest {
  const exportedAt = (input.now ?? new Date()).toISOString();
  return {
    version: 1,
    exportedAt,
    includeTrash: input.includeTrash,
    counts: {
      notes: input.notes.length,
      attachments: input.attachments.length,
    },
    notes: input.notes,
    attachments: input.attachments,
  };
}

// --- YAML frontmatter -------------------------------------------------------

/**
 * Emit a YAML frontmatter block. Minimal subset: only the scalar types we
 * actually need (string, boolean, number, null, string[]). No dependency on a
 * YAML lib because the shape is fixed and the values are ours.
 */
export function toFrontmatter(fields: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(serialiseField(k, v));
  }
  lines.push('---', '');
  return lines.join('\n');
}

function serialiseField(key: string, value: unknown): string {
  if (value === null || value === undefined) return `${key}: null`;
  if (typeof value === 'boolean' || typeof value === 'number') {
    return `${key}: ${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    const items = value.map((v) => `  - ${yamlScalar(String(v))}`).join('\n');
    return `${key}:\n${items}`;
  }
  return `${key}: ${yamlScalar(String(value))}`;
}

function yamlScalar(s: string): string {
  // Always double-quote to keep the serialiser trivial and unambiguous.
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `"${escaped}"`;
}
