import { describe, expect, it } from 'vitest';
import { isValidWebhookUrl, truncateError } from './service';

describe('isValidWebhookUrl', () => {
  it('accepts https and http URLs', () => {
    expect(isValidWebhookUrl('https://hooks.example.com/x')).toBe(true);
    expect(isValidWebhookUrl('http://localhost:8080/x')).toBe(true);
  });

  it('rejects non-http(s) schemes', () => {
    expect(isValidWebhookUrl('ftp://x.com')).toBe(false);
    expect(isValidWebhookUrl('javascript:alert(1)')).toBe(false);
    expect(isValidWebhookUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty / malformed input', () => {
    expect(isValidWebhookUrl('')).toBe(false);
    expect(isValidWebhookUrl('not a url')).toBe(false);
    expect(isValidWebhookUrl('https://')).toBe(false);
  });

  it('rejects absurdly long URLs', () => {
    const url = 'https://example.com/' + 'a'.repeat(2100);
    expect(isValidWebhookUrl(url)).toBe(false);
  });
});

describe('truncateError', () => {
  it('passes short messages through', () => {
    expect(truncateError('boom')).toBe('boom');
  });

  it('caps at 500 chars', () => {
    const long = 'a'.repeat(600);
    expect(truncateError(long).length).toBe(500);
  });
});
