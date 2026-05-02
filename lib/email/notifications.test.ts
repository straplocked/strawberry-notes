import { describe, expect, it, vi, beforeEach } from 'vitest';

const { selectMock, isConfiguredMock, sendMailMock, prefMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  isConfiguredMock: vi.fn(() => true),
  sendMailMock: vi.fn().mockResolvedValue({ ok: true }),
  prefMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('../db/client', () => {
  const buildSelect = () => ({
    from: () => ({
      where: () => Promise.resolve(selectMock()),
    }),
  });
  return { db: { select: () => buildSelect() } };
});

vi.mock('./client', () => ({
  isEmailConfigured: isConfiguredMock,
  sendMail: sendMailMock,
}));

vi.mock('./preferences', () => ({
  isNotificationEnabled: prefMock,
}));

import {
  notifyPasswordChanged,
  notifyTokenCreated,
  notifyWebhookCreated,
  notifyWebhookDeadLetter,
} from './notifications';

beforeEach(() => {
  selectMock.mockReset();
  selectMock.mockReturnValue([{ email: 'user@example.com' }]);
  isConfiguredMock.mockReset();
  isConfiguredMock.mockReturnValue(true);
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({ ok: true });
  prefMock.mockReset();
  prefMock.mockResolvedValue(true);
});

async function flush() {
  // Fire helpers are synchronous void-return; let the inner promise chain settle.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('notifyPasswordChanged', () => {
  it('sends when SMTP is on + pref is on', async () => {
    notifyPasswordChanged('user-1', { source: 'self-service reset' });
    await flush();
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe('user@example.com');
    expect(msg.subject).toMatch(/password was changed/);
  });

  it('uses ctx.baseUrl when provided (request-derived host wins over env)', async () => {
    notifyPasswordChanged('user-1', {
      source: 'self-service reset',
      baseUrl: 'http://192.168.1.50:3200',
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('http://192.168.1.50:3200/login');
  });

  it('skips when SMTP is not configured', async () => {
    isConfiguredMock.mockReturnValue(false);
    notifyPasswordChanged('user-1', { source: 'x' });
    await flush();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('skips when the user has the kind disabled', async () => {
    prefMock.mockResolvedValue(false);
    notifyPasswordChanged('user-1', { source: 'x' });
    await flush();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('skips when the user does not exist (no email lookup result)', async () => {
    selectMock.mockReturnValue([]);
    notifyPasswordChanged('ghost', { source: 'x' });
    await flush();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('notifyTokenCreated', () => {
  it('passes the token metadata into the template', async () => {
    notifyTokenCreated('user-1', { tokenName: 'Claude', tokenPrefix: 'snb_abcd1234' });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toMatch(/New personal access token/);
    expect(msg.text).toContain('Claude');
    expect(msg.text).toContain('snb_abcd1234');
  });

  it('threads ctx.baseUrl into the settings link', async () => {
    notifyTokenCreated('user-1', {
      tokenName: 'Claude',
      tokenPrefix: 'snb_abcd1234',
      baseUrl: 'http://192.168.1.50:3200',
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('http://192.168.1.50:3200/settings');
  });
});

describe('notifyWebhookCreated', () => {
  it('lists the configured events', async () => {
    notifyWebhookCreated('user-1', {
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      events: ['note.created', 'note.tagged'],
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('note.created, note.tagged');
  });

  it('threads ctx.baseUrl into the settings link', async () => {
    notifyWebhookCreated('user-1', {
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      events: ['note.created'],
      baseUrl: 'http://192.168.1.50:3200',
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('http://192.168.1.50:3200/settings');
  });
});

describe('notifyWebhookDeadLetter', () => {
  it('reports the failure count + last error', async () => {
    notifyWebhookDeadLetter('user-1', {
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      consecutiveFailures: 5,
      lastError: 'HTTP 503',
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toContain('5 consecutive failures');
    expect(msg.text).toContain('HTTP 503');
  });

  it('falls back to env/localhost when no baseUrl is provided (worker context)', async () => {
    // Worker contexts have no incoming request — the fallback path must still
    // produce a usable link rather than throwing.
    notifyWebhookDeadLetter('user-1', {
      webhookName: 'n8n',
      webhookUrl: 'https://hooks.example.com/x',
      consecutiveFailures: 5,
      lastError: 'HTTP 503',
    });
    await flush();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toMatch(/https?:\/\/[^/]+\/settings/);
  });
});
