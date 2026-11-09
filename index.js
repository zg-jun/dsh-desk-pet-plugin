import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PETS_DIR = path.join(os.homedir(), '.petdex', 'pets');
const MANIFEST_URL = 'https://petdex.dev/api/manifest';
const ASSET_ORIGIN = 'https://assets.petdex.dev/';
const MANIFEST_TTL = 5 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]+$/;

let manifestCache = { at: 0, pets: null };

async function getManifest() {
  if (manifestCache.pets && Date.now() - manifestCache.at < MANIFEST_TTL) return manifestCache.pets;
  const res = await fetch(MANIFEST_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const data = await res.json();
  const pets = Array.isArray(data.pets) ? data.pets : [];
  manifestCache = { at: Date.now(), pets };
  return pets;
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function findSpriteExt(dir) {
  for (const ext of ['webp', 'png']) {
    try {
      await fs.access(path.join(dir, `spritesheet.${ext}`));
      return ext;
    } catch { /* try next */ }
  }
  return null;
}

async function handleInstalled(res) {
  const entries = await fs.readdir(PETS_DIR, { withFileTypes: true }).catch(() => []);
  const pets = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SLUG_RE.test(entry.name)) continue;
    const dir = path.join(PETS_DIR, entry.name);
    const ext = await findSpriteExt(dir);
    if (!ext) continue;
    let displayName = entry.name;
    let description = '';
    try {
      const meta = JSON.parse(await fs.readFile(path.join(dir, 'pet.json'), 'utf8'));
      displayName = meta.displayName || meta.id || entry.name;
      description = typeof meta.description === 'string' ? meta.description : '';
    } catch { /* keep fallbacks */ }
    pets.push({ slug: entry.name, displayName, description, ext });
  }
  sendJSON(res, 200, { ok: true, pets });
}

async function handleInstall(url, res) {
  const slug = url.searchParams.get('slug') || '';
  if (!SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, error: 'bad-slug' });
  const manifest = await getManifest();
  const pet = manifest.find((p) => p && p.slug === slug);
  if (!pet || !pet.spritesheetUrl || !pet.petJsonUrl) return sendJSON(res, 404, { ok: false, error: 'not-found' });

  const dir = path.join(PETS_DIR, slug);
  await fs.mkdir(dir, { recursive: true });

  const metaRes = await fetch(pet.petJsonUrl, { redirect: 'follow' });
  if (!metaRes.ok) throw new Error(`pet.json ${metaRes.status}`);
  const metaText = await metaRes.text();
  await fs.writeFile(path.join(dir, 'pet.json'), metaText);

  const spriteRes = await fetch(pet.spritesheetUrl, { redirect: 'follow' });
  if (!spriteRes.ok) throw new Error(`sprite ${spriteRes.status}`);
  const ext = pet.spritesheetUrl.split('?')[0].endsWith('.png') ? 'png' : 'webp';
  const buf = Buffer.from(await spriteRes.arrayBuffer());
  await fs.writeFile(path.join(dir, `spritesheet.${ext}`), buf);

  let displayName = slug;
  try { displayName = JSON.parse(metaText).displayName || slug; } catch { /* keep slug */ }
  sendJSON(res, 200, { ok: true, pet: { slug, displayName, ext } });
}

async function handleRemove(url, res) {
  const slug = url.searchParams.get('slug') || '';
  if (!SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, error: 'bad-slug' });
  await fs.rm(path.join(PETS_DIR, slug), { recursive: true, force: true });
  sendJSON(res, 200, { ok: true });
}

async function handleSprite(rest, res) {
  const match = rest.match(/^pet\/([a-z0-9-]+)\/sprite$/);
  if (!match) return sendJSON(res, 404, { ok: false, error: 'not-found' });
  const dir = path.join(PETS_DIR, match[1]);
  const ext = await findSpriteExt(dir);
  if (!ext) return sendJSON(res, 404, { ok: false, error: 'not-found' });
  const buf = await fs.readFile(path.join(dir, `spritesheet.${ext}`));
  res.writeHead(200, {
    'content-type': ext === 'png' ? 'image/png' : 'image/webp',
    'cache-control': 'public, max-age=86400',
  });
  res.end(buf);
}

async function handleAsset(url, res) {
  const target = url.searchParams.get('url') || '';
  if (!target.startsWith(ASSET_ORIGIN)) return sendJSON(res, 400, { ok: false, error: 'bad-url' });
  try {
    const upstream = await fetch(target, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) return sendJSON(res, 404, { ok: false, error: 'not-found' });
    res.writeHead(200, {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': 'public, max-age=86400',
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    const cause = error && error.cause ? ` (cause: ${error.cause.code || error.cause.message || error.cause})` : '';
    sendJSON(res, 502, { ok: false, error: String((error && error.message) || error) + cause });
  }
}

// ---------------------------------------------------------------------------
// Floating window (out-of-app pet): the Host spawns a child Electron process
// reusing the desktop shell's bundled binary. The child loads /float, which
// polls /status for the live { mode, slug } pushed by the in-app client.
// ---------------------------------------------------------------------------

const FLOAT_DIR = path.join(os.homedir(), '.petdex', 'dsh-float');
const RUNTIME_DIR = path.join(FLOAT_DIR, 'runtime');
const RUNTIME_VERSION = '45.2.2';
// A locally installed Electron is only adopted when it is at least this new;
// older builds have known macOS transparency / always-on-top defects.
const MIN_ELECTRON = '28.0.0';
// Version stamp for the downloaded runtime (Electron ships a `version` file, and
// macOS volumes are case-insensitive, so a plain VERSION would collide).
const STAMP_FILE = '.dsh-runtime-version';
// Optional override: point at any *development* Electron binary (a packaged
// app binary like the desktop shell's always boots its own app, never ours).
const ELECTRON_BIN = process.env.DESK_PET_ELECTRON || '';

// Nothing downloads by itself: the Host only resolves what is available, and
// the client asks the user before installing the runtime.
let runtimeState = {
  phase: 'unknown', // unknown|checking|missing|outdated|ready|downloading|extracting|failed
  source: '',       // env|bundled|detected|downloaded
  version: '',      // the version actually in use
  found: '',        // version found locally when it is too old
  bin: '',
  received: 0,
  total: 0,
  error: '',
};
function setRuntimeState(patch) {
  runtimeState = { ...runtimeState, ...patch };
}
function runtimeSummary() {
  return {
    phase: runtimeState.phase,
    source: runtimeState.source || '',
    version: runtimeState.version || '',
    found: runtimeState.found || '',
    bin: runtimeState.bin || '',
    received: runtimeState.received || 0,
    total: runtimeState.total || 0,
    error: runtimeState.error || '',
    required: RUNTIME_VERSION,
    minLocal: MIN_ELECTRON,
  };
}

function runtimeBinPath() {
  if (process.platform === 'darwin') return path.join(RUNTIME_DIR, 'Electron.app/Contents/MacOS/Electron');
  if (process.platform === 'win32') return path.join(RUNTIME_DIR, 'electron.exe');
  return path.join(RUNTIME_DIR, 'electron');
}

// ---- local Electron discovery -------------------------------------------------
// A standalone Electron on the machine makes the ~121MB download unnecessary.
// Only a real Electron counts: packaged apps (VS Code, Slack, DSH itself) embed
// their own app and cannot launch an arbitrary app directory.
// No caching: a user may install Electron while the app is running, and the
// scan is a handful of stat calls that only happens when opening the pet.

function electronCandidates() {
  const home = os.homedir();
  const out = [];
  const add = (p) => { if (p) out.push(p); };
  const electronApp = (root) => {
    if (process.platform === 'darwin') add(path.join(root, 'Electron.app/Contents/MacOS/Electron'));
    else if (process.platform === 'win32') add(path.join(root, 'electron.exe'));
    else add(path.join(root, 'electron'));
  };
  if (process.platform === 'darwin') {
    add('/Applications/Electron.app/Contents/MacOS/Electron');
    add(path.join(home, 'Applications/Electron.app/Contents/MacOS/Electron'));
  }
  // electron's own download cache (any version)
  const caches = process.platform === 'darwin'
    ? [path.join(home, 'Library/Caches/electron')]
    : process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'electron', 'Cache')]
      : [path.join(home, '.cache/electron')];
  // node_modules/electron in the workspace or the home directory
  for (const base of [process.cwd(), home]) electronApp(path.join(base, 'node_modules/electron/dist'));
  return { out, caches };
}

async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function isStandaloneElectron(bin) {
  if (!(await pathExists(bin))) return false;
  if (process.platform === 'darwin') {
    if (path.basename(bin) !== 'Electron') return false;
    const contents = path.dirname(path.dirname(bin));
    return pathExists(path.join(contents, 'Frameworks', 'Electron Framework.framework'));
  }
  return true;
}

async function findLocalElectron() {
  const { out, caches } = electronCandidates();
  const candidates = [...out];
  for (const cache of caches) {
    try {
      for (const entry of await fs.readdir(cache)) {
        if (process.platform === 'darwin') {
          candidates.push(path.join(cache, entry, 'Electron.app/Contents/MacOS/Electron'));
          candidates.push(path.join(cache, entry, 'electron', 'Electron.app/Contents/MacOS/Electron'));
        } else if (process.platform === 'win32') {
          candidates.push(path.join(cache, entry, 'electron.exe'));
        } else {
          candidates.push(path.join(cache, entry, 'electron'));
        }
      }
    } catch { /* no cache dir */ }
  }
  for (const bin of candidates) {
    if (await isStandaloneElectron(bin)) return bin;
  }
  return null;
}

function parseVersion(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function versionGte(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return true;
}
function friendlyError(error) {
  const message = String((error && error.message) || error);
  if (/ENOSPC/i.test(message)) return '磁盘空间不足，请清理后重试';
  if (/extract failed/i.test(message)) return '解压失败，请重试';
  if (/HTTP \d+/i.test(message)) return `下载服务暂时不可用（${message}）`;
  if (/abort/i.test(message)) return '';
  return '网络中断，请检查网络后重试';
}

async function execText(bin, args, timeout, env) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, windowsHide: true, env: env || process.env }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout || ''));
    });
  });
}

/** process.env without ELECTRON_RUN_AS_NODE: with it set, an Electron binary
 *  behaves like plain Node and `--version` reports the NODE version instead. */
function electronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/** Read an Electron build's own version, or '' when it cannot be determined. */
async function readElectronVersion(bin) {
  if (process.platform === 'darwin') {
    const contents = path.dirname(path.dirname(bin)); // .../Contents
    try {
      const out = await execText('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(contents, 'Info.plist')], 3000);
      const value = out.trim();
      if (parseVersion(value)) return value;
    } catch { /* fall through */ }
  }
  for (const candidate of [path.join(path.dirname(bin), 'version'), path.join(path.dirname(path.dirname(bin)), 'version')]) {
    try {
      const value = (await fs.readFile(candidate, 'utf8')).trim();
      if (parseVersion(value)) return value;
    } catch { /* next candidate */ }
  }
  try {
    const out = await execText(bin, ['--version'], 2500, electronEnv());
    const m = /\d+\.\d+\.\d+/.exec(out);
    if (m) return m[0];
  } catch { /* unknown */ }
  return '';
}

async function readRuntimeStamp() {
  try {
    return (await fs.readFile(path.join(RUNTIME_DIR, STAMP_FILE), 'utf8')).trim();
  } catch {
    return '';
  }
}

/** Resolve a usable runtime WITHOUT downloading anything. */
async function resolveRuntime() {
  setRuntimeState({ phase: 'checking', found: '', error: '', received: 0, total: 0 });
  if (ELECTRON_BIN) {
    if (await pathExists(ELECTRON_BIN)) {
      const version = await readElectronVersion(ELECTRON_BIN);
      setRuntimeState({ phase: 'ready', source: 'env', bin: ELECTRON_BIN, version, received: 1, total: 1 });
    } else {
      setRuntimeState({ phase: 'failed', error: '指定的 Electron 路径不存在，请检查 DESK_PET_ELECTRON' });
    }
    return runtimeSummary();
  }
  const bin = runtimeBinPath();
  if (await pathExists(bin)) {
    const version = (await readElectronVersion(bin)) || (await readRuntimeStamp());
    if (version && !versionGte(version, RUNTIME_VERSION)) {
      setRuntimeState({ phase: 'outdated', source: 'bundled', bin, version, found: version });
    } else {
      setRuntimeState({ phase: 'ready', source: 'bundled', bin, version: version || RUNTIME_VERSION, received: 1, total: 1 });
    }
    return runtimeSummary();
  }
  const local = await findLocalElectron();
  if (local) {
    const version = await readElectronVersion(local);
    if (version && !versionGte(version, MIN_ELECTRON)) {
      setRuntimeState({ phase: 'outdated', source: 'detected', bin: local, version, found: version });
    } else {
      setRuntimeState({ phase: 'ready', source: 'detected', bin: local, version, received: 1, total: 1 });
    }
    return runtimeSummary();
  }
  setRuntimeState({ phase: 'missing', source: '', bin: '', version: '' });
  return runtimeSummary();
}

let installAbort = null;
let installPromise = null;

function cancelInstall() {
  if (installAbort) {
    try { installAbort.abort(); } catch { /* already aborted */ }
  }
}

/** Download and unpack the runtime; runs in the background so the UI can poll. */
async function installRuntime() {
  if (installPromise) return installPromise;
  const controller = new AbortController();
  const { signal } = controller;
  installAbort = controller;
  const resumePhase = runtimeState.phase === 'outdated' ? 'outdated' : 'missing';
  const zipPath = path.join(FLOAT_DIR, 'electron-runtime.zip');
  // Flip to downloading BEFORE returning: the POST response must already say so,
  // otherwise the very first click looks like it did nothing.
  setRuntimeState({ phase: 'downloading', source: 'downloading', received: 0, total: 0, error: '' });
  installPromise = (async () => {
    try {
      const zipUrl = `https://registry.npmmirror.com/-/binary/electron/v${RUNTIME_VERSION}/electron-v${RUNTIME_VERSION}-${process.platform}-${process.arch}.zip`;
      await fs.mkdir(RUNTIME_DIR, { recursive: true });
      const resp = await fetch(zipUrl, { redirect: 'follow', signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const total = Number(resp.headers.get('content-length')) || 0;
      setRuntimeState({ total });
      const { createWriteStream } = await import('node:fs');
      const out = createWriteStream(zipPath);
      let received = 0;
      for await (const chunk of resp.body) {
        received += chunk.length;
        setRuntimeState({ received });
        if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
      setRuntimeState({ phase: 'extracting', received, total: total || received });
      const { spawn } = await import('node:child_process');
      await new Promise((resolve, reject) => {
        const [cmd, args] = process.platform === 'win32'
          ? ['tar', ['-xf', zipPath, '-C', RUNTIME_DIR]]
          : ['unzip', ['-q', '-o', zipPath, '-d', RUNTIME_DIR]];
        const child = spawn(cmd, args, { stdio: 'ignore' });
        const onAbort = () => { try { child.kill(); } catch { /* gone */ } };
        signal.addEventListener('abort', onAbort);
        child.on('exit', (code) => {
          signal.removeEventListener('abort', onAbort);
          if (code === 0) resolve();
          else reject(new Error(`extract failed (code ${code})`));
        });
        child.on('error', reject);
      });
      await fs.rm(zipPath, { force: true });
      const bin = runtimeBinPath();
      await fs.access(bin);
      await fs.writeFile(path.join(RUNTIME_DIR, STAMP_FILE), RUNTIME_VERSION);
      setRuntimeState({ phase: 'ready', source: 'downloaded', bin, version: RUNTIME_VERSION, received: total || received, total: total || received });
      // The user activated the pet before installing: honour that intent now.
      if (pendingActivation) {
        pendingActivation = false;
        liveStatus = { ...liveStatus, petOn: true };
        openFloatWindow({}).catch(() => {});
      }
    } catch (error) {
      await fs.rm(zipPath, { force: true }).catch(() => {});
      if (signal.aborted) {
        // A cancelled extraction leaves partial files; drop the whole directory.
        await fs.rm(RUNTIME_DIR, { recursive: true, force: true }).catch(() => {});
        setRuntimeState({ phase: resumePhase, source: '', bin: '', version: '', received: 0, total: 0, error: '' });
      } else {
        setRuntimeState({ phase: 'failed', error: friendlyError(error) });
      }
    } finally {
      installAbort = null;
      installPromise = null;
    }
  })();
  return installPromise;
}

// opacity: bubble alpha set from the settings slider (0.3 – 1, default 0.9)
// postedAt: when the Web UI last pushed a status. A stale value means the pet is
// showing a snapshot nobody is refreshing any more.
let liveStatus = { postedAt: 0, mode: 'idle', slug: '', task: '', kind: '', sessionId: '', opacity: 0.9, size: 1, wx: 0, wy: 0, ww: 0, wh: 0, petOn: true };
let followRelease = false; // set true when the in-app pointer is released after a drag-out
let floatChild = null;
// Set when the user wants the pet but the runtime is not ready yet; honoured
// the moment the runtime finishes installing.
let pendingActivation = false;
let serverOrigin = null;

const FLOAT_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Desk Pet</title>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; }
  body { user-select: none; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  #pet { position: relative; width: 96px; height: 104px; cursor: grab;
         opacity: var(--pet-alpha, 0.9); transform: scale(var(--pet-scale, 1)); transform-origin: 50% 100%;
         transition: opacity 0.18s ease, transform 0.18s ease; }
  #pet.grabbing { cursor: grabbing; }
  #bob { animation: bob 2.6s ease-in-out infinite; transform-origin: 50% 100%; }
  #bob.busy { animation-duration: 0.9s; }
  #bob.jump { animation: jump 0.9s ease-in-out infinite; }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes jump { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px); } }
  #halo {
    position: absolute; inset: -20px; border-radius: 50%; pointer-events: none; z-index: -1;
    display: none; animation: haloPulse 2.4s ease-in-out infinite;
  }
  @keyframes haloPulse { 0%, 100% { opacity: 0.45; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.06); } }
  canvas { display: block; pointer-events: none; }
  #cat { display: none; pointer-events: none; }
  #cat .tail { transform-box: fill-box; transform-origin: 0% 100%; animation: tail 1.8s ease-in-out infinite; }
  #bob.busy #cat .tail { animation-duration: 0.6s; }
  @keyframes tail { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(10deg); } }
  /* ---- speech bubble -------------------------------------------------
     Skeuomorphic "paper sticker": top-lit gradient, hairline edge with an
     inner highlight, layered contact/ambient shadow, and a soft tail that
     points at the pet. Centred on the pet (never offset to an edge) so it
     can never hang outside the 300px window. */
  .bubble {
    --tail: #f2f2f6;
    opacity: var(--bubble-alpha, 0.9);
    position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%);
    display: none; align-items: flex-start; gap: 7px;
    box-sizing: border-box; width: max-content; max-width: 282px;
    padding: 7px 11px;
    border-radius: 14px;
    font: 12px/1.45 -apple-system, "PingFang SC", "Segoe UI", sans-serif;
    letter-spacing: 0.005em;
    color: #33333b; text-align: left;
    text-shadow: 0 1px 0 rgba(255,255,255,0.7);
    background: linear-gradient(180deg, #ffffff 0%, #f2f2f6 100%);
    border: 1px solid #e1e1e9;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.95),
      0 1px 1px rgba(16,16,24,0.07),
      0 6px 18px -6px rgba(16,16,24,0.30);
    pointer-events: none; white-space: normal; overflow-wrap: anywhere; word-break: break-word;
    transition: transform 0.14s cubic-bezier(0.2,0.8,0.3,1), box-shadow 0.18s ease, filter 0.12s ease;
  }
  /* tail: a soft diamond that covers the bubble's bottom edge in the mouth,
     so the outline reads as one continuous shape */
  .bubble::after {
    content: ''; position: absolute; left: 50%; bottom: -3px;
    width: 11px; height: 11px; margin-left: -5.5px;
    background: var(--tail); border-radius: 4px;
    transform: rotate(45deg); pointer-events: none;
    box-shadow: 1px 2px 3px -2px rgba(16,16,24,0.20);
  }
  .bubble .txt {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; min-width: 0; max-width: 224px;
  }
  /* macOS will not change the system cursor from a non-activating window, so
     a clickable bubble advertises itself with a chevron that slides in. */
  .bubble .jump {
    display: block; flex: none; margin-top: 1px;
    font: 500 13px/1.2 -apple-system, "Segoe UI", sans-serif;
    color: #a2a7af; text-shadow: none;
    opacity: 0; transform: translateX(-3px);
    transition: opacity 0.14s ease, transform 0.16s cubic-bezier(0.2,0.8,0.3,1);
  }
  .bubble.alert .jump { color: #b8811f; }
  .bubble.status { color: #5f646c; }
  /* Only a bubble that can reach a session is interactive. */
  .bubble.clickable { pointer-events: auto; cursor: pointer; }
  .bubble.clickable:hover {
    transform: translateX(-50%) translateY(-2px);
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.98),
      0 2px 4px rgba(16,16,24,0.10),
      0 14px 28px -10px rgba(16,16,24,0.36);
  }
  .bubble.clickable:hover .jump { opacity: 1; transform: none; }
  .bubble.clickable:active { transform: translateX(-50%) translateY(0); filter: brightness(0.97); }
  .bubble.clickable .txt { cursor: pointer; }
  /* waiting: warm lamplight on paper */
  .bubble.alert {
    --tail: #fdf1e0;
    background: linear-gradient(180deg, #fffdf9 0%, #fdf1e0 100%);
    border-color: #f0d5a4; color: #3a2f1c;
    animation: alertGlow 1.8s ease-in-out infinite;
  }
  @keyframes alertGlow {
    0%, 100% {
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 1px rgba(16,16,24,0.07),
                  0 0 0 1px rgba(245,158,11,0.14), 0 6px 18px -6px rgba(16,16,24,0.30),
                  0 0 16px -2px rgba(245,158,11,0.35);
    }
    50% {
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 1px rgba(16,16,24,0.07),
                  0 0 0 1px rgba(245,158,11,0.24), 0 6px 18px -6px rgba(16,16,24,0.30),
                  0 0 26px -2px rgba(245,158,11,0.55);
    }
  }
  /* status bead: 7px glossy pill, coloured per sidebar state */
  #dot, #dot2 {
    width: 7px; height: 7px; border-radius: 50%; flex: none; display: none;
    margin-top: 4px; box-sizing: border-box;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.65),
      inset 0 -1px 1px rgba(0,0,0,0.16),
      0 0 0 3px rgba(120,124,132,0.10);
    animation: dotPulse 1s ease-in-out infinite;
  }
  @keyframes dotPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  /* pet swap: the bead turns into a spinner so a slow sheet reads as work */
  .bubble.loading #dot {
    width: 8px; height: 8px; background: transparent !important; box-shadow: none;
    border: 1.5px solid rgba(129,133,140,0.28); border-top-color: #81858c;
    animation: dotSpin 0.7s linear infinite;
  }
  @keyframes dotSpin { to { transform: rotate(360deg); } }
  @media (prefers-color-scheme: dark) {
    .bubble {
      --tail: #26262e;
      color: #ececf1; text-shadow: 0 1px 0 rgba(0,0,0,0.55);
      background: linear-gradient(180deg, #2e2e37 0%, #26262e 100%);
      border-color: #3a3a44;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.07),
        0 1px 1px rgba(0,0,0,0.45),
        0 8px 22px -6px rgba(0,0,0,0.55);
    }
    .bubble::after { box-shadow: 2px 2px 4px -2px rgba(0,0,0,0.55); }
    .bubble.status { color: #a8acb4; }
    .bubble .jump { color: #6f7480; }
    .bubble.alert {
      --tail: #2b2620;
      background: linear-gradient(180deg, #322c24 0%, #2b2620 100%);
      border-color: rgba(245,158,11,0.42); color: #f2e9db;
    }
    @keyframes alertGlow {
      0%, 100% {
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 1px rgba(0,0,0,0.45),
                    0 0 0 1px rgba(245,158,11,0.18), 0 8px 22px -6px rgba(0,0,0,0.55),
                    0 0 16px -2px rgba(245,158,11,0.32);
      }
      50% {
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 1px rgba(0,0,0,0.45),
                    0 0 0 1px rgba(245,158,11,0.30), 0 8px 22px -6px rgba(0,0,0,0.55),
                    0 0 26px -2px rgba(245,158,11,0.5);
      }
    }
    .bubble.clickable:hover {
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.09),
        0 2px 5px rgba(0,0,0,0.5),
        0 16px 30px -10px rgba(0,0,0,0.6);
    }
  }
</style>
<div id="pet">
  <div id="halo"></div>
  <div class="bubble status"><span id="dot"></span><span class="txt" id="btxt"></span><span class="jump">›</span></div>
  <div class="bubble alert"><span id="dot2"></span><span class="txt" id="btxt2"></span><span class="jump">›</span></div>
  <div class="bubble greet"><span class="txt" id="btxt3"></span></div>
  <div id="bob">
    <canvas id="c"></canvas>
    <svg id="cat" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" style="display:block;pointer-events:none;overflow:visible">
      <ellipse cx="48" cy="88" rx="22" ry="4" fill="rgba(0,0,0,0.15)"/>
      <path class="tail" d="M74 72 Q93 68 90 48" stroke="#f5b942" stroke-width="8" stroke-linecap="round" fill="none"/>
      <path d="M26 38 L17 9 L47 26 Z" fill="#f2b950"/>
      <path d="M70 38 L79 9 L49 26 Z" fill="#f2b950"/>
      <path d="M28 32 L23 16 L40 26 Z" fill="#ff9e9e"/>
      <path d="M68 32 L73 16 L56 26 Z" fill="#ff9e9e"/>
      <circle cx="48" cy="54" r="30" fill="#ffd166"/>
      <ellipse cx="32" cy="60" rx="5" ry="3.2" fill="#ffab9e" opacity="0.8"/>
      <ellipse cx="64" cy="60" rx="5" ry="3.2" fill="#ffab9e" opacity="0.8"/>
      <g id="eyesOpen">
        <circle cx="38" cy="50" r="4.5" fill="#3a2c1a"/>
        <circle cx="39.6" cy="48.4" r="1.5" fill="#ffffff"/>
        <circle cx="58" cy="50" r="4.5" fill="#3a2c1a"/>
        <circle cx="59.6" cy="48.4" r="1.5" fill="#ffffff"/>
      </g>
      <g id="eyesHappy" style="display:none">
        <path d="M32 53 Q38 46 44 53" stroke="#3a2c1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M52 53 Q58 46 64 53" stroke="#3a2c1a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M41 62 Q44.5 65 48 62 Q51.5 65 55 62" stroke="#3a2c1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </svg>
  </div>
</div>
<script>
'use strict';
// Screen-pet renderer v3: the pet IS the small floating window (petdex
// pattern). Dragging is main-process cursor-follow; position lives in the
// window itself and persists via the Host/child. No per-display handoff.
var qs = new URLSearchParams(location.search);
var SIZE = 96, RATIO = 208 / 192, H = Math.round(SIZE * RATIO);

// ---- DOM ----
var pet = document.getElementById('pet');
var bob = document.getElementById('bob');
var halo = document.getElementById('halo');
var canvas = document.getElementById('c');
var cat = document.getElementById('cat');
var eyesOpen = document.getElementById('eyesOpen');
var eyesHappy = document.getElementById('eyesHappy');
var statusBubble = document.querySelector('.bubble.status');
var alertBubble = document.querySelector('.bubble.alert');
var greetBubble = document.querySelector('.bubble.greet');
var dotEl = document.getElementById('dot');
var dot2El = document.getElementById('dot2');
var btxtEl = document.getElementById('btxt');
var btxt2El = document.getElementById('btxt2');
var btxt3El = document.getElementById('btxt3');
var ctx2d = canvas.getContext('2d');
var dpr = window.devicePixelRatio || 1;
canvas.width = SIZE * dpr; canvas.height = H * dpr;
canvas.style.width = SIZE + 'px'; canvas.style.height = H + 'px';

// ---- i18n ----
var zh = (navigator.language || '').toLowerCase().indexOf('zh') === 0;
var GREETS = zh ? ['你好呀！👋', '需要帮忙吗？', '再摸摸我！', '我在装睡呢~']
                : ['Hi there! 👋', 'Need a hand?', 'Pet me again!', 'Zzz... just kidding!'];
var STATUS_TEXT = {
  working: zh ? '正在工作…' : 'Working…',
  waiting: zh ? '等你操作' : 'Waiting for you',
  done: zh ? '已完成' : 'Finished'
};
var KIND_TEXT = {
  approval: zh ? '有审批等你处理' : 'Approval needed',
  question: zh ? '有问题等你回答' : 'Question for you',
  'plan-review': zh ? '有计划等你评审' : 'Plan to review'
};

// ---- sprite atlas geometry (petdex format) ----
function uniform(n, d, l) { var f = []; for (var i = 0; i < n; i++) f.push([i, i === n - 1 ? l : d]); return f; }
var STATES = {
  idle: { row: 0, frames: [[0,280],[1,110],[2,110],[3,140],[4,140],[5,320]] },
  'running-right': { row: 1, frames: uniform(8, 120, 220) },
  'running-left': { row: 2, frames: uniform(8, 120, 220) },
  waving: { row: 3, frames: uniform(4, 140, 280) },
  jumping: { row: 4, frames: uniform(5, 140, 280) },
  waiting: { row: 6, frames: uniform(6, 150, 260) },
  running: { row: 7, frames: uniform(6, 120, 220) }
};

// ---- data-driven mode → presentation mapping (extend by adding a row) ----
// halo/dot colours mirror the Web UI sidebar's session-row status dots.
var DOT_WORKING = '#81858c';
var DOT_WAITING = '#f59e0b';
var DOT_DONE = '#22c55e';
var MODE_VIEW = {
  idle:    { anim: 'idle',    halo: null,        bubble: null },
  working: { anim: 'running', halo: DOT_WORKING, bubble: 'status', bob: 'busy' },
  waiting: { anim: 'jumping', halo: DOT_WAITING, bubble: 'alert' },
  done:    { anim: 'idle',    halo: DOT_DONE,    bubble: 'status' }
};

// ---- sprite cache + seamless swap ----
var img = null, slug = '';
var imgCache = {};
// True while a newly selected pet's sheet is downloading: the previous pet
// stays on screen (no flash of the built-in cat) and the bubble spins.
var switching = false, switchTimer = null;
function endSwitching() {
  if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; }
  if (!switching) return;
  switching = false;
  render();
}
function loadPet(s) {
  slug = s;
  if (!s) { img = null; switching = false; syncPetView(); render(); return; }
  if (imgCache[s]) { img = imgCache[s]; switching = false; syncPetView(); render(); return; }
  switching = true;
  if (switchTimer) clearTimeout(switchTimer);
  // A hung download must not leave a permanent spinner.
  switchTimer = setTimeout(endSwitching, 12000);
  render();
  var next = new Image();
  next.onload = function () {
    imgCache[s] = next;
    if (slug === s) { img = next; switching = false; if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; } syncPetView(); render(); }
  };
  next.onerror = function () {
    // Keep whatever was on screen (previous pet or built-in cat) rather than
    // flashing an empty window for a broken sprite.
    if (slug === s) endSwitching();
  };
  next.src = '/api/desk-pet/pet/' + encodeURIComponent(s) + '/sprite';
}
function syncPetView() {
  canvas.style.display = img ? 'block' : 'none';
  cat.style.display = img ? 'none' : 'block';
}

// ---- view state ----
var mode = 'idle', kind = '', taskText = '', currentSessionId = '';
// Bubble alpha, driven live by the settings slider (Host round-trips it).
var bubbleAlpha = 0.9, petScale = 1;
function applyBubbleAlpha(a) {
  if (a === bubbleAlpha) return;
  bubbleAlpha = a;
  document.documentElement.style.setProperty('--bubble-alpha', String(a));
}
// Whole-layer alpha and scale (settings page sliders): the bubble keeps its
// own alpha var so older hosts still work.
function applyLayerAlpha(a) {
  document.documentElement.style.setProperty('--pet-alpha', String(a));
  document.documentElement.style.setProperty('--bubble-alpha', String(a));
}
function applyLayerScale(k) {
  var clamped = Math.min(1.3, Math.max(0.75, k));
  if (clamped === petScale) return;
  petScale = clamped;
  document.documentElement.style.setProperty('--pet-scale', String(clamped));
  if (window.deskPet && window.deskPet.setScale) window.deskPet.setScale(clamped);
}
var greetUntil = 0, dragging = false, dragMoved = false, lastDir = 1;

function hexA(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// signature-diffed render: only touch the DOM when the presentation changes
var lastSig = '';
function paintDot(el, color) {
  el.style.background = color;
  el.style.display = 'block';
}
function render() {
  var now = Date.now();
  var view = MODE_VIEW[mode] || MODE_VIEW.idle;
  var anim = greetUntil > now ? 'waving'
    : dragging ? (lastDir < 0 ? 'running-left' : 'running-right')
    : view.anim;
  // Priority: a pet swap outranks everything (it is the visible feedback of
  // the click that caused it), then a greeting, then the live session state.
  var bubbleKind = switching ? 'switch'
    : greetUntil > now ? 'greet'
    : (view.bubble || '');
  var dotColor = view.halo || DOT_WORKING;
  var sig = [anim, bubbleKind, mode, kind, taskText, view.halo || '', switching ? 1 : 0,
    currentSessionId ? 1 : 0, dragging ? 1 : 0, img ? 1 : 0, now < greetUntil ? 1 : 0,
    now < hintUntil ? 1 : 0].join('|');
  if (sig === lastSig) return;
  lastSig = sig;

  var showingHint = hintUntil > now;
  var showStatus = !showingHint && (bubbleKind === 'status' || bubbleKind === 'switch');
  // Only a bubble that can actually reach a session is interactive: it then
  // takes pointer events (hand cursor + click), otherwise it stays click-through.
  var clickable = !!currentSessionId;
  statusBubble.classList.toggle('clickable', clickable);
  alertBubble.classList.toggle('clickable', clickable);
  greetBubble.style.display = bubbleKind === 'greet' ? 'flex' : 'none';
  alertBubble.style.display = !showingHint && bubbleKind === 'alert' ? 'flex' : 'none';
  statusBubble.style.display = showStatus ? 'flex' : 'none';
  if (bubbleKind === 'alert') {
    btxt2El.textContent = (KIND_TEXT[kind] || STATUS_TEXT.waiting) + (taskText ? ' · ' + taskText : '');
    paintDot(dot2El, dotColor);
  }
  if (bubbleKind === 'switch') {
    btxtEl.textContent = zh ? '换装中…' : 'Switching…';
    dotEl.style.background = 'transparent';
    dotEl.style.display = 'block';
    statusBubble.classList.add('loading');
  } else if (bubbleKind === 'status') {
    btxtEl.textContent = STATUS_TEXT[mode] + (taskText ? ' · ' + taskText : '');
    paintDot(dotEl, dotColor);
    statusBubble.classList.remove('loading');
  } else {
    statusBubble.classList.remove('loading');
  }
  halo.style.display = view.halo && !dragging ? 'block' : 'none';
  if (view.halo) halo.style.background = 'radial-gradient(ellipse at center, ' + hexA(view.halo, 0.38) + ', transparent 70%)';
  bob.className = dragging ? '' : (view.bob || '');
  eyesHappy.style.display = now < greetUntil ? 'block' : 'none';
  eyesOpen.style.display = now < greetUntil ? 'none' : 'block';
  currentAnim = anim;
}
setInterval(render, 200);

// blink (built-in cat only)
setInterval(function () {
  if (img) return;
  eyesOpen.setAttribute('transform', 'translate(0 50) scale(1 0.12) translate(0 -50)');
  setTimeout(function () { eyesOpen.removeAttribute('transform'); }, 160);
}, 3200);

// ---- draw-on-demand sprite loop ----
var currentAnim = 'idle';
var fi = 0, last = 0, acc = 0;
var lastDrawKey = '';
function draw(ts) {
  try {
    var spec = STATES[currentAnim] || STATES.idle;
    // Frame counts differ per state (idle=6, running=8): clamp on switch.
    if (fi >= spec.frames.length) { fi = 0; acc = 0; }
    if (!last) last = ts;
    acc += ts - last; last = ts;
    if (acc >= spec.frames[fi][1]) { acc = 0; fi = (fi + 1) % spec.frames.length; }
    var col = spec.frames[fi][0];
    // Only repaint when the visible frame actually changed.
    var key = currentAnim + ':' + col + ':' + (img ? img.src : 'cat');
    if (key !== lastDrawKey) {
      lastDrawKey = key;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      if (img) {
        var fw = img.naturalWidth / 8, fh = fw * RATIO;
        ctx2d.drawImage(img, col * fw, spec.row * fh, fw, fh, 0, 0, canvas.width, canvas.height);
      }
    }
  } catch (err) { /* keep animating next frame */ }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---- drag: main-process cursor follow; click = press without move ----
var lastSX = 0, lastSY = 0;
pet.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  dragging = true;
  dragMoved = false;
  lastSX = e.screenX;
  lastSY = e.screenY;
  pet.classList.add('grabbing');
  if (window.deskPet) window.deskPet.dragStart(e.clientX, e.clientY);
});
window.addEventListener('mousemove', function (e) {
  if (!dragging) return;
  if (Math.abs(e.screenX - lastSX) + Math.abs(e.screenY - lastSY) > 3) {
    dragMoved = true;
    lastDir = e.screenX > lastSX ? 1 : -1;
    lastSX = e.screenX;
    lastSY = e.screenY;
  }
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove('grabbing');
  if (window.deskPet) window.deskPet.dragEnd();
}
window.addEventListener('mouseup', function () {
  if (!dragging) return;
  var wasMoved = dragMoved;
  endDrag();
  if (!wasMoved) {
    btxt3El.textContent = GREETS[Math.floor(Math.random() * GREETS.length)];
    greetUntil = Date.now() + 2600;
    render();
    // Clicking the pet raises the app too.
    if (window.deskPet && window.deskPet.focusApp) window.deskPet.focusApp();
  }
});
// recover if a mouseup is ever lost
var lastMoveAt = 0;
window.addEventListener('mousemove', function () { lastMoveAt = Date.now(); });
setInterval(function () {
  if (dragging && Date.now() - lastMoveAt > 3000) endDrag();
}, 1000);
// Right-click opens the menu; choosing Hide shows where to re-activate first.
var hintUntil = 0;
pet.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  if (window.deskPet) window.deskPet.menu();
});
if (window.deskPet && window.deskPet.onHintBeforeHide) {
  window.deskPet.onHintBeforeHide(function () {
    btxt3El.textContent = zh
      ? '我先躲起来了，想我时去「我的宠物」页面激活我'
      : 'Hiding now — bring me back from “My pets” anytime';
    hintUntil = Date.now() + 3000;
    greetUntil = hintUntil;
    setTimeout(function () { if (window.deskPet) window.deskPet.quitPet(); }, 3000);
  });
}

// ---- bubbles jump to the session (and raise the app) ----
// Silent on purpose: the visible result is the app coming forward on the
// right session, no extra "jumped" toast bubble.
function jumpToSession() {
  if (!currentSessionId || !window.deskPet) return;
  if (window.deskPet.openSession) window.deskPet.openSession(currentSessionId);
  if (window.deskPet.focusApp) window.deskPet.focusApp();
}
// A click on the bubble must not fall through to the pet underneath (which
// would start a drag and pop the greeting): stop the press and the click.
[statusBubble, alertBubble].forEach(function (el) {
  el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  el.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    jumpToSession();
  });
});

// ---- live status ----
function poll() {
  fetch('/api/desk-pet/status').then(function (r) { return r.json(); }).then(function (s) {
    if (!s) return;
    mode = s.mode || 'idle';
    kind = s.kind || '';
    taskText = s.task || '';
    currentSessionId = s.sessionId || '';
    var a = Number(s.opacity);
    applyLayerAlpha(Number.isFinite(a) ? Math.min(1, Math.max(0.3, a)) : 0.9);
    applyLayerScale(Number(s.size) || 1);
    if ((s.slug || '') !== slug) loadPet(s.slug || '');
    render();
  }).catch(function () {});
}
poll();
setInterval(poll, 350);
syncPetView();
render();
</script>`;



const CHILD_PRELOAD = `const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('deskPet', {
  dragStart: (dx, dy) => ipcRenderer.send('drag-start', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  menu: () => ipcRenderer.send('menu'),
  openSession: (id) => ipcRenderer.send('open-session', id),
  focusApp: () => ipcRenderer.send('focus-app'),
  setScale: (s) => ipcRenderer.send('scale', s),
  quitPet: () => ipcRenderer.send('quit-pet'),
  onHintBeforeHide: (cb) => ipcRenderer.on('hint-before-hide', () => cb()),
});
`;

const CHILD_MAIN = `const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const ORIGIN = process.env.DESK_PET_ORIGIN;
const FLOAT_DIR = path.join(os.homedir(), '.petdex', 'dsh-float');
const POS_FILE = path.join(FLOAT_DIR, 'pos.json');
app.setPath('userData', path.join(FLOAT_DIR, 'userData'));
// Keep the helper out of the Dock / app switcher: it is a decoration, not an app.
if (app.dock) app.dock.hide();

function postEvent(payload) {
  const body = typeof payload === 'string' ? { type: payload } : payload;
  fetch(ORIGIN + '/api/desk-pet/ui-event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

function loadSavedPos() {
  try { return JSON.parse(fs.readFileSync(POS_FILE, 'utf8')); } catch { return null; }
}
function savePos(x, y) {
  try { fs.writeFileSync(POS_FILE, JSON.stringify({ x, y })); } catch { /* best effort */ }
}

// A window whose center sits on a display that no longer exists is invisible
// and unreachable: park it on the primary display's bottom-right corner.
function clampToVisibleDisplay(win) {
  if (win.isDestroyed()) return;
  const b = win.getBounds();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const inside = screen.getAllDisplays().some((d) => {
    const a = d.bounds;
    return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height;
  });
  if (inside) return;
  const a = screen.getPrimaryDisplay().bounds;
  const nx = a.x + a.width - b.width - 24;
  const ny = a.y + a.height - b.height - 24;
  win.setPosition(nx, ny);
  savePos(nx, ny);
}

// A released window snaps fully inside the display under its center.
function snapToEdge(win) {
  const b = win.getBounds();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const d = screen.getDisplayNearestPoint({ x: cx, y: cy });
  const a = d.bounds;
  const nx = Math.min(Math.max(b.x, a.x), a.x + a.width - b.width);
  const ny = Math.min(Math.max(b.y, a.y), a.y + a.height - b.height);
  if (nx !== b.x || ny !== b.y) win.setPosition(nx, ny);
  savePos(nx, ny);
}

app.whenReady().then(() => {
  const zh = (app.getLocale() || '').toLowerCase().startsWith('zh');
  // A small movable window (the petdex pattern): macOS drags normal windows
  // across displays natively — only static full-span overlays get clipped.
  const seedX = Math.round(Number(process.env.DESK_PET_X) || 0);
  const seedY = Math.round(Number(process.env.DESK_PET_Y) || 0);
  const saved = loadSavedPos();
  let x;
  let y;
  if (saved && typeof saved.x === 'number'
      && screen.getAllDisplays().some((d) => {
        const a = d.bounds;
        return saved.x + 150 >= a.x && saved.x + 150 < a.x + a.width && saved.y + 88 >= a.y && saved.y + 88 < a.y + a.height;
      })) {
    // the saved spot still exists
    x = saved.x;
    y = saved.y;
  } else if (seedX && seedY) {
    x = seedX - 150;
    y = seedY - 88;
  } else {
    const c = screen.getCursorScreenPoint();
    const a = screen.getDisplayNearestPoint(c).bounds;
    x = a.x + a.width - 300 - 24;
    y = a.y + a.height - 175 - 24;
  }
  const win = new BrowserWindow({
    width: 300, height: 175, x, y,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, resizable: false, movable: true,
    focusable: false, hiddenInMissionControl: true, enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(FLOAT_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The settings page can resize the pet; anchor the bottom edge so the pet
  // does not jump on screen while scaling.
  const BASE_W = 300, BASE_H = 175;
  ipcMain.on('scale', (_event, value) => {
    const k = Math.min(1.3, Math.max(0.75, Number(value) || 1));
    const w = Math.round(BASE_W * k);
    const h = Math.round(BASE_H * k);
    const b = win.getBounds();
    if (b.width === w && b.height === h) return;
    win.setBounds({ x: b.x, y: b.y + (b.height - h), width: w, height: h });
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Hot-unplugged displays: the window must never be stranded off-screen.
  const rehome = () => clampToVisibleDisplay(win);
  screen.on('display-removed', rehome);
  screen.on('display-added', rehome);
  screen.on('display-metrics-changed', rehome);
  win.on('closed', () => {
    screen.removeListener('display-removed', rehome);
    screen.removeListener('display-added', rehome);
    screen.removeListener('display-metrics-changed', rehome);
  });
  // The overlay animates forever; Chromium's background throttling would
  // otherwise freeze rAF at random (the occasional dead-pet bug).
  win.webContents.setBackgroundThrottling(false);
  win.loadURL(ORIGIN + '/api/desk-pet/float');
  win.on('closed', () => app.quit());
  win.on('moved', () => {
    const b = win.getBounds();
    savePos(b.x, b.y);
  });

  // Drag: renderer reports start/end once; the main process follows the
  // cursor directly — native-feel, crosses displays, no polling handoff.
  let dragTimer = null;
  let gdx = 0;
  let gdy = 0;
  ipcMain.on('drag-start', (_e, dx, dy) => {
    gdx = dx;
    gdy = dy;
    if (dragTimer) return;
    dragTimer = setInterval(() => {
      if (win.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      win.setPosition(Math.round(p.x - gdx), Math.round(p.y - gdy));
    }, 8);
  });
  ipcMain.on('drag-end', () => {
    if (dragTimer) {
      clearInterval(dragTimer);
      dragTimer = null;
    }
    if (!win.isDestroyed()) snapToEdge(win);
  });
  ipcMain.on('open-session', (_e, id) => {
    if (typeof id === 'string' && id) postEvent({ type: 'open-session', sessionId: id });
  });
  // Raise the DSH app by bundle id (name-independent).
  ipcMain.on('focus-app', () => {
    if (process.platform !== 'darwin') return;
    try {
      require('node:child_process').spawn('/usr/bin/open', ['-b', 'com.deepseek.dsh'], { detached: true, stdio: 'ignore' }).unref();
    } catch { /* best effort */ }
  });
  ipcMain.on('quit-pet', () => postEvent('quit-pet'));
  ipcMain.on('menu', () => {
    if (win.isDestroyed()) return;
    const menu = Menu.buildFromTemplate([
      { label: zh ? '设置宠物' : 'Pet settings', click: () => postEvent('open-settings') },
      { type: 'separator' },
      { label: zh ? '隐藏' : 'Hide', click: () => { if (!win.isDestroyed()) win.webContents.send('hint-before-hide'); } },
    ]);
    menu.popup({ window: win });
  });
});
`;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function handleStatus(req, res) {
  if (req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const rawOpacity = Number(body.opacity);
      liveStatus = {
        postedAt: Date.now(),
        mode: String(body.mode || 'idle'),
        slug: String(body.slug || ''),
        task: String(body.task || ''),
        kind: String(body.kind || ''),
        sessionId: String(body.sessionId || ''),
        opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0.3, rawOpacity)) : 0.9,
        size: Number.isFinite(Number(body.size)) ? Math.min(1.3, Math.max(0.75, Number(body.size))) : 1,
        wx: Number(body.wx) || 0,
        wy: Number(body.wy) || 0,
        ww: Number(body.ww) || 0,
        wh: Number(body.wh) || 0,
        // the heartbeat rebuilds liveStatus — carry the switch through
        petOn: liveStatus.petOn !== false,
      };
    } catch { /* keep previous status */ }
    return sendJSON(res, 200, { ok: true, petOn: liveStatus.petOn });
  }
  sendJSON(res, 200, { ok: true, ...liveStatus });
}

function handleFloat(res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(FLOAT_HTML);
}

const PID_FILE = path.join(FLOAT_DIR, 'child.pid');

/** Kill any stale floating-window process from a previous Host generation —
 *  it would otherwise linger as a frozen second pet polling a dead origin. */
async function killStaleChild() {
  try {
    const pid = Number((await fs.readFile(PID_FILE, 'utf8')).trim());
    if (pid) {
      try { process.kill(pid); } catch { /* already gone */ }
    }
  } catch { /* no pid file */ }
  await fs.rm(PID_FILE, { force: true }).catch(() => {});
}

/** Sweep EVERY Electron process spawned for the float app (args contain the
 *  dsh-float dir), regardless of pid-file state — the only reliable cleanup
 *  for zombies left by buggy older generations. Never kills the live child. */
async function killOrphanChildren() {
  if (process.platform === 'win32') return killStaleChild();
  try {
    const { spawn } = await import('node:child_process');
    const out = await new Promise((resolve, reject) => {
      const p = spawn('ps', ['-eo', 'pid=,args=']);
      let data = '';
      p.stdout.on('data', (chunk) => { data += chunk; });
      p.on('exit', () => resolve(data));
      p.on('error', reject);
    });
    const selfPid = process.pid;
    const currentPid = floatChild && floatChild.pid;
    for (const line of out.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const args = match[2];
      // Only the float app's own Electron runtime processes: a bare
      // 'dsh-float' substring would also match unrelated shells/editors.
      if (!args.includes('dsh-float/runtime')) continue;
      if (pid === selfPid || pid === currentPid) continue;
      try { process.kill(pid); } catch { /* already gone */ }
    }
  } catch { /* ps unavailable */ }
}

let floatOpening = false;

async function openFloatWindow({ x = 0, y = 0, follow = false } = {}) {
  // Serialize opens: concurrent calls must not both pass the liveness
  // check and spawn duplicate overlay windows.
  if (floatOpening) return { ok: true, already: true };
  floatOpening = true;
  try {
    if (floatChild && !floatChild.killed) return { ok: true, already: true };
    if (!serverOrigin) throw new Error('server origin unavailable');
    // The pet only starts on a prepared runtime; installing is a user decision
    // handled by /runtime/install. Re-resolve (never download) so a fresh Host
    // that has not been checked yet still starts correctly.
    if (runtimeState.phase !== 'ready') await resolveRuntime();
    if (runtimeState.phase !== 'ready' || !(runtimeState.bin || runtimeBinPath())) {
      return { ok: false, error: 'runtime-not-ready', phase: runtimeState.phase };
    }
    await killStaleChild();
    await killOrphanChildren();
    const bin = runtimeState.bin || runtimeBinPath();
    await fs.mkdir(FLOAT_DIR, { recursive: true });
    await fs.writeFile(path.join(FLOAT_DIR, 'package.json'), JSON.stringify({ name: 'desk-pet-float', version: '1.0.0', main: 'main.js' }));
    await fs.writeFile(path.join(FLOAT_DIR, 'main.js'), CHILD_MAIN);
    await fs.writeFile(path.join(FLOAT_DIR, 'preload.js'), CHILD_PRELOAD);
    followRelease = false;
    // The Harness session exports ELECTRON_RUN_AS_NODE=1 to subprocesses; left
    // in place, the child would run as plain Node without the electron module.
    const env = electronEnv();
    const { spawn } = await import('node:child_process');
    floatChild = spawn(bin, [FLOAT_DIR], {
      env: {
        ...env,
        DESK_PET_ORIGIN: serverOrigin,
        DESK_PET_X: String(x),
        DESK_PET_Y: String(y),
        ...(follow ? { DESK_PET_FOLLOW: '1' } : {}),
      },
      detached: true,
      stdio: 'ignore',
    });
    floatChild.on('exit', () => {
      floatChild = null;
      fs.rm(PID_FILE, { force: true }).catch(() => {});
    });
    floatChild.unref();
    if (floatChild.pid) await fs.writeFile(PID_FILE, String(floatChild.pid));
    // a toggle may have flipped off while we were spawning: honour the latest state
    if (liveStatus.petOn === false && floatChild) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  } finally {
    floatOpening = false;
  }
}

async function handleFloatOpen(url, res) {
  const x = Math.max(0, Math.round(Number(url.searchParams.get('x')) || 0));
  const y = Math.max(0, Math.round(Number(url.searchParams.get('y')) || 0));
  const follow = url.searchParams.get('follow') === '1';
  sendJSON(res, 200, await openFloatWindow({ x, y, follow }));
}

function handleFloatClose(res) {
  if (floatChild) {
    try { floatChild.kill(); } catch { /* already gone */ }
    floatChild = null;
  }
  killStaleChild().catch(() => {});
  killOrphanChildren().catch(() => {});
  sendJSON(res, 200, { ok: true });
}

/** One-slot event queue from the floating window to the in-app client
 *  (e.g. "open the petdex settings modal"). Acknowledged once consumed. */
let uiEvent = null;
async function handleUiEvent(req, res) {
  if (req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (body.ack && uiEvent && uiEvent.id === body.ack) {
        uiEvent = null;
      } else if (body.type) {
        uiEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: String(body.type),
          ...(body.sessionId ? { sessionId: String(body.sessionId) } : {}),
        };
      }
    } catch { /* keep queue */ }
    return sendJSON(res, 200, { ok: true });
  }
  sendJSON(res, 200, { ok: true, event: uiEvent });
}

/** Shared pet position in screen coordinates: the single source of truth that
 *  lets per-display overlays hand the pet across screen boundaries. */
let livePos = null;
async function handlePos(req, res) {
  if (req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (typeof body.x === 'number') livePos = { x: body.x, y: Number(body.y) || 0, dragging: !!body.dragging };
    } catch { /* keep previous position */ }
    return sendJSON(res, 200, { ok: true });
  }
  sendJSON(res, 200, livePos || { ok: true });
}

async function route(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const rest = url.pathname.replace(/^\/api\/desk-pet\//, '');
  if (rest === 'manifest') {
    const pets = await getManifest();
    return sendJSON(res, 200, { ok: true, pets });
  }
  if (rest === 'installed') return handleInstalled(res);
  if (rest === 'runtime') return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  if (rest === 'runtime/check') {
    await resolveRuntime();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'runtime/install') {
    installRuntime();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'runtime/cancel') {
    pendingActivation = false;
    cancelInstall();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'status') return handleStatus(req, res);
  if (rest === 'pos') return handlePos(req, res);
  if (rest === 'float') return handleFloat(res);
  if (rest === 'float-follow') {
    if (req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        followRelease = body.release === true;
      } catch { /* keep flag */ }
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 200, { ok: true, release: followRelease });
  }
  if (rest === 'float-open') return handleFloatOpen(url, res);
  if (rest === 'float-close') return handleFloatClose(res);
  if (rest === 'ui-event') return handleUiEvent(req, res);
  if (rest === 'config') {
    if (req.method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (typeof body.slug === 'string') liveStatus = { ...liveStatus, slug: body.slug };
        if (Number.isFinite(Number(body.opacity))) liveStatus = { ...liveStatus, opacity: Math.min(1, Math.max(0.3, Number(body.opacity))) };
        if (Number.isFinite(Number(body.size))) liveStatus = { ...liveStatus, size: Math.min(1.3, Math.max(0.75, Number(body.size))) };
        if (typeof body.petOn === 'boolean') {
          liveStatus = { ...liveStatus, petOn: body.petOn };
          // toggle = show/hide the existing window; the process stays alive so
          // the next flip is instant. Only a dead/missing child needs a respawn,
          // which the client's heartbeat handles lazily.
          if (!body.petOn) {
            pendingActivation = false;
            if (floatChild) { try { floatChild.kill(); } catch { /* already gone */ } floatChild = null; }
            killStaleChild().catch(() => {});
            killOrphanChildren().catch(() => {});
          } else {
            openFloatWindow({}).then((r) => {
              if (r && r.ok === false && r.error === 'runtime-not-ready') {
                liveStatus = { ...liveStatus, petOn: false };
                pendingActivation = true;
              }
            }).catch(() => {});
          }
        }
        liveStatus = { ...liveStatus, postedAt: Date.now() };
      } catch { /* ignore */ }
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 200, { ok: true, ...liveStatus });
  }
  if (rest === 'float-state') return sendJSON(res, 200, { ok: true, open: !!(floatChild && !floatChild.killed) });
  if (rest === 'install') return handleInstall(url, res);
  if (rest === 'remove') return handleRemove(url, res);
  if (rest.startsWith('pet/')) return handleSprite(rest, res);
  if (rest === 'asset') return handleAsset(url, res);
  return sendJSON(res, 404, { ok: false, error: 'not-found' });
}

/** Host half: proxies the petdex.dev gallery through same-origin routes so the
 *  Web UI's CSP never blocks it, and installs pets into ~/.petdex/pets/<slug>/
 *  (the same layout the petdex CLI uses). */
export const inject = ['webServer'];

export function apply(ctx) {
  // Hard dependency via `inject`: without it, apply can run before the
  // webServer service exists and the routes would silently never register
  // (requests then fall into the connection package's authenticated /api
  // prefix and return 401).
  serverOrigin = ctx.webServer.getOrigin();
  killStaleChild().catch(() => {});
  killOrphanChildren().catch(() => {});
  // NOTE: no trailing slash — webserver prefix matching requires
  // pathname.startsWith(prefix + '/'), so '/api/desk-pet/' would never match.
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: '/api/desk-pet',
    handler: async (req, res) => {
      try {
        await route(req, res);
      } catch (error) {
        try { sendJSON(res, 500, { ok: false, error: String((error && error.message) || error) }); } catch { /* response already closed */ }
      }
    },
  });
  ctx.effect(() => () => {
    dispose();
    if (floatChild) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
    }
  });
}
