import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, NOTIFICATION_KINDS } from './preferences';

describe('NOTIFICATION_KINDS', () => {
  it('lists exactly the four toggleable transactional notifications', () => {
    expect(NOTIFICATION_KINDS).toEqual([
      'passwordChanged',
      'tokenCreated',
      'webhookCreated',
      'webhookDeadLetter',
    ]);
  });

  it('does not include the signup-confirmation email — that is operator-level', () => {
    expect(NOTIFICATION_KINDS).not.toContain('emailConfirmation');
  });
});

describe('DEFAULT_PREFERENCES', () => {
  it('defaults every kind ON — they are security alerts', () => {
    for (const k of NOTIFICATION_KINDS) {
      expect(DEFAULT_PREFERENCES[k]).toBe(true);
    }
  });

  it('has exactly the same keys as NOTIFICATION_KINDS', () => {
    expect(Object.keys(DEFAULT_PREFERENCES).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });
});
