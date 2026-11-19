import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertSha256,
  fetchRuntimeHash,
  parseShasums,
  sha256File,
} from '../../src/host/runtime-integrity.js';

const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('runtime-integrity', () => {
  it('parses the matching line from SHASUMS256.txt', () => {
    const text = `${'a'.repeat(64)}  electron-v1-darwin-arm64.zip\n${ABC}  electron-v1-darwin-x64.zip\n`;
    expect(parseShasums(text, 'electron-v1-darwin-x64.zip')).toBe(ABC);
    expect(parseShasums(text, 'missing.zip')).toBeNull();
  });

  it('hashes a file and rejects a mismatch', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-sha-'));
    const file = path.join(dir, 'abc.bin');
    await writeFile(file, 'abc');
    expect(await sha256File(file)).toBe(ABC);
    await expect(assertSha256(file, ABC)).resolves.toBe(ABC);
    await expect(assertSha256(file, '0'.repeat(64))).rejects.toThrow(/checksum mismatch/);
  });

  it('falls back to the mirror and fails closed when no checksum exists', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('github.com')) return { ok: false, text: async () => '' };
      return { ok: true, text: async () => `${ABC}  electron-v45-darwin-arm64.zip\n` };
    }) as unknown as typeof fetch;
    const result = await fetchRuntimeHash('45', 'darwin', 'arm64', fetchImpl);
    expect(result.expected).toBe(ABC);
    expect(result.source).toContain('npmmirror');

    const none = vi.fn(async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch;
    await expect(fetchRuntimeHash('45', 'darwin', 'arm64', none)).rejects.toThrow(/checksum unavailable/);
  });
});
