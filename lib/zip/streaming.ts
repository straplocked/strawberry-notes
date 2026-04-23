/**
 * Tiny streaming ZIP writer.
 *
 * Provenance / scope:
 *   Hand-rolled to keep the dependency list minimal. jszip buffers everything
 *   in memory; archiver / yazl pull in a fair amount of surface area and bring
 *   their own stream models. For the export-all workload we only need a
 *   forward-only "write one entry at a time" writer that pipes compressed
 *   bytes out as they are produced, so this module exists instead.
 *
 * Format:
 *   Classic PKZIP (APPNOTE.TXT). DEFLATE compression (method 8) via Node's
 *   built-in zlib. CRC-32 is computed manually against the uncompressed bytes.
 *   Per-entry "general purpose bit flag 3" (data-descriptor) is NOT used —
 *   we compute crc and sizes up-front per chunk, then emit them in the local
 *   file header before streaming the compressed payload. This keeps the
 *   reader side trivially compatible with stdlib `unzip`.
 *
 * Limits:
 *   - Non-zip64. Individual entry <= 4 GiB uncompressed, archive offsets
 *     <= 4 GiB, entry count <= 65535. A single-user Strawberry Notes
 *     workspace is nowhere near these limits in practice; a guard is
 *     included so oversize inputs error instead of corrupting the archive.
 *   - Filenames are written as UTF-8 with the language-encoding flag set
 *     (general-purpose bit 11) so modern unzippers render non-ASCII paths
 *     correctly.
 *
 * Usage:
 *   const writer = new ZipWriter();
 *   const stream = writer.stream();        // ReadableStream<Uint8Array>
 *   // produce, in order:
 *   //   await writer.addFile(name, bytes);
 *   //   ... more files ...
 *   //   await writer.close();
 */

import { deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const deflateRawP = promisify(deflateRaw);

// --- CRC-32 ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- MS-DOS date/time --------------------------------------------------------

function dosDateTime(d: Date): { date: number; time: number } {
  const year = d.getFullYear();
  // DOS epoch is 1980; clamp so older timestamps don't corrupt the archive.
  const y = Math.max(1980, year);
  const date = ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date & 0xffff, time: time & 0xffff };
}

// --- Writer ------------------------------------------------------------------

interface CentralEntry {
  name: Uint8Array; // UTF-8 encoded filename
  crc: number;
  compSize: number;
  uncompSize: number;
  offset: number; // offset of local file header
  date: number;
  time: number;
  method: number; // 0 = stored, 8 = deflate
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;

// General-purpose bit flag: bit 11 = UTF-8 filename (EFS).
const GPF_UTF8 = 0x0800;

const ZIP32_MAX = 0xffffffff;
const ZIP32_ENTRY_MAX = 0xffff;

/** Options for a single entry. */
export interface AddFileOptions {
  /** If true, skip compression (store only). Useful for pre-compressed blobs. */
  store?: boolean;
  /** Last-modified timestamp; defaults to now. */
  mtime?: Date;
}

export class ZipWriter {
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private offset = 0;
  private entries: CentralEntry[] = [];
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private closeResolve: (() => void) | null = null;
  private closeReject: ((err: unknown) => void) | null = null;

  /**
   * Returns the ReadableStream consumers read from. Call this BEFORE calling
   * addFile / close — the returned stream is what the caller hands to
   * `new Response(..)`.
   */
  stream(): ReadableStream<Uint8Array> {
    if (this.controller) {
      throw new Error('ZipWriter.stream() called twice');
    }
    this.closePromise = new Promise((resolve, reject) => {
      this.closeResolve = resolve;
      this.closeReject = reject;
    });
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        // Consumer gave up — mark closed so subsequent writes throw.
        this.closed = true;
      },
    });
  }

  /** Wait for the stream to be fully flushed. Resolves after close() pushes EOCD. */
  done(): Promise<void> {
    return this.closePromise ?? Promise.resolve();
  }

  private push(chunk: Uint8Array): void {
    if (!this.controller) throw new Error('ZipWriter: stream() not called yet');
    if (this.closed) throw new Error('ZipWriter: cannot write after close');
    this.controller.enqueue(chunk);
    this.offset += chunk.length;
  }

  async addFile(
    name: string,
    data: Uint8Array,
    opts: AddFileOptions = {},
  ): Promise<void> {
    if (this.closed) throw new Error('ZipWriter: cannot addFile after close');
    const nameBytes = new TextEncoder().encode(name);
    if (nameBytes.length > 0xffff) {
      throw new Error(`ZipWriter: entry name too long (${nameBytes.length} bytes)`);
    }
    if (data.length > ZIP32_MAX) {
      throw new Error(`ZipWriter: entry ${name} too large for non-zip64 archive`);
    }
    if (this.entries.length >= ZIP32_ENTRY_MAX) {
      throw new Error('ZipWriter: too many entries for non-zip64 archive');
    }

    const mtime = opts.mtime ?? new Date();
    const { date, time } = dosDateTime(mtime);

    const uncompSize = data.length;
    const crc = crc32(data);

    let method = 8;
    let compressed: Uint8Array;
    if (opts.store || data.length === 0) {
      method = 0;
      compressed = data;
    } else {
      const buf = await deflateRawP(Buffer.from(data));
      // Fall back to stored if deflate actually made things bigger.
      if (buf.length >= data.length) {
        method = 0;
        compressed = data;
      } else {
        method = 8;
        compressed = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      }
    }
    const compSize = compressed.length;
    if (compSize > ZIP32_MAX || this.offset + compSize > ZIP32_MAX) {
      throw new Error(`ZipWriter: archive exceeds 4 GiB (non-zip64 limit)`);
    }

    const entryOffset = this.offset;

    // --- Local file header -------------------------------------------------
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, LOCAL_FILE_HEADER_SIG, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, GPF_UTF8, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compSize, true);
    lv.setUint32(22, uncompSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    lfh.set(nameBytes, 30);
    this.push(lfh);

    // --- File data ---------------------------------------------------------
    if (compressed.length > 0) this.push(compressed);

    this.entries.push({
      name: nameBytes,
      crc,
      compSize,
      uncompSize,
      offset: entryOffset,
      date,
      time,
      method,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    try {
      const cdStart = this.offset;

      // --- Central directory headers --------------------------------------
      for (const e of this.entries) {
        const cd = new Uint8Array(46 + e.name.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, CENTRAL_DIR_SIG, true);
        cv.setUint16(4, 20, true); // version made by
        cv.setUint16(6, 20, true); // version needed
        cv.setUint16(8, GPF_UTF8, true);
        cv.setUint16(10, e.method, true);
        cv.setUint16(12, e.time, true);
        cv.setUint16(14, e.date, true);
        cv.setUint32(16, e.crc, true);
        cv.setUint32(20, e.compSize, true);
        cv.setUint32(24, e.uncompSize, true);
        cv.setUint16(28, e.name.length, true);
        cv.setUint16(30, 0, true); // extra
        cv.setUint16(32, 0, true); // comment
        cv.setUint16(34, 0, true); // disk
        cv.setUint16(36, 0, true); // internal attrs
        cv.setUint32(38, 0, true); // external attrs
        cv.setUint32(42, e.offset, true);
        cd.set(e.name, 46);
        this.push(cd);
      }

      const cdEnd = this.offset;
      const cdSize = cdEnd - cdStart;

      // --- End of central directory ---------------------------------------
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, END_OF_CENTRAL_DIR_SIG, true);
      ev.setUint16(4, 0, true); // disk number
      ev.setUint16(6, 0, true); // disk with cd
      ev.setUint16(8, this.entries.length, true); // entries on this disk
      ev.setUint16(10, this.entries.length, true); // total entries
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, cdStart, true);
      ev.setUint16(20, 0, true); // comment length
      this.push(eocd);

      this.closed = true;
      this.controller?.close();
      this.closeResolve?.();
    } catch (err) {
      this.closed = true;
      this.controller?.error(err);
      this.closeReject?.(err);
      throw err;
    }
  }

  /** Abort the stream with an error (for surfacing upstream failures). */
  fail(err: unknown): void {
    if (this.closed) return;
    this.closed = true;
    this.controller?.error(err);
    this.closeReject?.(err);
  }
}
