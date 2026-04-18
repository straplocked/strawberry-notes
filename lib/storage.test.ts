import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extForMime, isAllowedMime, maxUploadBytes, uploadsDir } from './storage';

const originalEnv = { ...process.env };

describe('storage helpers', () => {
  beforeEach(() => {
    delete process.env.UPLOAD_DIR;
    delete process.env.MAX_UPLOAD_MB;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isAllowedMime', () => {
    it.each([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'image/avif',
    ])('allows %s', (mime) => {
      expect(isAllowedMime(mime)).toBe(true);
    });

    it.each([
      'application/pdf',
      'text/html',
      'image/bmp',
      'image/tiff',
      'application/octet-stream',
      '',
      'IMAGE/PNG',
    ])('rejects %s', (mime) => {
      expect(isAllowedMime(mime)).toBe(false);
    });
  });

  describe('extForMime', () => {
    it('maps every allowed mime to a sensible extension', () => {
      expect(extForMime('image/png')).toBe('png');
      expect(extForMime('image/jpeg')).toBe('jpg');
      expect(extForMime('image/webp')).toBe('webp');
      expect(extForMime('image/gif')).toBe('gif');
      expect(extForMime('image/svg+xml')).toBe('svg');
      expect(extForMime('image/avif')).toBe('avif');
    });

    it('falls back to "bin" for unknown mimes', () => {
      expect(extForMime('application/pdf')).toBe('bin');
      expect(extForMime('')).toBe('bin');
    });
  });

  describe('maxUploadBytes', () => {
    it('defaults to 10 MiB when MAX_UPLOAD_MB is unset', () => {
      expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
    });

    it('honours the MAX_UPLOAD_MB env var', () => {
      process.env.MAX_UPLOAD_MB = '25';
      expect(maxUploadBytes()).toBe(25 * 1024 * 1024);
    });

    it('floors to 1 MiB when the env var is zero or negative', () => {
      process.env.MAX_UPLOAD_MB = '0';
      expect(maxUploadBytes()).toBe(1 * 1024 * 1024);
      process.env.MAX_UPLOAD_MB = '-5';
      expect(maxUploadBytes()).toBe(1 * 1024 * 1024);
    });
  });

  describe('uploadsDir', () => {
    it('defaults to ./data/uploads under cwd', () => {
      expect(uploadsDir()).toBe(`${process.cwd()}/data/uploads`);
    });

    it('respects UPLOAD_DIR when set', () => {
      process.env.UPLOAD_DIR = '/var/tmp/strawberry';
      expect(uploadsDir()).toBe('/var/tmp/strawberry');
    });
  });
});
