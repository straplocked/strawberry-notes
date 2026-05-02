'use client';

import { create } from 'zustand';
import { api } from '../api/client';
import {
  decryptDoc,
  deriveKEK,
  deriveKEKFromRecoveryCode,
  encryptDoc,
  generateNMK,
  generateRecoveryCode,
  generateSalt,
  unwrapNMK,
  wrapNMK,
  WrongSecretError,
} from '../crypto/private-notes';
import type {
  EncryptedNote,
  NoteEncryption,
  WrapBlob,
} from '../crypto/private-notes';
import type { PMDoc, PrivateNotesMaterial } from '../types';

/**
 * Auto-lock window. The interval timer wakes every 30 s and locks if the
 * user hasn't bumped activity within `autoLockMin` minutes. Tied to a
 * Zustand setting so the user can override from Settings → Privacy.
 */
const DEFAULT_AUTO_LOCK_MIN = 60;
const ACTIVITY_TICK_MS = 30_000;

const BROADCAST_CHANNEL = 'sn-private-notes';
const BROADCAST_LOCK = { type: 'lock' as const };

/**
 * Re-exporting the canonical wrap shape so callers (settings UI, modals)
 * import from one place.
 */
export type PrivateNotesWrapBlob = WrapBlob;

export type Status = 'unconfigured' | 'locked' | 'unlocked';

export interface PrivateNotesState {
  /** Coarse status used by all UI gates. */
  status: Status;
  /** True while a fetch / setup / unlock is in flight. */
  busy: boolean;
  /**
   * The unwrapped Note Master Key. **Never persisted, never serialised.**
   * `null` whenever `status !== 'unlocked'`. The CryptoKey is non-extractable
   * so its byte material can't be dumped from JS even with this reference.
   */
  nmk: CryptoKey | null;
  /** Server-supplied wraps, cached after the first GET. Null until fetched. */
  material: PrivateNotesMaterial | null;
  /** Number of private notes the user owns. Updated on `refreshStatus`. */
  privateCount: number;
  /** Wall-clock millisecond timestamp of the last unlock or activity bump. */
  lastActivityAt: number | null;
  /** Auto-lock timeout in minutes. User-tunable. */
  autoLockMin: number;
  /** Last error surfaced from any operation (sticky until cleared by the next call). */
  lastError: string | null;

  /* ---------------- bootstrap + status ---------------- */

  /**
   * Lazy-load the wrap material + status. Safe to call repeatedly; coalesces.
   * Resolves the `status` to either `'unconfigured'` (no setup row) or
   * `'locked'` (setup but no in-memory NMK).
   */
  hydrate: () => Promise<void>;

  /** Re-fetch the privateCount (after a lock/unlock toggle). */
  refreshStatus: () => Promise<void>;

  /* ---------------- setup / change / disable ---------------- */

  /**
   * First-time setup. Generates a fresh NMK + recovery code, wraps both,
   * POSTs to the server, and leaves the store in `'unlocked'` state.
   * Returns the recovery code so the caller can show it once.
   */
  setup: (passphrase: string) => Promise<{ recoveryCode: string }>;

  /**
   * Change the passphrase. Requires the user's *current* passphrase to
   * unwrap an extractable copy of the NMK; the new passphrase derives a
   * fresh KEK that re-wraps it. The session NMK reference is replaced so
   * subsequent operations use the new wrap.
   */
  changePassphrase: (currentPassphrase: string, newPassphrase: string) => Promise<void>;

  /**
   * Regenerate the recovery code. Requires the current passphrase for the
   * same reason as {@link changePassphrase}. The old recovery code stops
   * working as soon as the server accepts the new wrap. Returns the new
   * code (shown once).
   */
  regenerateRecoveryCode: (currentPassphrase: string) => Promise<{ recoveryCode: string }>;

  /**
   * Disable the feature. Server refuses if any private notes exist. On
   * success the store resets to `'unconfigured'`.
   */
  disable: () => Promise<void>;

  /* ---------------- session: unlock / lock ---------------- */

  /** Try to unwrap the NMK with the user-typed passphrase. */
  unlockWithPassphrase: (passphrase: string) => Promise<void>;

  /** Same as {@link unlockWithPassphrase} but normalises a recovery code first. */
  unlockWithRecoveryCode: (code: string) => Promise<void>;

  /**
   * Drop the NMK reference. Idempotent. Broadcasts to other tabs so the
   * whole browser locks together.
   */
  lock: (opts?: { broadcast?: boolean }) => void;

  /** Refresh `lastActivityAt`. Called from editor / list interactions. */
  bumpActivity: () => void;

  /** Set the auto-lock minutes (and persist to localStorage). */
  setAutoLockMin: (m: number) => void;

  /* ---------------- per-note operations ---------------- */

  /** Encrypt a PMDoc with the in-memory NMK. Throws if locked. */
  encryptNote: (doc: PMDoc) => Promise<EncryptedNote>;

  /** Decrypt a private note's body. Throws if locked or on tampered ciphertext. */
  decryptNote: (ciphertext: string, encryption: NoteEncryption) => Promise<PMDoc>;
}

const AUTO_LOCK_KEY = 'sn-pn-auto-lock-min';

function loadAutoLockMin(): number {
  if (typeof window === 'undefined') return DEFAULT_AUTO_LOCK_MIN;
  try {
    const raw = window.localStorage.getItem(AUTO_LOCK_KEY);
    if (!raw) return DEFAULT_AUTO_LOCK_MIN;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 24 * 60) return DEFAULT_AUTO_LOCK_MIN;
    return Math.floor(n);
  } catch {
    return DEFAULT_AUTO_LOCK_MIN;
  }
}

let broadcastChannel: BroadcastChannel | null = null;
let activityTicker: ReturnType<typeof setInterval> | null = null;
let pageHideHandler: (() => void) | null = null;

function ensureBroadcast(onLock: () => void) {
  if (typeof window === 'undefined') return;
  if (broadcastChannel) return;
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL);
    broadcastChannel.onmessage = (e) => {
      if (e.data && typeof e.data === 'object' && 'type' in e.data && e.data.type === 'lock') {
        onLock();
      }
    };
  } catch {
    // Older browsers without BroadcastChannel — degrade silently. The
    // single-tab path still works; cross-tab sync is best-effort.
    broadcastChannel = null;
  }
}

function ensureActivityTicker(onTick: () => void) {
  if (typeof window === 'undefined') return;
  if (activityTicker) return;
  activityTicker = setInterval(onTick, ACTIVITY_TICK_MS);
}

function ensurePageHideListener(onHide: () => void) {
  if (typeof window === 'undefined') return;
  if (pageHideHandler) return;
  pageHideHandler = onHide;
  window.addEventListener('pagehide', pageHideHandler);
}

export const usePrivateNotesStore = create<PrivateNotesState>((set, get) => ({
  status: 'unconfigured',
  busy: false,
  nmk: null,
  material: null,
  privateCount: 0,
  lastActivityAt: null,
  autoLockMin: DEFAULT_AUTO_LOCK_MIN,
  lastError: null,

  /* ---------------- bootstrap + status ---------------- */

  async hydrate() {
    if (get().busy) return;
    set({ busy: true, lastError: null, autoLockMin: loadAutoLockMin() });
    try {
      const status = await api.privateNotes.status();
      // The wrap material is fetched lazily — only when the user actually
      // needs to unlock. Avoids paying for the round-trip on every page load
      // for users who haven't enabled the feature.
      let material = get().material;
      if (status.configured && !material) {
        try {
          material = await api.privateNotes.getWrap();
        } catch {
          material = null;
        }
      }
      set({
        material,
        privateCount: status.privateCount,
        status: !status.configured ? 'unconfigured' : get().nmk ? 'unlocked' : 'locked',
      });
    } catch (err) {
      set({ lastError: (err as Error).message });
    } finally {
      set({ busy: false });
    }

    // Wire up the singletons once we know the user has at least visited the
    // privacy surface. Locking when no NMK is held is a no-op anyway.
    ensureBroadcast(() => {
      if (get().nmk) get().lock({ broadcast: false });
    });
    ensureActivityTicker(() => {
      const { lastActivityAt, autoLockMin, nmk } = get();
      if (!nmk || !lastActivityAt) return;
      if (Date.now() - lastActivityAt > autoLockMin * 60_000) {
        get().lock();
      }
    });
    ensurePageHideListener(() => {
      if (get().nmk) get().lock({ broadcast: true });
    });
  },

  async refreshStatus() {
    try {
      const s = await api.privateNotes.status();
      set({
        privateCount: s.privateCount,
        status: !s.configured ? 'unconfigured' : get().nmk ? 'unlocked' : 'locked',
      });
    } catch (err) {
      set({ lastError: (err as Error).message });
    }
  },

  /* ---------------- setup ---------------- */

  async setup(passphrase) {
    if (passphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');
    set({ busy: true, lastError: null });
    try {
      const recoveryCode = generateRecoveryCode();
      const passphraseSalt = generateSalt();
      const recoverySalt = generateSalt();
      const [passphraseKEK, recoveryKEK] = await Promise.all([
        deriveKEK(passphrase, passphraseSalt),
        deriveKEKFromRecoveryCode(recoveryCode, recoverySalt),
      ]);
      const nmk = await generateNMK();
      const [passphraseWrap, recoveryWrap] = await Promise.all([
        wrapNMK(nmk, passphraseKEK, passphraseSalt),
        wrapNMK(nmk, recoveryKEK, recoverySalt),
      ]);
      const material = await api.privateNotes.setup({ passphraseWrap, recoveryWrap });
      // Re-import the NMK as non-extractable for the session. The setup
      // flow needed it extractable so we could wrap it; once stored on the
      // server, the in-memory copy is downgraded so a debugger / DOM dump
      // can't pull the raw bytes. Rotation paths (change passphrase /
      // regenerate code) re-derive an extractable copy from the wrap +
      // current passphrase on demand.
      const sessionNmk = await reimportNonExtractable(nmk);
      set({
        material,
        nmk: sessionNmk,
        status: 'unlocked',
        lastActivityAt: Date.now(),
      });
      return { recoveryCode };
    } catch (err) {
      set({ lastError: (err as Error).message });
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  /* ---------------- change passphrase ---------------- */

  async changePassphrase(currentPassphrase, newPassphrase) {
    if (newPassphrase.length < 8) throw new Error('Passphrase must be at least 8 characters.');
    const material = get().material ?? (await api.privateNotes.getWrap().catch(() => null));
    if (!material) throw new Error('Private Notes is not configured.');
    set({ busy: true, lastError: null });
    try {
      // Unwrap the NMK with the *old* passphrase — extractable, so we can
      // re-wrap with the new one. Throws WrongSecretError if the current
      // passphrase doesn't match the stored wrap.
      const oldSalt = base64ToBytes(material.passphraseWrap.salt);
      const oldKek = await deriveKEK(currentPassphrase, oldSalt);
      const extractableNmk = await unwrapNMK(material.passphraseWrap, oldKek, {
        extractable: true,
      });

      const newSalt = generateSalt();
      const newKek = await deriveKEK(newPassphrase, newSalt);
      const newWrap = await wrapNMK(extractableNmk, newKek, newSalt);
      await api.privateNotes.changePassphrase({ passphraseWrap: newWrap });

      // Replace the cached material + downgrade the session NMK to
      // non-extractable for the rest of the session. The session NMK is
      // unchanged in *value* — only the wrap changed — so encryption /
      // decryption of existing notes continues to work.
      const sessionNmk = await reimportNonExtractable(extractableNmk);
      set({
        material: { ...material, passphraseWrap: newWrap, updatedAt: new Date().toISOString() },
        nmk: sessionNmk,
        lastActivityAt: Date.now(),
      });
    } catch (err) {
      const msg =
        err instanceof WrongSecretError ? 'Current passphrase is incorrect.' : (err as Error).message;
      set({ lastError: msg });
      throw new Error(msg);
    } finally {
      set({ busy: false });
    }
  },

  /* ---------------- regenerate recovery code ---------------- */

  async regenerateRecoveryCode(currentPassphrase) {
    const material = get().material ?? (await api.privateNotes.getWrap().catch(() => null));
    if (!material) throw new Error('Private Notes is not configured.');
    set({ busy: true, lastError: null });
    try {
      // Same unwrap-then-rewrap dance as changePassphrase. The recovery
      // wrap is the one being replaced; the passphrase wrap stays put.
      const passSalt = base64ToBytes(material.passphraseWrap.salt);
      const passKek = await deriveKEK(currentPassphrase, passSalt);
      const extractableNmk = await unwrapNMK(material.passphraseWrap, passKek, {
        extractable: true,
      });

      const recoveryCode = generateRecoveryCode();
      const recoverySalt = generateSalt();
      const recoveryKek = await deriveKEKFromRecoveryCode(recoveryCode, recoverySalt);
      const newWrap = await wrapNMK(extractableNmk, recoveryKek, recoverySalt);
      await api.privateNotes.regenerateRecovery({ recoveryWrap: newWrap });

      const sessionNmk = await reimportNonExtractable(extractableNmk);
      set({
        material: { ...material, recoveryWrap: newWrap, updatedAt: new Date().toISOString() },
        nmk: sessionNmk,
        lastActivityAt: Date.now(),
      });
      return { recoveryCode };
    } catch (err) {
      const msg =
        err instanceof WrongSecretError ? 'Current passphrase is incorrect.' : (err as Error).message;
      set({ lastError: msg });
      throw new Error(msg);
    } finally {
      set({ busy: false });
    }
  },

  /* ---------------- disable ---------------- */

  async disable() {
    set({ busy: true, lastError: null });
    try {
      await api.privateNotes.disable();
      set({
        status: 'unconfigured',
        nmk: null,
        material: null,
        privateCount: 0,
        lastActivityAt: null,
      });
    } catch (err) {
      // The 409 case carries `{ error: "has private notes", privateCount: N }`
      // — refresh status so the UI can render the migration hint accurately.
      set({ lastError: (err as Error).message });
      await get().refreshStatus();
      throw err;
    } finally {
      set({ busy: false });
    }
  },

  /* ---------------- session: unlock ---------------- */

  async unlockWithPassphrase(passphrase) {
    const material = get().material ?? (await api.privateNotes.getWrap().catch(() => null));
    if (!material) throw new Error('Private Notes is not configured.');
    set({ busy: true, lastError: null });
    try {
      const salt = base64ToBytes(material.passphraseWrap.salt);
      const kek = await deriveKEK(passphrase, salt);
      const nmk = await unwrapNMK(material.passphraseWrap, kek);
      set({
        material,
        nmk,
        status: 'unlocked',
        lastActivityAt: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof WrongSecretError ? 'Incorrect passphrase.' : (err as Error).message;
      set({ lastError: msg });
      throw new Error(msg);
    } finally {
      set({ busy: false });
    }
  },

  async unlockWithRecoveryCode(code) {
    const material = get().material ?? (await api.privateNotes.getWrap().catch(() => null));
    if (!material) throw new Error('Private Notes is not configured.');
    set({ busy: true, lastError: null });
    try {
      const salt = base64ToBytes(material.recoveryWrap.salt);
      const kek = await deriveKEKFromRecoveryCode(code, salt);
      const nmk = await unwrapNMK(material.recoveryWrap, kek);
      set({
        material,
        nmk,
        status: 'unlocked',
        lastActivityAt: Date.now(),
      });
    } catch (err) {
      const msg =
        err instanceof WrongSecretError ? 'Incorrect recovery code.' : (err as Error).message;
      set({ lastError: msg });
      throw new Error(msg);
    } finally {
      set({ busy: false });
    }
  },

  lock(opts = {}) {
    const broadcast = opts.broadcast ?? true;
    set({ nmk: null, status: get().material ? 'locked' : 'unconfigured', lastActivityAt: null });
    if (broadcast && broadcastChannel) {
      try {
        broadcastChannel.postMessage(BROADCAST_LOCK);
      } catch {
        /* ignore */
      }
    }
  },

  bumpActivity() {
    if (!get().nmk) return;
    set({ lastActivityAt: Date.now() });
  },

  setAutoLockMin(m) {
    const clamped = Math.max(1, Math.min(24 * 60, Math.floor(m)));
    set({ autoLockMin: clamped });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AUTO_LOCK_KEY, String(clamped));
      } catch {
        /* ignore */
      }
    }
  },

  /* ---------------- per-note ops ---------------- */

  async encryptNote(doc) {
    const { nmk } = get();
    if (!nmk) throw new Error('Private Notes is locked. Unlock to save.');
    get().bumpActivity();
    return encryptDoc(doc, nmk);
  },

  async decryptNote(ciphertext, encryption) {
    const { nmk } = get();
    if (!nmk) throw new Error('Private Notes is locked. Unlock to view.');
    get().bumpActivity();
    return decryptDoc<PMDoc>(ciphertext, encryption, nmk);
  },
}));

/**
 * Re-import a freshly generated extractable NMK as a non-extractable session
 * key. Drops the ability to wrap it again, but that's deliberate — once setup
 * has shipped both wraps to the server, the in-memory copy never needs to be
 * exported again for the lifetime of the unlock.
 */
async function reimportNonExtractable(nmk: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', nmk);
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
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
