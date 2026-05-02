import { afterEach, describe, expect, it } from 'vitest';
import {
  getOidcLabel,
  getProxyEmailHeader,
  getProxyTrustedCidrs,
  getProxyUserHeader,
  isOidcEnabled,
  isPasswordAuthEnabled,
  isProxyAuthEnabled,
  isTotpEnabled,
  oidcAutoProvision,
  oidcTrustEmailForLinking,
} from './mode';

const KEYS = [
  'PASSWORD_AUTH',
  'TOTP_ENABLED',
  'OIDC_ENABLED',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_NAME',
  'OIDC_AUTO_PROVISION',
  'OIDC_TRUST_EMAIL_FOR_LINKING',
  'PROXY_AUTH',
  'PROXY_AUTH_USER_HEADER',
  'PROXY_AUTH_EMAIL_HEADER',
  'PROXY_AUTH_TRUSTED_IPS',
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe('isPasswordAuthEnabled', () => {
  it('defaults to true (no env var)', () => {
    expect(isPasswordAuthEnabled()).toBe(true);
  });
  it('honours explicit false', () => {
    process.env.PASSWORD_AUTH = 'false';
    expect(isPasswordAuthEnabled()).toBe(false);
  });
  it('honours explicit true', () => {
    process.env.PASSWORD_AUTH = '1';
    expect(isPasswordAuthEnabled()).toBe(true);
  });
});

describe('isTotpEnabled', () => {
  it('defaults to false', () => {
    expect(isTotpEnabled()).toBe(false);
  });
  it('flips on for "true"/"on"/"1"/"yes"', () => {
    for (const v of ['true', 'on', '1', 'yes']) {
      process.env.TOTP_ENABLED = v;
      expect(isTotpEnabled()).toBe(true);
    }
  });
});

describe('isOidcEnabled', () => {
  it('is false without all three required env vars', () => {
    process.env.OIDC_ENABLED = 'true';
    expect(isOidcEnabled()).toBe(false);
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    expect(isOidcEnabled()).toBe(false);
    process.env.OIDC_CLIENT_ID = 'x';
    expect(isOidcEnabled()).toBe(false);
  });
  it('is true when ENABLED + all three creds are set', () => {
    process.env.OIDC_ENABLED = 'true';
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'x';
    process.env.OIDC_CLIENT_SECRET = 'y';
    expect(isOidcEnabled()).toBe(true);
  });
  it('is false if ENABLED is unset even with creds', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'x';
    process.env.OIDC_CLIENT_SECRET = 'y';
    expect(isOidcEnabled()).toBe(false);
  });
});

describe('OIDC defaults', () => {
  it('label defaults to SSO', () => {
    expect(getOidcLabel()).toBe('SSO');
  });
  it('label honours OIDC_NAME', () => {
    process.env.OIDC_NAME = 'Authentik';
    expect(getOidcLabel()).toBe('Authentik');
  });
  it('autoProvision and trustEmailForLinking default off', () => {
    expect(oidcAutoProvision()).toBe(false);
    expect(oidcTrustEmailForLinking()).toBe(false);
  });
});

describe('isProxyAuthEnabled', () => {
  it('defaults to false', () => {
    expect(isProxyAuthEnabled()).toBe(false);
  });
  it('flips on with PROXY_AUTH=true', () => {
    process.env.PROXY_AUTH = 'true';
    expect(isProxyAuthEnabled()).toBe(true);
  });
});

describe('proxy header config', () => {
  it('user header defaults to x-authentik-username, lowercased', () => {
    expect(getProxyUserHeader()).toBe('x-authentik-username');
  });
  it('email header defaults to x-authentik-email', () => {
    expect(getProxyEmailHeader()).toBe('x-authentik-email');
  });
  it('overrides honoured (and lowercased)', () => {
    process.env.PROXY_AUTH_USER_HEADER = 'Remote-User';
    expect(getProxyUserHeader()).toBe('remote-user');
  });
  it('trusted CIDRs split + trim, ignore empties', () => {
    process.env.PROXY_AUTH_TRUSTED_IPS = '10.0.0.0/8 ,  192.168.1.1/32 ,';
    expect(getProxyTrustedCidrs()).toEqual(['10.0.0.0/8', '192.168.1.1/32']);
  });
});
