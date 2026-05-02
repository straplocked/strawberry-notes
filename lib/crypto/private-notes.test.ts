import { describe, expect, it } from 'vitest';
import {
  decryptDoc,
  deriveKEK,
  deriveKEKFromRecoveryCode,
  encryptDoc,
  generateNMK,
  generateRecoveryCode,
  generateSalt,
  normaliseRecoveryCode,
  PRIVATE_NOTES_CONST,
  unwrapNMK,
  UnsupportedVersionError,
  wrapNMK,
  WrongSecretError,
  type WrapBlob,
} from './private-notes';

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Some sensitive private content that ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'should round-trip' },
        { type: 'text', text: ' through encrypt/decrypt.' },
      ],
    },
  ],
};

describe('generateRecoveryCode', () => {
  it('produces 24 base32 chars in 4-char groups separated by hyphens', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    // 24 chars + 5 hyphens = 29
    expect(code).toHaveLength(29);
  });

  it('produces distinct values across calls (entropy sanity)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateRecoveryCode());
    expect(seen.size).toBe(50);
  });
});

describe('normaliseRecoveryCode', () => {
  it('strips hyphens, upper-cases, and coerces visually-ambiguous chars', () => {
    expect(normaliseRecoveryCode('abcd-iloo-1234')).toBe('ABCD110012' + '34');
    // I → 1, L → 1, O → 0, U → V
    expect(normaliseRecoveryCode('uuuu')).toBe('VVVV');
  });

  it('is idempotent', () => {
    const raw = generateRecoveryCode();
    const once = normaliseRecoveryCode(raw);
    const twice = normaliseRecoveryCode(once);
    expect(twice).toBe(once);
  });
});

describe('deriveKEK', () => {
  it('is deterministic for (secret, salt)', async () => {
    const salt = generateSalt();
    const k1 = await deriveKEK('correct horse battery staple', salt);
    const k2 = await deriveKEK('correct horse battery staple', salt);
    // Keys are non-extractable, so we test determinism by encrypting a known
    // plaintext with each and comparing the (deterministic-given-iv) ciphertext.
    const iv = new Uint8Array(12); // all zeros: only acceptable in tests
    const pt = new TextEncoder().encode('marker');
    const c1 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, pt));
    const c2 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k2, pt));
    expect(Array.from(c1)).toEqual(Array.from(c2));
  });

  it('produces different keys for different salts', async () => {
    const k1 = await deriveKEK('passphrase', generateSalt());
    const k2 = await deriveKEK('passphrase', generateSalt());
    const iv = new Uint8Array(12);
    const pt = new TextEncoder().encode('marker');
    const c1 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, pt));
    const c2 = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k2, pt));
    expect(Array.from(c1)).not.toEqual(Array.from(c2));
  });
});

describe('wrap / unwrap NMK', () => {
  it('round-trips an NMK through a passphrase wrap', async () => {
    const nmk = await generateNMK();
    const salt = generateSalt();
    const kek = await deriveKEK('correct horse battery staple', salt);
    const blob = await wrapNMK(nmk, kek, salt);

    const kek2 = await deriveKEK('correct horse battery staple', salt);
    const recovered = await unwrapNMK(blob, kek2);

    // Verify the recovered NMK can decrypt something the original encrypted.
    const enc = await encryptDoc(sampleDoc, nmk);
    const dec = await decryptDoc(enc.ciphertext, enc.encryption, recovered);
    expect(dec).toEqual(sampleDoc);
  });

  it('round-trips through a recovery-code wrap (with hyphenated input)', async () => {
    const nmk = await generateNMK();
    const salt = generateSalt();
    const code = generateRecoveryCode();
    const kek = await deriveKEKFromRecoveryCode(code, salt);
    const blob = await wrapNMK(nmk, kek, salt);

    // User re-types the code with arbitrary casing / extra hyphens / spaces.
    const messy = code.toLowerCase().replace(/-/g, ' - ');
    const kek2 = await deriveKEKFromRecoveryCode(messy, salt);
    const recovered = await unwrapNMK(blob, kek2);

    const enc = await encryptDoc(sampleDoc, nmk);
    const dec = await decryptDoc(enc.ciphertext, enc.encryption, recovered);
    expect(dec).toEqual(sampleDoc);
  });

  it('throws WrongSecretError on a wrong passphrase', async () => {
    const nmk = await generateNMK();
    const salt = generateSalt();
    const kek = await deriveKEK('correct', salt);
    const blob = await wrapNMK(nmk, kek, salt);

    const wrong = await deriveKEK('incorrect', salt);
    await expect(unwrapNMK(blob, wrong)).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('throws UnsupportedVersionError on a future wrap version', async () => {
    const nmk = await generateNMK();
    const salt = generateSalt();
    const kek = await deriveKEK('passphrase', salt);
    const blob = await wrapNMK(nmk, kek, salt);
    const futureBlob: WrapBlob = { ...blob, v: 99 };
    await expect(unwrapNMK(futureBlob, kek)).rejects.toBeInstanceOf(UnsupportedVersionError);
  });

  it('emits a wrap envelope with the documented shape + sizes', async () => {
    const nmk = await generateNMK();
    const salt = generateSalt();
    const kek = await deriveKEK('passphrase', salt);
    const blob = await wrapNMK(nmk, kek, salt);

    expect(blob.v).toBe(PRIVATE_NOTES_CONST.VERSION);
    expect(blob.kdf).toBe(PRIVATE_NOTES_CONST.KDF_NAME);
    expect(blob.iters).toBe(PRIVATE_NOTES_CONST.PBKDF2_ITERATIONS);
    // 16-byte salt → ceil(16/3)*4 = 24 base64 chars.
    expect(blob.salt).toHaveLength(24);
    // 12-byte iv → ceil(12/3)*4 = 16 base64 chars.
    expect(blob.iv).toHaveLength(16);
    // 32-byte NMK + 16-byte tag = 48 bytes → ceil(48/3)*4 = 64 base64 chars.
    expect(blob.ct).toHaveLength(64);
  });
});

describe('encryptDoc / decryptDoc', () => {
  it('round-trips a ProseMirror-shaped document', async () => {
    const nmk = await generateNMK();
    const enc = await encryptDoc(sampleDoc, nmk);
    const dec = await decryptDoc(enc.ciphertext, enc.encryption, nmk);
    expect(dec).toEqual(sampleDoc);
  });

  it('uses a fresh IV per call (no IV reuse across two encryptions)', async () => {
    const nmk = await generateNMK();
    const a = await encryptDoc(sampleDoc, nmk);
    const b = await encryptDoc(sampleDoc, nmk);
    expect(a.encryption.iv).not.toBe(b.encryption.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('throws WrongSecretError when decrypting with a different NMK', async () => {
    const nmkA = await generateNMK();
    const nmkB = await generateNMK();
    const enc = await encryptDoc(sampleDoc, nmkA);
    await expect(decryptDoc(enc.ciphertext, enc.encryption, nmkB)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });

  it('throws UnsupportedVersionError on a future per-note envelope', async () => {
    const nmk = await generateNMK();
    const enc = await encryptDoc(sampleDoc, nmk);
    await expect(
      decryptDoc(enc.ciphertext, { v: 99, iv: enc.encryption.iv }, nmk),
    ).rejects.toBeInstanceOf(UnsupportedVersionError);
  });

  it('detects ciphertext tampering via the GCM tag', async () => {
    const nmk = await generateNMK();
    const enc = await encryptDoc(sampleDoc, nmk);
    // Flip a bit in the middle of the ciphertext.
    const ctBytes = Uint8Array.from(atob(enc.ciphertext), (c) => c.charCodeAt(0));
    ctBytes[Math.floor(ctBytes.length / 2)] ^= 0x01;
    let bumped = '';
    for (const b of ctBytes) bumped += String.fromCharCode(b);
    const tampered = btoa(bumped);
    await expect(decryptDoc(tampered, enc.encryption, nmk)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  });
});
