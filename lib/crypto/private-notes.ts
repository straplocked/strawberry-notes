/**
 * Private Notes — client-side cryptography for the per-note opt-in E2EE
 * feature. The server never sees the user's passphrase, recovery code, the
 * derived KEKs, or the unwrapped Note Master Key.
 *
 * Design summary (full spec in docs/technical/private-notes.md):
 *
 *   passphrase ─PBKDF2─►  KEK_p ─wraps─► NMK ─encrypts─► note bodies
 *   recovery   ─PBKDF2─►  KEK_r ─wraps─► NMK
 *
 * Both wraps are stored server-side in `user_encryption`; either can recover
 * the NMK. The NMK is generated once at setup, never rotated unless the user
 * explicitly rotates (out of scope for v1.5).
 *
 * Primitives are WebCrypto-native (no runtime deps). PBKDF2-SHA-256 at 600 000
 * iterations matches OWASP's 2023 recommendation. Argon2id is stronger but
 * has no native WebCrypto implementation; pulling in a WASM polyfill crosses
 * the project's non-bloat line.
 */

const PRIVATE_NOTES_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const KDF_NAME = 'PBKDF2-SHA256' as const;
const KEY_BITS = 256;
const IV_BYTES = 12;
const SALT_BYTES = 16;

// Additional Authenticated Data for the wrap operation. Binds the ciphertext
// to this specific feature so a wrap blob can't be misused as another
// AES-GCM payload elsewhere in the codebase.
const WRAP_AAD = new TextEncoder().encode('sn-private-notes-v1');

// Crockford base32, no I / L / O / U — easy to read aloud, hard to mis-type.
const RC_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type WrapBlob = {
  /** Schema version of the wrap envelope. Currently always 1. */
  v: number;
  kdf: typeof KDF_NAME;
  iters: number;
  /** Base64-encoded 16-byte PBKDF2 salt. */
  salt: string;
  /** Base64-encoded 12-byte AES-GCM IV. */
  iv: string;
  /** Base64-encoded ciphertext+tag (32 bytes NMK + 16-byte tag = 48 bytes). */
  ct: string;
};

export type NoteEncryption = {
  /** Schema version of the per-note envelope. Currently always 1. */
  v: number;
  /** Base64-encoded 12-byte AES-GCM IV. */
  iv: string;
};

export type EncryptedNote = {
  encryption: NoteEncryption;
  /** Base64-encoded AES-GCM ciphertext+tag of `JSON.stringify(doc)`. */
  ciphertext: string;
};

export class WrongSecretError extends Error {
  constructor() {
    super('wrong passphrase or recovery code');
    this.name = 'WrongSecretError';
  }
}

export class UnsupportedVersionError extends Error {
  constructor(v: number) {
    super(`unsupported envelope version: ${v}`);
    this.name = 'UnsupportedVersionError';
  }
}

/* -------------------------------------------------------------------------- */
/* Recovery codes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Generate a 24-character Crockford base32 recovery code (120 bits of
 * entropy), grouped `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. The hyphens are
 * cosmetic; {@link normaliseRecoveryCode} strips them on input.
 */
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(15); // 15 bytes = 120 bits = 24 base32 chars
  crypto.getRandomValues(bytes);
  let buffer = 0;
  let bits = 0;
  let raw = '';
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      raw += RC_ALPHABET[(buffer >> bits) & 0b11111];
    }
  }
  return raw.match(/.{1,4}/g)!.join('-');
}

/**
 * Canonicalise user-entered recovery codes: upper-case, drop separators,
 * coerce visually-ambiguous characters back to the canonical alphabet.
 * Idempotent.
 */
export function normaliseRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
}

/* -------------------------------------------------------------------------- */
/* Salt + IV generation                                                        */
/* -------------------------------------------------------------------------- */

// Use `new Uint8Array(new ArrayBuffer(n))` so the typed view is backed by a
// concrete ArrayBuffer, not an `ArrayBufferLike`. Otherwise TS rejects the
// values as not assignable to WebCrypto's `BufferSource` parameter type.
function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(view);
  return view;
}

export function generateSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_BYTES);
}

function generateIV(): Uint8Array<ArrayBuffer> {
  return randomBytes(IV_BYTES);
}

/* -------------------------------------------------------------------------- */
/* Key derivation + wrap / unwrap                                              */
/* -------------------------------------------------------------------------- */

/**
 * Derive a 256-bit AES-GCM Key Encryption Key from a UTF-8 secret + salt
 * using PBKDF2-SHA-256 at 600 000 iterations. The returned key is
 * non-extractable (the byte material never leaves WebCrypto).
 */
export async function deriveKEK(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    // Cast: caller may pass a `Uint8Array<ArrayBufferLike>` (the default for
    // `new Uint8Array(n)`) which TS refuses as a `BufferSource` since 5.7.
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Convenience wrapper: normalises a user-entered recovery code before
 * deriving its KEK, so trailing hyphens / lowercase entry / O-vs-0
 * confusions all resolve to the same key.
 */
export function deriveKEKFromRecoveryCode(code: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKEK(normaliseRecoveryCode(code), salt);
}

/**
 * Generate a fresh 256-bit AES-GCM Note Master Key. Extractable so it can be
 * wrapped for storage. The unwrapped session copy is re-imported as
 * non-extractable, see {@link unwrapNMK}.
 */
export async function generateNMK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap an NMK with a KEK. Returns the JSON-shaped envelope that gets stored
 * server-side in `user_encryption.{passphrase,recovery}_wrap`.
 */
export async function wrapNMK(
  nmk: CryptoKey,
  kek: CryptoKey,
  salt: Uint8Array,
): Promise<WrapBlob> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', nmk));
  const iv = generateIV();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: WRAP_AAD as BufferSource },
      kek,
      raw as BufferSource,
    ),
  );
  return {
    v: PRIVATE_NOTES_VERSION,
    kdf: KDF_NAME,
    iters: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(ct),
  };
}

/**
 * Unwrap an NMK from its envelope using a KEK. Throws {@link WrongSecretError}
 * when the KEK doesn't decrypt the wrap (= wrong passphrase or recovery code),
 * and {@link UnsupportedVersionError} when the envelope is from a future
 * format version.
 *
 * The returned NMK is non-extractable — its byte material can never leave
 * WebCrypto for the lifetime of the session.
 */
export async function unwrapNMK(blob: WrapBlob, kek: CryptoKey): Promise<CryptoKey> {
  if (blob.v !== PRIVATE_NOTES_VERSION) {
    throw new UnsupportedVersionError(blob.v);
  }
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: WRAP_AAD as BufferSource },
      kek,
      ct as BufferSource,
    );
  } catch {
    throw new WrongSecretError();
  }
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/* -------------------------------------------------------------------------- */
/* Per-note encrypt / decrypt                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Encrypt an arbitrary JSON-serialisable value (typically a ProseMirror doc)
 * with the user's NMK. Each call generates a fresh 12-byte random IV;
 * AES-GCM's birthday bound (~2^32 messages per key with random IVs) is many
 * orders of magnitude beyond a personal notes workspace.
 */
export async function encryptDoc(
  doc: unknown,
  nmk: CryptoKey,
): Promise<EncryptedNote> {
  const plaintext = new TextEncoder().encode(JSON.stringify(doc));
  const iv = generateIV();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, nmk, plaintext as BufferSource),
  );
  return {
    encryption: { v: PRIVATE_NOTES_VERSION, iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(ct),
  };
}

/**
 * Inverse of {@link encryptDoc}. Throws {@link WrongSecretError} when the
 * NMK doesn't decrypt the ciphertext (key/IV mismatch, ciphertext tampering),
 * and {@link UnsupportedVersionError} when the envelope is from a future
 * version.
 */
export async function decryptDoc<T = unknown>(
  ciphertext: string,
  encryption: NoteEncryption,
  nmk: CryptoKey,
): Promise<T> {
  if (encryption.v !== PRIVATE_NOTES_VERSION) {
    throw new UnsupportedVersionError(encryption.v);
  }
  const iv = base64ToBytes(encryption.iv);
  const ct = base64ToBytes(ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      nmk,
      ct as BufferSource,
    );
  } catch {
    throw new WrongSecretError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/* -------------------------------------------------------------------------- */
/* base64 — isomorphic (browser btoa/atob; Node Buffer fallback)              */
/* -------------------------------------------------------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/* -------------------------------------------------------------------------- */
/* Constants exported for tests + UI copy                                      */
/* -------------------------------------------------------------------------- */

export const PRIVATE_NOTES_CONST = {
  VERSION: PRIVATE_NOTES_VERSION,
  PBKDF2_ITERATIONS,
  KDF_NAME,
  KEY_BITS,
  IV_BYTES,
  SALT_BYTES,
} as const;
