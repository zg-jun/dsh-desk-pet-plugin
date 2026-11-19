#!/usr/bin/env node
// Real /runtime/install path against a local fake Electron zip + SHASUMS.
// This exercises download → SHA256 → unpack → bin/stamp without 120MB network.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const work = await mkdtemp(path.join(os.tmpdir(), 'pet-install-'));
const home = path.join(work, 'home');
await mkdir(home, { recursive: true });
const platform = process.platform;
const arch = process.arch;
const version = '45.2.2';
const zipName = `electron-v${version}-${platform}-${arch}.zip`;
const app = path.join(work, 'app');
const rel = platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : platform === 'win32' ? 'electron.exe' : 'electron';
const binPath = path.join(app, rel);
await mkdir(path.dirname(binPath), { recursive: true });
await writeFile(binPath, '#!/bin/sh\nexit 0\n');
await chmod(binPath, 0o755);
const zipPath = path.join(work, zipName);
try {
  execFileSync('zip', ['-q', '-r', zipPath, '.'], { cwd: app });
} catch (error) {
  console.log('SKIP install path (zip unavailable)');
  await rm(work, { recursive: true, force: true });
  process.exit(0);
}
const body = await readFile(zipPath);
const hash = createHash('sha256').update(body).digest('hex');

const hits = { zip: 0, shasums: 0 };
const server = http.createServer((req, res) => {
  if (req.url === `/${zipName}`) { hits.zip += 1; res.end(body); return; }
  if (req.url === '/SHASUMS256.txt') { hits.shasums += 1; res.end(`${hash}  ${zipName}\n`); return; }
  res.statusCode = 404; res.end('nope');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
process.env.HOME = home;
process.env.DESK_PET_RUNTIME_ZIP_URL = `${origin}/${zipName}`;
process.env.DESK_PET_SHASUMS_URL = `${origin}/SHASUMS256.txt`;
process.env.DESK_PET_DISABLE_LOCAL = '1';
delete process.env.DESK_PET_ELECTRON;

let handler;
const petServer = http.createServer((req, res) => handler(req, res));
await new Promise((resolve) => petServer.listen(0, '127.0.0.1', resolve));
const petOrigin = `http://127.0.0.1:${petServer.address().port}`;
const ctx = {
  webServer: { getOrigin: () => petOrigin, register: (opts) => { handler = opts.handler; return () => {}; } },
  effect: (cb) => { const d = cb(); return () => { if (typeof d === 'function') d(); }; },
  get: () => undefined,
};
const { apply } = await import(pathToFileURL(path.join(ROOT, 'dist/index.js')).href);
apply(ctx);

const post = (p) => fetch(petOrigin + p, { method: 'POST', headers: { origin: petOrigin } });
const checked = await (await post('/api/desk-pet/runtime/check')).json();
if (checked.phase !== 'missing') throw new Error(`expected missing, got ${checked.phase}`);
const install = await post('/api/desk-pet/runtime/install');
if (install.status !== 200) throw new Error(`install status ${install.status}`);
let ready;
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 100));
  ready = await (await fetch(petOrigin + '/api/desk-pet/runtime')).json();
  if (ready.phase === 'ready' || ready.phase === 'failed') break;
}
const runtimeRoot = path.join(home, '.petdex/dsh-float/runtime');
const installedBin = path.join(runtimeRoot, rel);
const stamp = await readFile(path.join(runtimeRoot, '.dsh-runtime-version'), 'utf8').catch(() => '');
const available = await stat(installedBin).then((s) => s.isFile()).catch(() => false);
const ok = ready.phase === 'ready' && ready.source === 'downloaded' && hits.zip > 0 && hits.shasums > 0 && available && stamp === version;
console.log(ok ? 'PASS install path' : 'FAIL install path', JSON.stringify({
  phase: ready.phase, source: ready.source, zipHits: hits.zip, shasumsHits: hits.shasums, stamp, available,
}));
await new Promise((resolve) => petServer.close(resolve));
server.close();
await rm(work, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
