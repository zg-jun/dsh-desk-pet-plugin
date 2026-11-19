import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installRuntimeCore } from '../../src/host/runtime-install.js';

const ZIP = Buffer.from('fake electron zip bytes');
const HASH = createHash('sha256').update(ZIP).digest('hex');
const VERSION = '45.2.2';

let server: http.Server | undefined;
let dir: string | undefined;

afterEach(async () => {
  if (server) {
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise((resolve) => server!.close(resolve));
  }
  server = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function serve(handler: Handler): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  return `http://127.0.0.1:${(server!.address() as { port: number }).port}`;
}

/** spawn fake: extracts into the `-d` directory, then exits with `code`. */
function fakeSpawn(mode: 'ok' | 'fail' | 'no-bin' | 'hang' = 'ok') {
  return (cmd: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & { kill: () => void };
    const outDir = (cmd.endsWith('ditto')
      ? args[args.length - 1]
      : (args[args.indexOf('-d') + 1] || args[args.indexOf('-C') + 1])) || '.';
    let killed = false;
    child.kill = () => {
      if (killed) return;
      killed = true;
      setTimeout(() => child.emit('exit', null), 5);
    };
    if (mode === 'hang') return child;
    setTimeout(async () => {
      if (mode === 'ok') {
        const bin = path.join(outDir, 'Electron.app/Contents/MacOS/Electron');
        await mkdir(path.dirname(bin), { recursive: true });
        await writeFile(bin, 'bin');
      }
      child.emit('exit', mode === 'fail' ? 1 : 0);
    }, 10);
    return child;
  };
}

function options(base: string, extra: Record<string, unknown> = {}) {
  return {
    zipUrl: `${base}/electron.zip`,
    shasumsUrls: [`${base}/SHASUMS256.txt`],
    version: VERSION,
    platform: 'darwin',
    arch: 'arm64',
    zipPath: path.join(dir!, 'electron-runtime.zip'),
    runtimeDir: path.join(dir!, 'runtime'),
    binPath: path.join(dir!, 'runtime/Electron.app/Contents/MacOS/Electron'),
    stampFile: '.dsh-runtime-version',
    fetchImpl: fetch,
    spawnImpl: fakeSpawn('ok' as any),
    ...extra,
  } as any;
}

describe('installRuntimeCore', () => {
  it('downloads, verifies, extracts, stamps, and cleans the zip', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.writeHead(200, { 'content-length': String(ZIP.length) });
      res.end(ZIP);
    });
    const phases: string[] = [];
    const progress: number[] = [];
    const result = await installRuntimeCore(options(base, {
      onPhase: (p: { phase: string }) => phases.push(p.phase),
      onProgress: (n: number) => progress.push(n),
    }));
    expect(result.bin).toBe(path.join(dir!, 'runtime/Electron.app/Contents/MacOS/Electron'));
    expect(phases).toContain('extracting');
    expect(progress.at(-1)).toBe(ZIP.length);
    expect(await readFile(path.join(dir!, 'runtime/.dsh-runtime-version'), 'utf8')).toBe(VERSION);
    await expect(stat(path.join(dir!, 'electron-runtime.zip'))).rejects.toThrow();
  }, 10000);

  it('fails on an HTTP error and removes the partial zip', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.writeHead(500); res.end('nope');
    });
    await expect(installRuntimeCore(options(base))).rejects.toThrow(/HTTP 500/);
    await expect(stat(path.join(dir!, 'electron-runtime.zip'))).rejects.toThrow();
  }, 10000);

  it('fails on a checksum mismatch', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${'0'.repeat(64)}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    await expect(installRuntimeCore(options(base))).rejects.toThrow(/checksum mismatch/);
  }, 10000);

  it('fails fast when no checksum source answers', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => { res.writeHead(404); res.end('missing'); });
    await expect(installRuntimeCore(options(base))).rejects.toThrow(/checksum unavailable/);
  }, 10000);

  it('aborts while waiting for the checksum', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve(() => { /* never respond */ });
    const controller = new AbortController();
    const pending = installRuntimeCore(options(base, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 30);
    const started = Date.now();
    await expect(pending).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  }, 5000);

  it('aborts in the middle of the download', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.writeHead(200, { 'content-length': '1000' });
      res.write(ZIP.subarray(0, 5));
      // keep the connection open; the abort must tear it down
    });
    const controller = new AbortController();
    const pending = installRuntimeCore(options(base, { signal: controller.signal }));
    const started = Date.now();
    setTimeout(() => controller.abort(), 80);
    await expect(pending).rejects.toThrow();
    // 旧实现会等到 socket 超时（3s+）；这里给足余量，既证明“立即中断”又不被 CI 负载误伤。
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(stat(path.join(dir!, 'electron-runtime.zip'))).rejects.toThrow();
  }, 8000);

  it('fails when the extractor exits non-zero', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    await expect(installRuntimeCore(options(base, {
      spawnImpl: fakeSpawn('fail'),
    }))).rejects.toThrow(/extract failed \(code 1\)/);
  }, 10000);

  it('aborts while extracting', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    const controller = new AbortController();
    let extStarted = false;
    const hung = fakeSpawn('hang');
    const pending = installRuntimeCore(options(base, {
      signal: controller.signal,
      spawnImpl: (cmd: string, args: string[]) => {
        extStarted = true;
        return hung(cmd, args);
      },
    }));
    // 等解压真正开始后再取消，避免和下载阶段竞态。
    while (!extStarted) await new Promise((r) => setTimeout(r, 5));
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow(/extract failed/);
  }, 8000);

  it('keeps the existing runtime when an upgrade is cancelled', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const runtimeDir = path.join(dir, 'runtime');
    await mkdir(path.join(runtimeDir, 'Electron.app/Contents/MacOS'), { recursive: true });
    await writeFile(path.join(runtimeDir, 'Electron.app/Contents/MacOS/Electron'), 'old');
    await writeFile(path.join(runtimeDir, 'marker'), 'keep');

    const base = await serve(() => { /* hang forever */ });
    const controller = new AbortController();
    const pending = installRuntimeCore(options(base, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 40);
    await expect(pending).rejects.toThrow();

    // 旧运行时完好，暂存目录被清理
    expect(await readFile(path.join(runtimeDir, 'marker'), 'utf8')).toBe('keep');
    expect(await readFile(path.join(runtimeDir, 'Electron.app/Contents/MacOS/Electron'), 'utf8')).toBe('old');
    await expect(stat(path.join(dir, 'runtime.partial'))).rejects.toThrow();
  }, 8000);

  it('replaces the previous runtime only after a successful install', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const runtimeDir = path.join(dir, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(path.join(runtimeDir, 'leftover'), 'old');
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    await installRuntimeCore(options(base));
    await expect(stat(path.join(runtimeDir, 'leftover'))).rejects.toThrow();
    expect(await readFile(path.join(runtimeDir, '.dsh-runtime-version'), 'utf8')).toBe(VERSION);
  }, 10000);

  it('falls back to ditto when unzip is unavailable', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    const ditto = fakeSpawn('ok');
    const spawnImpl = (cmd: string, args: string[]) => {
      if (cmd.endsWith('unzip')) {
        const child = new EventEmitter() as EventEmitter & { kill: () => void };
        child.kill = () => {};
        setTimeout(() => child.emit('error', Object.assign(new Error('spawn unzip ENOENT'), { code: 'ENOENT' })), 5);
        return child;
      }
      return ditto(cmd, args);
    };
    await expect(installRuntimeCore(options(base, { spawnImpl }))).resolves.toBeTruthy();
  }, 10000);

  it('fails when the binary is missing after extraction', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
    const base = await serve((req, res) => {
      if (req.url === '/SHASUMS256.txt') return res.end(`${HASH}  electron-v${VERSION}-darwin-arm64.zip\n`);
      res.end(ZIP);
    });
    await expect(installRuntimeCore(options(base, {
      spawnImpl: fakeSpawn('no-bin'),
    }))).rejects.toThrow(/extracted binary missing/);
  }, 10000);
});
