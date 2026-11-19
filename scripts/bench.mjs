// Idle benchmark for the screen renderer, independent of a running DSH host.
//
// Serves the built float page with a stubbed `deskPet` bridge and a minimal SSE
// endpoint, launches Electron with background throttling disabled, then reads
// the `?bench=1` counters (renders / draws / per-draw time) after N idle seconds.
//
// Usage: npm run bench [-- --seconds 15]
// Exit: 0 = measured, 0 + SKIP = no Electron runtime, 1 = failure.
import http from 'node:http';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const SECONDS = Math.max(3, value('--seconds', 15));
const ROOT = path.resolve(import.meta.dirname, '..');
const APP_DIR = path.join(ROOT, '.tmp/bench-app');

const ELECTRON = process.env.DESK_PET_REAL_ELECTRON
  || path.join(os.homedir(), '.petdex/dsh-float/runtime/Electron.app/Contents/MacOS/Electron');

const STATUS = {
  ok: true, mode: 'idle', slug: 'bench', task: '', kind: '', sessionId: '',
  pending: null, opacity: 1, size: 1, petOn: true,
};

try {
  await access(ELECTRON);
} catch {
  console.log(`SKIP bench — Electron not found at ${ELECTRON}`);
  process.exit(0);
}

let html;
let core;
try {
  html = await readFile(path.join(ROOT, 'dist/screen/float.html'), 'utf8');
  core = await readFile(path.join(ROOT, 'dist/pet-core.js'), 'utf8');
} catch {
  console.error('missing dist/screen/float.html or dist/pet-core.js — run npm run build first');
  process.exit(1);
}

const stub = `<script>window.deskPet={fitContent(){},setInteractive(){},quitPet(){},onHintBeforeHide(){},menu(){},dragStart(){},dragEnd(){},openSession(){},focusApp(){},petAnswer(){}};</script>`;
const coreTag = `<script>${core.replace(/<\/script/gi, '<\\/script')}</script>`;
const page = html.replace('<script id="pet-core"></script>', coreTag + stub);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/' || url.pathname === '/float') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page);
    return;
  }
  if (url.pathname === '/api/desk-pet/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    });
    res.write(`event: status\ndata: ${JSON.stringify(STATUS)}\n\n`);
    const ping = setInterval(() => {
      try { res.write('event: ping\ndata: {}\n\n'); } catch { /* closed */ }
    }, 5000);
    req.on('close', () => clearInterval(ping));
    return;
  }
  if (url.pathname === '/api/desk-pet/pet/bench/sprite') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1872" viewBox="0 0 1536 1872"><rect width="1536" height="1872" fill="#222"/><circle cx="96" cy="104" r="78" fill="#ffd166"/><circle cx="72" cy="92" r="7" fill="#3a2c1a"/><circle cx="120" cy="92" r="7" fill="#3a2c1a"/></svg>';
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' });
    res.end(svg);
    return;
  }
  if (url.pathname === '/api/desk-pet/status') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(STATUS));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const port = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const url = `http://127.0.0.1:${port}/?bench=1`;

const mainJs = `const { app, BrowserWindow } = require('electron');
const url = process.env.BENCH_URL;
const seconds = Number(process.env.BENCH_SECONDS || 15) * 1000;
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 420, height: 320, show: false,
    webPreferences: { contextIsolation: false, backgroundThrottling: false },
  });
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, 1200));
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, seconds));
  const stats = await win.webContents.executeJavaScript('window.__petStats || null');
  const cpuPercent = app.getAppMetrics().reduce((sum, metric) => sum + (metric.cpu?.percentCPUUsage || 0), 0);
  console.log('BENCH_RESULT ' + JSON.stringify({ elapsed: (Date.now() - t0) / 1000, stats, cpuPercent }));
  app.quit();
});
`;

let child;
try {
  await mkdir(APP_DIR, { recursive: true });
  await writeFile(path.join(APP_DIR, 'package.json'), JSON.stringify({ name: 'desk-pet-bench', main: 'main.js' }));
  await writeFile(path.join(APP_DIR, 'main.js'), mainJs);

  const env = { ...process.env, BENCH_URL: url, BENCH_SECONDS: String(SECONDS) };
  delete env.ELECTRON_RUN_AS_NODE;

  const result = await new Promise((resolve) => {
    child = spawn(ELECTRON, [APP_DIR, '--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(APP_DIR, 'userData')}`], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      resolve({ timedOut: true, out, err });
    }, (SECONDS + 25) * 1000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => { resolve({ failed: String(error.message || error), out, err }); });
    child.on('exit', () => { clearTimeout(timer); resolve({ out, err }); });
  });

  if (result.failed) {
    console.error(`electron failed: ${result.failed}`);
    process.exit(1);
  }
  const line = result.out.split('\n').find((text) => text.startsWith('BENCH_RESULT '));
  if (!line) {
    console.error('no BENCH_RESULT from Electron');
    console.error((result.err || result.out).slice(-1200));
    process.exit(1);
  }
  const { elapsed, stats, cpuPercent } = JSON.parse(line.slice('BENCH_RESULT '.length));
  if (!stats) {
    console.error('window.__petStats missing — page did not load with ?bench=1');
    process.exit(1);
  }
  const frames = [...stats.frameMs].sort((a, b) => a - b);
  const p95 = frames.length ? frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.95))] : 0;
  const report = {
    elapsed,
    renders: stats.renders,
    rendersPerSec: stats.renders / elapsed,
    draws: stats.draws,
    drawsPerSec: stats.draws / elapsed,
    p95FrameMs: p95,
    cpuPercent,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log(`bench: ${elapsed.toFixed(1)}s idle  renders=${stats.renders} (${report.rendersPerSec.toFixed(2)}/s)  draws=${stats.draws} (${report.drawsPerSec.toFixed(2)}/s)  p95Frame=${p95.toFixed(2)}ms  cpu=${(cpuPercent ?? 0).toFixed(1)}%`);
} finally {
  try { child?.kill('SIGKILL'); } catch { /* gone */ }
  server.close();
  await rm(APP_DIR, { recursive: true, force: true }).catch(() => {});
}
