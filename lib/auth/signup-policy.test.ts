import { afterEach, describe, expect, it } from 'vitest';
import { isPublicSignupEnabled } from './signup-policy';

afterEach(() => {
  delete process.env.ALLOW_PUBLIC_SIGNUP;
});

describe('isPublicSignupEnabled', () => {
  it('is false when the env var is unset', () => {
    expect(isPublicSignupEnabled()).toBe(false);
  });

  it('is false for the string "false"', () => {
    process.env.ALLOW_PUBLIC_SIGNUP = 'false';
    expect(isPublicSignupEnabled()).toBe(false);
  });

  it('is true for "true", "1", "yes" (case-insensitive)', () => {
    for (const v of ['true', 'TRUE', 'True', '1', 'yes', 'YES']) {
      process.env.ALLOW_PUBLIC_SIGNUP = v;
      expect(isPublicSignupEnabled()).toBe(true);
    }
  });

  it('is false for stray values', () => {
    process.env.ALLOW_PUBLIC_SIGNUP = 'maybe';
    expect(isPublicSignupEnabled()).toBe(false);
  });
});
