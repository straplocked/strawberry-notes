import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { __resetEmailClientForTests, isEmailConfigured, readEmailConfig, sendMail } from './client';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  __resetEmailClientForTests();
});

afterEach(() => {
  // Restore env between cases — tests poke individual SMTP_* vars.
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE']) {
    if (k in ORIGINAL_ENV) process.env[k] = ORIGINAL_ENV[k];
    else delete process.env[k];
  }
});

describe('readEmailConfig', () => {
  it('returns null when SMTP_HOST is unset', () => {
    delete process.env.SMTP_HOST;
    process.env.SMTP_FROM = 'noreply@example.com';
    expect(readEmailConfig()).toBeNull();
    expect(isEmailConfigured()).toBe(false);
  });

  it('returns null when SMTP_FROM is unset', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    delete process.env.SMTP_FROM;
    expect(readEmailConfig()).toBeNull();
  });

  it('returns the config with sensible defaults', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_SECURE;
    const cfg = readEmailConfig();
    expect(cfg).toEqual({
      host: 'smtp.example.com',
      port: 587,
      user: null,
      pass: null,
      from: 'noreply@example.com',
      secure: false,
    });
  });

  it('honours SMTP_PORT and SMTP_SECURE=true', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'TRUE';
    const cfg = readEmailConfig();
    expect(cfg).toMatchObject({ port: 465, secure: true });
  });

  it('falls back to port 587 when SMTP_PORT is garbage', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.SMTP_PORT = 'not-a-port';
    expect(readEmailConfig()?.port).toBe(587);
  });

  it('binds user/pass together when both are set', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_FROM = 'noreply@example.com';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASS = 'hunter2';
    const cfg = readEmailConfig();
    expect(cfg?.user).toBe('mailer');
    expect(cfg?.pass).toBe('hunter2');
  });
});

describe('sendMail', () => {
  it('returns ok:false / not_configured when SMTP is not set up', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    const res = await sendMail({ to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('not_configured');
  });

  it('delegates to the transporter when configured and reports success', async () => {
    const sendMailMock = vi.fn().mockResolvedValue({ messageId: '<abc@host>' });
    const cfg = {
      host: 'smtp.example.com',
      port: 587,
      user: null,
      pass: null,
      from: 'noreply@example.com',
      secure: false,
    };
    const res = await sendMail(
      { to: 'a@b.com', subject: 's', text: 't', html: '<p>t</p>' },
      { config: cfg, transporter: { sendMail: sendMailMock } },
    );
    expect(res.ok).toBe(true);
    expect(res.messageId).toBe('<abc@host>');
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'a@b.com',
      subject: 's',
      text: 't',
      html: '<p>t</p>',
    });
  });

  it('catches transporter errors and returns ok:false with the message', async () => {
    const cfg = {
      host: 'smtp.example.com',
      port: 587,
      user: null,
      pass: null,
      from: 'noreply@example.com',
      secure: false,
    };
    const transporter = { sendMail: vi.fn().mockRejectedValue(new Error('connect refused')) };
    const res = await sendMail({ to: 'a@b.com', subject: 's', text: 't' }, { config: cfg, transporter });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('connect refused');
  });
});
