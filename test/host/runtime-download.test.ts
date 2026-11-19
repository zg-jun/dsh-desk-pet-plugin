import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { downloadVerifiedRuntime } from '../../src/host/runtime-download.js';

const body = Buffer.from('fake electron zip bytes');
const good = createHash('sha256').update(body).digest('hex');
let server: http.Server | undefined;
let dir: string | undefined;

afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function serve(hash: string): Promise<{ zip: string; shasums: string }> {
  server = http.createServer((req, res) => {
    if (req.url === '/SHASUMS256.txt') res.end(`${hash}  electron-v1-test-test.zip\n`);
    else res.end(body);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const port = (server!.address() as { port: number }).port;
  return { zip: `http://127.0.0.1:${port}/electron.zip`, shasums: `http://127.0.0.1:${port}/SHASUMS256.txt` };
}

describe('downloadVerifiedRuntime', () => {
  it('downloads, hashes, and reports progress', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-dl-'));
    const { zip, shasums } = await serve(good);
    const zipPath = path.join(dir, 'runtime.zip');
    const progress: number[] = [];
    const result = await downloadVerifiedRuntime({
      zipUrl: zip, version: '1', platform: 'test', arch: 'test', zipPath,
      shasumsUrls: [shasums], onProgress: (n) => progress.push(n),
    });
    expect(result.expected).toBe(good);
    expect(await readFile(zipPath)).toEqual(body);
    expect(progress.at(-1)).toBe(body.length);
  });

  it('aborts while waiting for the checksum', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-dl-'));
    // 只挂起、不响应：模拟上游卡死，取消必须立刻生效。
    server = http.createServer(() => { /* never respond */ });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const port = (server!.address() as { port: number }).port;
    const controller = new AbortController();
    const pending = downloadVerifiedRuntime({
      zipUrl: `http://127.0.0.1:${port}/electron.zip`,
      version: '1', platform: 'test', arch: 'test',
      zipPath: path.join(dir, 'runtime.zip'),
      shasumsUrls: [`http://127.0.0.1:${port}/SHASUMS256.txt`],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toThrow();
  }, 5000);

  it('rejects a checksum mismatch', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-dl-'));
    const { zip, shasums } = await serve('0'.repeat(64));
    const zipPath = path.join(dir, 'runtime.zip');
    await expect(downloadVerifiedRuntime({
      zipUrl: zip, version: '1', platform: 'test', arch: 'test', zipPath, shasumsUrls: [shasums],
    })).rejects.toThrow(/checksum mismatch/);
  });
});
