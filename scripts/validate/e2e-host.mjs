// End-to-end host verification in an isolated HOME and a random port.
//
// Safety: the plugin COPY under .tmp/e2e has killStaleChild/killOrphanChildren
// no-op'd before import, so a live pet is never touched. The real Electron
// runtime is used to spawn a temporary pet window; it is closed at the end.
// Skips cleanly when no Electron runtime is available.
import { access, cp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WORK = path.join(ROOT, '.tmp/e2e');
const HOME = path.join(ROOT, '.tmp/e2e-home');
const REAL_ELECTRON = process.env.DESK_PET_REAL_ELECTRON
  || path.join(os.homedir(), '.petdex/dsh-float/runtime/Electron.app/Contents/MacOS/Electron');

try {
  await access(REAL_ELECTRON);
} catch {
  console.log(`SKIP e2e — Electron runtime not found at ${REAL_ELECTRON}`);
  process.exit(0);
}
if (process.platform === 'win32') {
  console.log('SKIP e2e — isolated HOME is POSIX-only');
  process.exit(0);
}

await rm(WORK, { recursive: true, force: true });
await rm(HOME, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });
await mkdir(HOME, { recursive: true });
await cp(path.join(ROOT, 'dist'), path.join(WORK, 'dist'), { recursive: true });
await cp(path.join(ROOT, 'index.js'), path.join(WORK, 'index.js'));
await cp(path.join(ROOT, 'src/host'), path.join(WORK, 'src/host'), { recursive: true });
await writeFile(path.join(WORK, 'package.json'), JSON.stringify({ name: 'pet-e2e', version: '0.0.0', type: 'module' }));

let source = await readFile(path.join(WORK, 'dist/index.js'), 'utf8');
source = source.replace(/(async function killStaleChild\s*\([^)]*\)\s*\{)/, '$1\n  return; // e2e isolation');
source = source.replace(/(async function killOrphanChildren\s*\([^)]*\)\s*\{)/, '$1\n  return; // e2e isolation');
if (!source.includes('e2e isolation')) throw new Error('kill isolation patch failed');
await writeFile(path.join(WORK, 'dist/index.js'), source);

const WRAPPER = path.join(WORK, 'electron-wrapper.sh');
await writeFile(WRAPPER, `#!/bin/sh\nexec "${REAL_ELECTRON}" --no-sandbox --disable-gpu --disable-dev-shm-usage "$@"\n`);
await chmod(WRAPPER, 0o755);

process.env.HOME = HOME;
process.env.DESK_PET_ELECTRON = WRAPPER;

const { apply } = await import(pathToFileURL(path.join(WORK, 'index.js')).href);
const { instanceKey } = await import(pathToFileURL(path.join(WORK, 'src/host/instance.js')).href);
const instanceDir = path.join(HOME, '.petdex', 'dsh-float', 'instances', instanceKey(process.env));
await mkdir(instanceDir, { recursive: true });
await writeFile(path.join(instanceDir, 'settings.json'), JSON.stringify({
  petOn: true, slug: 'alpha', opacity: 0.9, size: 1.1,
}));

let handler = null;
let floatPageHits = 0;
let floatStreamHits = 0;
let childPid = 0;

const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (/Electron/i.test(req.headers['user-agent'] || '')) {
    if (url.includes('/api/desk-pet/float')) floatPageHits += 1;
    if (url.includes('/api/desk-pet/stream')) floatStreamHits += 1;
  }
  if (!handler) {
    res.writeHead(503);
    res.end('booting');
    return;
  }
  handler(req, res).catch((error) => {
    try { res.writeHead(500); res.end(String(error)); } catch { /* closed */ }
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const api = `${origin}/api/desk-pet`;

apply({
  webServer: {
    getOrigin: () => origin,
    register: ({ handler: h }) => { handler = h; return () => {}; },
  },
  effect: (fn) => { fn(); },
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 15000) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await wait(200);
  }
  return false;
};

function request(pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(api + pathname);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { origin, ...headers },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, body: parsed, text });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}
const get = (p, headers) => request(p, { headers });
const post = (p, body = {}, headers = {}) => request(p, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body,
});
const settingsPath = path.join(instanceDir, 'settings.json');
const readSettings = async () => {
  try { return JSON.parse(await readFile(settingsPath, 'utf8')); } catch { return null; }
};

check('startup restores persisted petOn', await waitFor(async () => (await get('/float-state')).body?.open === true, 20000), 'auto-open');
const startup = await get('/status');
check('2.0 default appearance migrates', startup.body?.opacity === 1 && startup.body?.size === 1,
  JSON.stringify({ opacity: startup.body?.opacity, size: startup.body?.size }));


try {
  const runtime = await post('/runtime/check');
  check('runtime resolves via DESK_PET_ELECTRON', runtime.body?.phase === 'ready',
    JSON.stringify({ phase: runtime.body?.phase, version: runtime.body?.version }));

  const leak = await get('/request-info');
  check('request-info removed', leak.status === 404, `status=${leak.status}`);

  const desktopShell = await post('/config', {}, { origin: 'dsh-app://app', 'sec-fetch-site': 'cross-site' });
  check('dsh-app desktop origin accepted', desktopShell.status === 200, `status=${desktopShell.status}`);
  const desktopFetch = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/desk-pet/config', method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-mode': 'cors', 'user-agent': '@deepseek-ai/dsh-desktop/0.2.2-rc.1' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end('{}');
  });
  check('desktop sec-fetch-mode without origin accepted', desktopFetch === 200, `status=${desktopFetch}`);



  const evil = await post('/config', { petOn: false }, { origin: 'https://evil.example' });
  check('cross-origin POST rejected', evil.status === 403, `status=${evil.status}`);

  const off = await post('/config', { petOn: false });
  check('same-origin config accepted', off.status === 200, `status=${off.status}`);
  check('petOn=false persisted', (await readSettings())?.petOn === false, JSON.stringify(await readSettings()));

  const frames = [];
  const sse = http.get(`${api}/stream`, { headers: { accept: 'text/event-stream' } }, (res) => {
    res.on('data', (chunk) => frames.push(chunk.toString()));
  });
  sse.on('error', () => {});
  check('SSE sends initial status', await waitFor(() => frames.join('').includes('event: status')));

  await post('/config', { slug: 'alpha' });
  const withSlug = await get('/status');
  check('config slug persists in status', withSlug.body?.slug === 'alpha', JSON.stringify(withSlug.body));
  const settingsFile = path.join(instanceDir, 'settings.json');
  let persistedSlug = '';
  try { persistedSlug = JSON.parse(readFileSync(settingsFile, 'utf8')).slug || ''; } catch { /* no file */ }
  check('config slug persisted to disk', persistedSlug === 'alpha', persistedSlug);

  const pendingOn = await post('/pending', { pending: { kind: 'approval', sessionId: 's1', summary: 'ok', options: ['allowed-once', 'rejected'] } });
  const pendingStatus = await get('/status');
  check('pending route waits', pendingOn.status === 200 && pendingStatus.body?.pending?.kind === 'approval' && pendingStatus.body?.mode === 'waiting');
  check('pending broadcasts over SSE', await waitFor(() => frames.join('').includes('"mode":"waiting"')));
  await post('/pending', { pending: null });
  const cleared = await get('/status');
  check('pending clears', cleared.body?.pending === null && cleared.body?.mode !== 'waiting');
  await post('/pending', { pending: null, mode: 'done', task: 'fallback' });
  const fallback = await get('/status');
  check('pending fallback mode/task', fallback.body?.mode === 'done' && fallback.body?.task === 'fallback', JSON.stringify(fallback.body));

  const denied = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/desk-pet/config', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end('{}');
  });
  check('no-origin mutation rejected', denied === 403, `status=${denied}`);

  const oversize = await post('/pending', { pending: null, task: 'x'.repeat(70000) });
  check('oversize status rejected', oversize.status === 413, `status=${oversize.status}`);

  const html = await (await fetch(`${api}/float`)).text();
  check('float HTML injects PetCore + fitWindow', html.includes('var PetCore') && html.includes('fitWindow'), `bytes=${html.length}`);

  const on = await post('/config', { petOn: true });
  check('config petOn=true accepted', on.status === 200, `petOn=${on.body?.petOn}`);
  check('float window spawned', await waitFor(async () => (await get('/float-state')).body?.open === true, 20000));
  check('lifecycle state on', (await get('/float-state')).body?.state === 'on', JSON.stringify((await get('/float-state')).body));
  check('float page served to Electron', await waitFor(() => floatPageHits >= 1, 15000), `hits=${floatPageHits}`);
  check('float status via IPC', await waitFor(async () => ((await get('/ipc-state')).body?.statusAt || 0) > 0, 15000), 'statusAt');
  let ipcAt = 0;
  for (let i = 0; i < 40 && !ipcAt; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ipcAt = (await get('/ipc-state')).body?.at || 0;
  }
  check('child ipc ping received', ipcAt > 0, `at=${ipcAt}`);

  check('petOn=true persisted', (await readSettings())?.petOn === true);

  const pidText = await readFile(path.join(instanceDir, 'child.pid'), 'utf8').catch(() => '');
  childPid = Number(pidText.trim());
  let alive = false;
  try { process.kill(childPid, 0); alive = true; } catch { /* gone */ }
  check('child process alive', alive, `pid=${childPid}`);

  let command = null;
  for (let i = 0; i < 20; i++) {
    command = await post('/ipc-command', { command: 'open-settings' });
    if (command.status === 200) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const uiEvent = await waitFor(async () => (await get('/ui-event')).body?.event?.type === 'open-settings', 5000);
  check('child command -> ui-event', command?.status === 200 && uiEvent, `status=${command?.status}`);

  const closed = await post('/float-close');
  check('float-close accepted', closed.status === 200);
  check('child stopped', await waitFor(async () => (await get('/float-state')).body?.open === false, 15000));
  check('lifecycle state off', (await get('/float-state')).body?.state === 'off', JSON.stringify((await get('/float-state')).body));
  check('petOn=false persisted on close', (await readSettings())?.petOn === false);

  const guarded = await post('/float-open');
  check('float-open refused while petOn=false', guarded.body?.ok === false && guarded.body?.error === 'pet-off', JSON.stringify(guarded.body));

  sse.destroy();
} catch (error) {
  console.error('E2E ERROR', error);
  results.push({ name: 'exception', ok: false });
} finally {
  if (childPid) { try { process.kill(childPid); } catch { /* gone */ } }
  server.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  setTimeout(() => process.exit(passed === results.length ? 0 : 1), 200);
}
