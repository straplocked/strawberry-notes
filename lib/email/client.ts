/**
 * SMTP transport — thin wrapper around `nodemailer` so we have one place
 * to read the env, build the transporter, and degrade gracefully when
 * the operator hasn't configured SMTP at all.
 *
 * Env contract (`.env.example` documents the same):
 *
 *   SMTP_HOST       — required; mail server host
 *   SMTP_PORT       — default 587
 *   SMTP_USER       — optional; if set, requires SMTP_PASS
 *   SMTP_PASS       — optional
 *   SMTP_FROM       — required when SMTP_HOST is set; the From: address
 *   SMTP_SECURE     — "true" forces TLS on connect; default false (STARTTLS
 *                     is negotiated as needed by nodemailer).
 *
 * If `SMTP_HOST` or `SMTP_FROM` is unset, `isEmailConfigured()` returns
 * false and `sendMail()` is a no-op (logs once, returns null). Anything
 * that depends on email — currently the password-reset flow — should
 * branch on this and surface a "not configured" message to the user.
 */

import { createTransport, type Transporter } from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  secure: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey: string | null = null;
let unconfiguredLogged = false;

/** Return the live SMTP config or null when the operator hasn't set it up. */
export function readEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;

  const portRaw = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 587;
  const user = process.env.SMTP_USER?.trim() || null;
  const pass = process.env.SMTP_PASS ?? null;
  const secure = (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true';
  return { host, port, user, pass, from, secure };
}

export function isEmailConfigured(): boolean {
  return readEmailConfig() !== null;
}

function buildTransporter(cfg: EmailConfig): Transporter {
  return createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/** Cache the transporter while the SMTP config remains stable. */
function getTransporter(cfg: EmailConfig): Transporter {
  const key = `${cfg.host}|${cfg.port}|${cfg.user ?? ''}|${cfg.secure ? 'tls' : 'starttls'}`;
  if (!cachedTransporter || cachedConfigKey !== key) {
    cachedTransporter = buildTransporter(cfg);
    cachedConfigKey = key;
  }
  return cachedTransporter;
}

/**
 * Send a plain-text + optional-HTML email. Returns `{ ok: false }` and
 * logs once when SMTP is not configured. Errors are caught and surfaced
 * via `error`; callers decide whether to retry / surface to the user.
 */
export async function sendMail(
  message: EmailMessage,
  opts: {
    /** For tests — inject a fake transporter. */
    transporter?: Pick<Transporter, 'sendMail'>;
    /** For tests — override the config (skips env read). */
    config?: EmailConfig;
  } = {},
): Promise<EmailSendResult> {
  const cfg = opts.config ?? readEmailConfig();
  if (!cfg) {
    if (!unconfiguredLogged) {
      console.info(
        '[email] SMTP_HOST/SMTP_FROM not set — email sends are disabled. Self-service password reset will surface a "not configured" message to users.',
      );
      unconfiguredLogged = true;
    }
    return { ok: false, error: 'not_configured' };
  }
  const t = opts.transporter ?? getTransporter(cfg);
  try {
    const info = await t.sendMail({
      from: cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown error';
    return { ok: false, error };
  }
}

/** Test-only — clear the transporter cache between cases. */
export function __resetEmailClientForTests(): void {
  cachedTransporter = null;
  cachedConfigKey = null;
  unconfiguredLogged = false;
}
