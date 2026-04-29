import { createHash, createHmac, randomBytes } from 'node:crypto';

const SECRET_PREFIX = 'whsec_';
const SECRET_BYTES = 32;

/** Generate a fresh webhook secret with the `whsec_` prefix + 64 hex chars. */
export function generateSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('hex')}`;
}

/** SHA-256 hex hash. The DB only ever sees this — the raw secret is shown to the operator once. */
export function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * HMAC-SHA-256 of `body` keyed by `secret`. Hex-encoded.
 *
 * Receivers verify with the same algorithm against the raw request body —
 * the `X-Strawberry-Signature` header carries `sha256=<hex>` so we can
 * version the algorithm later without breaking existing consumers.
 */
export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Format the signature for the `X-Strawberry-Signature` HTTP header. */
export function signatureHeader(secret: string, body: string): string {
  return `sha256=${signPayload(secret, body)}`;
}
