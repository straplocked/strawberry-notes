import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ZipWriter, crc32 } from './streaming';

describe('crc32', () => {
  it('matches known values', () => {
    // Well-known CRC-32 of the ASCII string "123456789".
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('crc of empty is 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/**
 * Minimal zip parser for round-trip tests.
 * Walks the End-of-Central-Directory record, then the central directory, then
 * each local file header, and returns decompressed file contents keyed by name.
 */
function unzip(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find EOCD by scanning the last 65557 bytes for the signature.
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  const maxSearch = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= maxSearch; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('EOCD not found');

  const totalEntries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  const out = new Map<string, Uint8Array>();
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = view.getUint32(p, true);
    if (sig !== 0x02014b50) throw new Error(`bad central dir sig at ${p}`);
    const method = view.getUint16(p + 10, true);
    const crcExpected = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));

    // Parse local file header for the actual data offset.
    const lfhSig = view.getUint32(localOffset, true);
    if (lfhSig !== 0x04034b50) throw new Error('bad local header');
    const lfhNameLen = view.getUint16(localOffset + 26, true);
    const lfhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen;
    const rawData = buf.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) {
      data = rawData;
    } else if (method === 8) {
      const buffer = inflateRawSync(Buffer.from(rawData));
      data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else {
      throw new Error(`unknown method ${method}`);
    }
    if (data.length !== uncompSize) {
      throw new Error(`size mismatch for ${name}: ${data.length} != ${uncompSize}`);
    }
    if (crc32(data) !== crcExpected) {
      throw new Error(`crc mismatch for ${name}`);
    }

    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe('ZipWriter round-trip', () => {
  it('produces an archive with compressible text that extracts cleanly', async () => {
    const writer = new ZipWriter();
    const stream = writer.stream();
    const payload = new TextEncoder().encode('hello '.repeat(200));
    const collectP = collect(stream);
    await writer.addFile('a.txt', payload);
    await writer.addFile('nested/b.txt', new TextEncoder().encode('nested body'));
    await writer.close();

    const buf = await collectP;
    const files = unzip(buf);
    expect(files.size).toBe(2);
    expect(new TextDecoder().decode(files.get('a.txt')!)).toBe('hello '.repeat(200));
    expect(new TextDecoder().decode(files.get('nested/b.txt')!)).toBe('nested body');
  });

  it('stores (method 0) zero-length files', async () => {
    const writer = new ZipWriter();
    const stream = writer.stream();
    const collectP = collect(stream);
    await writer.addFile('empty.bin', new Uint8Array(0));
    await writer.close();
    const buf = await collectP;
    const files = unzip(buf);
    expect(files.size).toBe(1);
    expect(files.get('empty.bin')!.length).toBe(0);
  });

  it('stores incompressible bytes without inflating them', async () => {
    // Random noise should trigger the STORE fallback (deflate bigger than raw).
    const writer = new ZipWriter();
    const stream = writer.stream();
    const payload = new Uint8Array(4096);
    for (let i = 0; i < payload.length; i++) payload[i] = (Math.random() * 256) | 0;
    const collectP = collect(stream);
    await writer.addFile('noise.bin', payload);
    await writer.close();
    const buf = await collectP;
    const files = unzip(buf);
    expect(files.get('noise.bin')!).toEqual(payload);
  });

  it('preserves non-ASCII filenames via UTF-8', async () => {
    const writer = new ZipWriter();
    const stream = writer.stream();
    const collectP = collect(stream);
    const name = 'notes/Ça va/naïve-café.md';
    await writer.addFile(name, new TextEncoder().encode('olé'));
    await writer.close();
    const files = unzip(await collectP);
    expect([...files.keys()]).toEqual([name]);
    expect(new TextDecoder().decode(files.get(name)!)).toBe('olé');
  });

  it('records the correct central-directory entry count', async () => {
    const writer = new ZipWriter();
    const stream = writer.stream();
    const collectP = collect(stream);
    for (let i = 0; i < 7; i++) {
      await writer.addFile(`f${i}.txt`, new TextEncoder().encode(`body ${i}`));
    }
    await writer.close();
    const files = unzip(await collectP);
    expect(files.size).toBe(7);
    for (let i = 0; i < 7; i++) {
      expect(new TextDecoder().decode(files.get(`f${i}.txt`)!)).toBe(`body ${i}`);
    }
  });

  // Sanity check that a workspace-sized (1k notes) export round-trips. Skipped
  // by default because bcrypt + drizzle are slow under jsdom; flip the env to
  // run it manually:  RUN_ZIP_STRESS=1 npm test -- streaming
  it.skipIf(!process.env.RUN_ZIP_STRESS)(
    'round-trips 1000 small entries without corruption',
    async () => {
      const writer = new ZipWriter();
      const stream = writer.stream();
      const collectP = collect(stream);
      const COUNT = 1000;
      for (let i = 0; i < COUNT; i++) {
        await writer.addFile(`note-${i}.md`, new TextEncoder().encode(`# Note ${i}\n\nBody.`));
      }
      await writer.close();
      const files = unzip(await collectP);
      expect(files.size).toBe(COUNT);
      // Spot check a few entries.
      for (const i of [0, 1, 500, 999]) {
        expect(new TextDecoder().decode(files.get(`note-${i}.md`)!)).toBe(
          `# Note ${i}\n\nBody.`,
        );
      }
    },
  );
});
