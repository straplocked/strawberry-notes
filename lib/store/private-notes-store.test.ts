import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- API client mock --------------------------------------------------------
// Captures setup/changePassphrase/regenerate calls so we can assert the
// store sends well-shaped wraps to the server. Status is configurable per
// test via `apiState`.

interface ApiState {
  configured: boolean;
  privateCount: number;
  material: {
    version: number;
    passphraseWrap: unknown;
    recoveryWrap: unknown;
    createdAt: string;
    updatedAt: string;
  } | null;
  setupCalls: Array<{ passphraseWrap: unknown; recoveryWrap: unknown }>;
  passphraseCalls: Array<{ passphraseWrap: unknown }>;
  recoveryCalls: Array<{ recoveryWrap: unknown }>;
  disableCalls: number;
}

const apiState: ApiState = {
  configured: false,
  privateCount: 0,
  material: null,
  setupCalls: [],
  passphraseCalls: [],
  recoveryCalls: [],
  disableCalls: 0,
};

vi.mock('../api/client', () => ({
  api: {
    privateNotes: {
      status: vi.fn(async () => ({
        configured: apiState.configured,
        privateCount: apiState.privateCount,
      })),
      getWrap: vi.fn(async () => {
        if (!apiState.material) throw new Error('404');
        return apiState.material;
      }),
      setup: vi.fn(async (input: { passphraseWrap: unknown; recoveryWrap: unknown }) => {
        apiState.setupCalls.push(input);
        const material = {
          version: 1,
          passphraseWrap: input.passphraseWrap,
          recoveryWrap: input.recoveryWrap,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        apiState.material = material;
        apiState.configured = true;
        return material;
      }),
      changePassphrase: vi.fn(async (input: { passphraseWrap: unknown }) => {
        apiState.passphraseCalls.push(input);
        if (apiState.material) apiState.material.passphraseWrap = input.passphraseWrap;
        return { ok: true };
      }),
      regenerateRecovery: vi.fn(async (input: { recoveryWrap: unknown }) => {
        apiState.recoveryCalls.push(input);
        if (apiState.material) apiState.material.recoveryWrap = input.recoveryWrap;
        return { ok: true };
      }),
      disable: vi.fn(async () => {
        apiState.disableCalls += 1;
        apiState.material = null;
        apiState.configured = false;
        return { ok: true };
      }),
    },
  },
}));

import { usePrivateNotesStore } from './private-notes-store';

function resetState() {
  apiState.configured = false;
  apiState.privateCount = 0;
  apiState.material = null;
  apiState.setupCalls.length = 0;
  apiState.passphraseCalls.length = 0;
  apiState.recoveryCalls.length = 0;
  apiState.disableCalls = 0;
  // Drop in-memory key material between tests.
  usePrivateNotesStore.setState({
    status: 'unconfigured',
    busy: false,
    nmk: null,
    material: null,
    privateCount: 0,
    lastActivityAt: null,
    autoLockMin: 60,
    lastError: null,
  });
}

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('setup', () => {
  it('generates an NMK + recovery code and persists both wraps to the server', async () => {
    const { setup } = usePrivateNotesStore.getState();
    const { recoveryCode } = await setup('correct horse battery staple');

    expect(recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    expect(apiState.setupCalls).toHaveLength(1);
    const call = apiState.setupCalls[0];
    expect(call.passphraseWrap).toMatchObject({
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iters: 600_000,
    });
    expect(call.recoveryWrap).toMatchObject({
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iters: 600_000,
    });

    const state = usePrivateNotesStore.getState();
    expect(state.status).toBe('unlocked');
    expect(state.nmk).not.toBeNull();
    expect(state.material).not.toBeNull();
  });

  it('rejects passphrases shorter than 8 characters', async () => {
    const { setup } = usePrivateNotesStore.getState();
    await expect(setup('short')).rejects.toThrow(/at least 8/);
    expect(apiState.setupCalls).toHaveLength(0);
  });
});

describe('lock / unlock cycle', () => {
  it('unlock with the correct passphrase restores the NMK', async () => {
    // Bootstrap: do a setup so the wraps exist.
    await usePrivateNotesStore.getState().setup('passphrase-one');

    // Simulate a session boundary: lock + drop the in-memory NMK.
    usePrivateNotesStore.getState().lock({ broadcast: false });
    expect(usePrivateNotesStore.getState().status).toBe('locked');
    expect(usePrivateNotesStore.getState().nmk).toBeNull();

    await usePrivateNotesStore.getState().unlockWithPassphrase('passphrase-one');
    expect(usePrivateNotesStore.getState().status).toBe('unlocked');
    expect(usePrivateNotesStore.getState().nmk).not.toBeNull();
  });

  it('unlock with the wrong passphrase throws and leaves the store locked', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    usePrivateNotesStore.getState().lock({ broadcast: false });

    await expect(
      usePrivateNotesStore.getState().unlockWithPassphrase('wrong-passphrase'),
    ).rejects.toThrow(/incorrect passphrase/i);
    expect(usePrivateNotesStore.getState().status).toBe('locked');
    expect(usePrivateNotesStore.getState().nmk).toBeNull();
  });

  it('unlock with a recovery code works after lock', async () => {
    const { recoveryCode } = await usePrivateNotesStore.getState().setup('passphrase-one');
    usePrivateNotesStore.getState().lock({ broadcast: false });

    await usePrivateNotesStore.getState().unlockWithRecoveryCode(recoveryCode);
    expect(usePrivateNotesStore.getState().status).toBe('unlocked');
  });

  it('lock() clears nmk + lastActivityAt', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    expect(usePrivateNotesStore.getState().lastActivityAt).not.toBeNull();
    usePrivateNotesStore.getState().lock({ broadcast: false });
    expect(usePrivateNotesStore.getState().nmk).toBeNull();
    expect(usePrivateNotesStore.getState().lastActivityAt).toBeNull();
  });
});

describe('encryptNote / decryptNote', () => {
  it('round-trips a PMDoc through the in-memory NMK', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    const doc: { type: 'doc'; content: unknown[] } = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    };
    const enc = await usePrivateNotesStore.getState().encryptNote(doc);
    const dec = await usePrivateNotesStore.getState().decryptNote(enc.ciphertext, enc.encryption);
    expect(dec).toEqual(doc);
  });

  it('refuses to encrypt when locked', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    usePrivateNotesStore.getState().lock({ broadcast: false });
    await expect(
      usePrivateNotesStore.getState().encryptNote({ type: 'doc' }),
    ).rejects.toThrow(/locked/i);
  });

  it('refuses to decrypt when locked', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    const enc = await usePrivateNotesStore.getState().encryptNote({ type: 'doc' });
    usePrivateNotesStore.getState().lock({ broadcast: false });
    await expect(
      usePrivateNotesStore.getState().decryptNote(enc.ciphertext, enc.encryption),
    ).rejects.toThrow(/locked/i);
  });
});

describe('changePassphrase', () => {
  it('rotates the passphrase wrap when the current passphrase is correct', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    const oldWrap = apiState.material!.passphraseWrap;

    await usePrivateNotesStore
      .getState()
      .changePassphrase('passphrase-one', 'passphrase-two-much-longer');
    expect(apiState.passphraseCalls).toHaveLength(1);
    expect(apiState.material!.passphraseWrap).not.toEqual(oldWrap);

    // The new passphrase unlocks. Lock first to force a real unwrap path.
    usePrivateNotesStore.getState().lock({ broadcast: false });
    await usePrivateNotesStore.getState().unlockWithPassphrase('passphrase-two-much-longer');
    expect(usePrivateNotesStore.getState().status).toBe('unlocked');
  });

  it('rejects when the current passphrase is wrong', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    await expect(
      usePrivateNotesStore.getState().changePassphrase('wrong', 'passphrase-two-much-longer'),
    ).rejects.toThrow(/current passphrase is incorrect/i);
    expect(apiState.passphraseCalls).toHaveLength(0);
  });

  it('rejects when the new passphrase is too short', async () => {
    await usePrivateNotesStore.getState().setup('passphrase-one');
    await expect(
      usePrivateNotesStore.getState().changePassphrase('passphrase-one', 'short'),
    ).rejects.toThrow(/at least 8/);
    expect(apiState.passphraseCalls).toHaveLength(0);
  });
});

describe('regenerateRecoveryCode', () => {
  it('rotates the recovery wrap and returns a fresh code', async () => {
    const { recoveryCode: original } = await usePrivateNotesStore
      .getState()
      .setup('passphrase-one');
    const oldWrap = apiState.material!.recoveryWrap;

    const { recoveryCode: fresh } = await usePrivateNotesStore
      .getState()
      .regenerateRecoveryCode('passphrase-one');
    expect(fresh).not.toBe(original);
    expect(apiState.recoveryCalls).toHaveLength(1);
    expect(apiState.material!.recoveryWrap).not.toEqual(oldWrap);

    // The fresh code unlocks; the original one no longer does.
    usePrivateNotesStore.getState().lock({ broadcast: false });
    await usePrivateNotesStore.getState().unlockWithRecoveryCode(fresh);
    expect(usePrivateNotesStore.getState().status).toBe('unlocked');

    usePrivateNotesStore.getState().lock({ broadcast: false });
    await expect(
      usePrivateNotesStore.getState().unlockWithRecoveryCode(original),
    ).rejects.toThrow(/incorrect recovery code/i);
  });
});

describe('autoLockMin persistence', () => {
  it('clamps below 1 and above 1440', () => {
    const { setAutoLockMin } = usePrivateNotesStore.getState();
    setAutoLockMin(0);
    expect(usePrivateNotesStore.getState().autoLockMin).toBe(1);
    setAutoLockMin(99999);
    expect(usePrivateNotesStore.getState().autoLockMin).toBe(1440);
  });
});

describe('hydrate', () => {
  it('reflects the server-side configured + privateCount status', async () => {
    apiState.configured = true;
    apiState.privateCount = 3;
    apiState.material = {
      version: 1,
      // The shape doesn't matter for hydrate — the store only checks
      // existence; unwrap happens later at unlock time.
      passphraseWrap: { v: 1, kdf: 'PBKDF2-SHA256', iters: 600_000, salt: 'x', iv: 'y', ct: 'z' },
      recoveryWrap: { v: 1, kdf: 'PBKDF2-SHA256', iters: 600_000, salt: 'a', iv: 'b', ct: 'c' },
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    };

    await usePrivateNotesStore.getState().hydrate();
    const s = usePrivateNotesStore.getState();
    expect(s.status).toBe('locked');
    expect(s.privateCount).toBe(3);
    expect(s.material).not.toBeNull();
  });

  it('lands at "unconfigured" when the server says so', async () => {
    await usePrivateNotesStore.getState().hydrate();
    expect(usePrivateNotesStore.getState().status).toBe('unconfigured');
  });
});
