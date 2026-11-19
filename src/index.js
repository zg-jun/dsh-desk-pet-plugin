import { promises as fs, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { isLoopbackHost } from './host/security.js';
import { getManifest, handleAsset, handleInstall, handleInstalled, handleRemove, handleSprite, sendJSON } from './host/library.js';
import { installRuntimeCore } from './host/runtime-install.js';
import { findLocalElectron } from './host/electron-discovery.js';
import { createSseHub } from './host/sse.js';
import { instanceKey, resolveDirs } from './host/instance.js';
import { createPetState } from './host/pet-state.js';
import { normalizePending } from './host/status.js';
import { downloadVerifiedRuntime } from './host/runtime-download.js';
import { DESKPET_KEY, deskPetProjection, pickTask, selectProjectionStatus } from './host/deskpet-projection.js';
import { applyProjectionStatus, withProjectionClock } from './host/projection-status.js';
import { createLineDecoder } from './host/child-ipc.js';
import { bodyTooLarge, readBody, requirePost as checkPost } from './host/http.js';
import { API_BASE } from './core/protocol.ts';

// ---------------------------------------------------------------------------
// Floating window (out-of-app pet): the Host spawns a child Electron process
// reusing the desktop shell's bundled binary. The child loads /float, which
// polls /status for the live { mode, slug } pushed by the in-app client.
// ---------------------------------------------------------------------------

/** Shared core bundle (src/core -> dist/pet-core.js), served inside /float. */
const CORE_JS = (() => {
  try {
    return readFileSync(new URL('./pet-core.js', import.meta.url), 'utf8');
  } catch {
    return '';
  }
})();

const FLOAT_BASE = path.join(os.homedir(), '.petdex', 'dsh-float');
// Per-profile: pid/pos/settings/userData. The Electron runtime stays shared.
const INSTANCE_KEY = instanceKey(process.env);
const DIRS = resolveDirs(FLOAT_BASE, INSTANCE_KEY);
const FLOAT_DIR = DIRS.instance;
const RUNTIME_DIR = DIRS.runtime;
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
  detail: '',
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
    detail: runtimeState.detail || '',
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
async function pathExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
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
  if (/checksum/i.test(message)) return '运行时校验文件获取失败，请稍后重试';
  if (/extracted binary missing/i.test(message)) return '解压后未找到运行时程序，请重试';
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
  const local = process.env.DESK_PET_DISABLE_LOCAL === '1' ? null : await findLocalElectron();
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

/**
 * 运行时可能被用户在 app 运行期间删除/移动：真机排查时“删了 runtime 目录宠物还在”。
 * 这里做一次廉价 stat 复核，一旦可执行文件不存在就立刻降级为 missing 并停掉悬浮窗，
 * 避免 UI 继续显示“已就绪”且宠物继续悬浮。
 */
async function ensureRuntimePresent() {
  if (runtimeState.phase === 'ready') {
    const bin = runtimeState.bin || runtimeBinPath();
    if (bin && await pathExists(bin)) return true;
    setRuntimeState({ phase: 'missing', source: '', bin: '', version: '', found: '', received: 0, total: 0 });
  }
  // 运行时确实不可用（不是安装中的过渡态）：在跑的宠物必须停，开关也要关。
  if (runtimeState.phase === 'missing' || runtimeState.phase === 'failed') {
    let changed = false;
    if (floatChild && !floatChild.killed) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
      petState.reset('failed');
      changed = true;
    }
    if (liveStatus.petOn) {
      liveStatus = { ...liveStatus, petOn: false };
      changed = true;
    }
    if (changed) broadcastStatus();
  }
  return runtimeState.phase === 'ready';
}

let installAbort = null;
let installPromise = null;
let installResumePhase = 'missing';

function cancelInstall() {
  // Cancelling clears the activation intent: a later install must not surprise
  // the user by opening the pet.
  pendingActivation = false;
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
  installResumePhase = resumePhase;
  const zipPath = path.join(FLOAT_DIR, 'electron-runtime.zip');
  // Flip to downloading BEFORE returning: the POST response must already say so,
  // otherwise the very first click looks like it did nothing.
  setRuntimeState({ phase: 'downloading', source: 'downloading', received: 0, total: 0, error: '' });
  installPromise = (async () => {
    try {
      const zipUrl = process.env.DESK_PET_RUNTIME_ZIP_URL
        || `https://registry.npmmirror.com/-/binary/electron/v${RUNTIME_VERSION}/electron-v${RUNTIME_VERSION}-${process.platform}-${process.arch}.zip`;
      const shasumsUrls = process.env.DESK_PET_SHASUMS_URL ? [process.env.DESK_PET_SHASUMS_URL] : undefined;
      const result = await installRuntimeCore({
        zipUrl,
        shasumsUrls,
        version: RUNTIME_VERSION,
        platform: process.platform,
        arch: process.arch,
        zipPath,
        runtimeDir: RUNTIME_DIR,
        binPath: runtimeBinPath(),
        stampFile: STAMP_FILE,
        signal,
        onProgress: (done, size) => setRuntimeState({ received: done, total: size || 0 }),
        onPhase: (phase) => setRuntimeState(phase),
      });
      setRuntimeState({
        phase: 'ready', source: 'downloaded', bin: result.bin, version: RUNTIME_VERSION,
        received: result.total || result.received, total: result.total || result.received,
      });
      // 运行时就绪后自动把宠物放出来：用户下载运行时就是为了让宠物出现。
      pendingActivation = false;
      try { await applyPetOn(true); } catch { /* keep runtime ready even if activation fails */ }
    } catch (error) {
      await fs.rm(zipPath, { force: true }).catch(() => {});
      if (signal.aborted) {
        // 解压走暂存目录，取消只清理暂存区；已有的运行时保持可用。
        setRuntimeState({ phase: resumePhase, source: '', bin: '', version: '', received: 0, total: 0, error: '' });
      } else {
        // 保留原始错误到日志，便于排查（UI 只展示可读文案）。
        console.warn('[desk-pet] runtime install failed:', error);
        setRuntimeState({
          phase: 'failed',
          error: friendlyError(error),
          detail: String((error && error.message) || error).slice(0, 160),
        });
      }
    } finally {
      installAbort = null;
      installPromise = null;
    }
  })();
  return installPromise;
}

// opacity: whole-layer alpha from the settings slider (0.3 – 1, default 1)
let liveStatus = { mode: 'idle', slug: '', task: '', kind: '', sessionId: '', pending: null, opacity: 1, size: 1, petOn: true };
let clientStatusSeen = false;
let floatChild = null;
const petState = createPetState('off');
const INSTANCE_TOKEN = randomBytes(16).toString('hex');
const projectionValues = new Map();
let projectionError = '';
let childIpcAt = 0;
let childStatusAt = 0;
let childIpcLast = '';
let clientFallbackTask = '';
// Set when the user wants the pet but the runtime is not ready yet; honoured
// the moment the runtime finishes installing.
let pendingActivation = false;
let activationRetry = null;
let activationRetryCount = 0;
let activationError = '';
let activationAt = 0;
let activationRequested = null;
let shuttingDown = false;
let serverOrigin = null;

// ---- durable settings -------------------------------------------------------
// The host owns petOn so a hidden pet stays hidden across restarts, even before
// any Web client connects.
const SETTINGS_FILE = DIRS.settings;
const DEFAULTS_VERSION = 2;
function loadSettings() {
  try { return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
let settingsWrite = Promise.resolve();
function saveSettings(patch) {
  // Serialize read-modify-write: concurrent config/pending calls must not
  // overwrite each other's patch with a stale snapshot.
  settingsWrite = settingsWrite.then(async () => {
    const next = { ...loadSettings(), ...patch, defaultsVersion: DEFAULTS_VERSION };
    await fs.mkdir(FLOAT_DIR, { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(next));
  }).catch(() => {});
  return settingsWrite;
}
function ensureInstanceDirs() {
  mkdirSync(FLOAT_DIR, { recursive: true });
  // One-time migration from the pre-instance global files, then from the
  // env-keyed "default" instance created when the GUI launch exported no
  // DSH_PROFILE (2.0.0-beta.1).
  const sources = [FLOAT_BASE];
  if (INSTANCE_KEY !== 'default') sources.push(path.join(FLOAT_BASE, 'instances', 'default'));
  for (const name of ['settings.json', 'pos.json']) {
    const target = path.join(FLOAT_DIR, name);
    if (existsSync(target)) continue;
    for (const source of sources) {
      const legacy = path.join(source, name);
      if (!existsSync(legacy)) continue;
      try { copyFileSync(legacy, target); } catch { /* best effort */ }
      break;
    }
  }
}

// ---- event stream -----------------------------------------------------------
/** One SSE subscriber per window. The float and the Web client each hold one. */
const sse = createSseHub();

function pushStatusToChild() {
  if (!floatChild || !floatChild.stdin || !floatChild.stdin.writable) return;
  try { floatChild.stdin.write(`${JSON.stringify({ type: 'status', status: liveStatus })}\n`); } catch { /* child gone */ }
}

function broadcastStatus() {
  sse.broadcast('status', liveStatus);
  pushStatusToChild();
}

function handleStream(req, res) {
  const initial = [['status', liveStatus]];
  if (uiEvent) initial.push(['ui-event', uiEvent]);
  sse.handle(req, res, initial);
}

// ---- mutation policy --------------------------------------------------------
function requirePost(req, res) {
  return checkPost(req, res, { serverOrigin, token: INSTANCE_TOKEN, sendJSON });
}

/** Single owner of the on/off intent: persists it, then starts or kills. */
async function applyPetOn(on) {
  liveStatus = { ...liveStatus, petOn: on };
  activationAt = Date.now();
  activationRequested = on;
  activationError = '';
  if (on) activationRetryCount = 0;
  await saveSettings({ petOn: on });
  broadcastStatus();
  if (!on) {
    pendingActivation = false;
    if (petState.is('on') || petState.is('starting')) petState.set('stopping');
    if (floatChild) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
    }
    petState.reset('off');
    killStaleChild().catch(() => {});
    killOrphanChildren().catch(() => {});
    return;
  }
  // 依赖运行时的操作：先确认运行时可用。
  if (runtimeState.phase !== 'ready') await resolveRuntime();
  const transient = runtimeState.phase === 'checking'
    || runtimeState.phase === 'downloading'
    || runtimeState.phase === 'extracting';
  if (runtimeState.phase !== 'ready' && !transient) {
    // 没有运行时就不要把开关打开：关掉并持久化，返回原因让页面弹下载卡片。
    liveStatus = { ...liveStatus, petOn: false };
    activationRequested = false;
    activationError = 'runtime-not-ready';
    pendingActivation = false;
    await saveSettings({ petOn: false });
    broadcastStatus();
    return { ok: false, error: 'runtime-not-ready', runtimeRequired: true, phase: runtimeState.phase };
  }
  const opened = await openFloatWindow({});
  if (opened && opened.ok === false) {
    if (opened.error === 'runtime-not-ready') {
      // 安装进行中（downloading/extracting）：保留意图，装好后自动激活。
      pendingActivation = true;
      activationError = 'runtime-not-ready';
      scheduleActivationRetry();
      return opened;
    }
    // A real start failure must not leave the switch on with no child.
    liveStatus = { ...liveStatus, petOn: false };
    pendingActivation = false;
    activationError = opened.error || 'start-failed';
    await saveSettings({ petOn: false });
    broadcastStatus();
  }
  return opened;
}

function scheduleActivationRetry() {
  if (activationRetry || activationRetryCount >= 20) return;
  activationRetryCount += 1;
  activationRetry = setTimeout(async () => {
    activationRetry = null;
    if (!liveStatus.petOn || (floatChild && !floatChild.killed)) return;
    const opened = await openFloatWindow({});
    if (opened && opened.ok === false) {
      if (opened.error === 'runtime-not-ready') {
        activationError = 'runtime-not-ready';
        scheduleActivationRetry();
        return;
      }
      liveStatus = { ...liveStatus, petOn: false };
      await saveSettings({ petOn: false });
      broadcastStatus();
    }
  }, 1500);
}

async function openPendingActivation() {
  if (!liveStatus.petOn || runtimeState.phase !== 'ready') return;
  if (floatChild && !floatChild.killed) { pendingActivation = false; return; }
  const opened = await openFloatWindow({});
  if (opened && opened.ok === false) {
    if (opened.error === 'runtime-not-ready') {
      activationError = 'runtime-not-ready';
      return;
    }
    liveStatus = { ...liveStatus, petOn: false };
    await saveSettings({ petOn: false });
    broadcastStatus();
    return;
  }
  pendingActivation = false;
  activationError = '';
}

/**
 * Restore a persisted "on" intent after the Host has registered its routes.
 * Without this, the switch/settings say on but no child is spawned until the
 * user activates again.
 */
async function restorePetOn() {
  if (!liveStatus.petOn) return;
  // 没有运行时不自动开宠物，也不保留“开”的开关状态。
  await resolveRuntime();
  if (runtimeState.phase !== 'ready') {
    liveStatus = { ...liveStatus, petOn: false };
    pendingActivation = false;
    activationError = 'runtime-not-ready';
    await saveSettings({ petOn: false });
    broadcastStatus();
    return;
  }
  try {
    const opened = await openFloatWindow({});
    if (opened && opened.ok === false) {
      if (opened.error === 'runtime-not-ready') {
        pendingActivation = true;
        scheduleActivationRetry();
        return;
      }
      liveStatus = { ...liveStatus, petOn: false };
      pendingActivation = false;
      await saveSettings({ petOn: false });
      broadcastStatus();
    }
  } catch {
    liveStatus = { ...liveStatus, petOn: false };
    await saveSettings({ petOn: false });
    broadcastStatus();
  }
}

const SCREEN_HTML = (() => { try { return readFileSync(new URL('./screen/float.html', import.meta.url), 'utf8'); } catch { return ''; } })();

const CHILD_PRELOAD = (() => { try { return readFileSync(new URL('./screen/preload.cjs', import.meta.url), 'utf8'); } catch { return ''; } })();

const CHILD_MAIN = (() => { try { return readFileSync(new URL('./screen/main.cjs', import.meta.url), 'utf8'); } catch { return ''; } })();
const CHILD_WATCHDOG = (() => { try { return readFileSync(new URL('./screen/host-watchdog.cjs', import.meta.url), 'utf8'); } catch { return ''; } })();
const CHILD_DISPLAY = (() => { try { return readFileSync(new URL('./screen/display.cjs', import.meta.url), 'utf8'); } catch { return ''; } })();

async function handleStatus(req, res) {
  // Read-only: the Host owns mode/task (projection) and pending (/pending).
  // The old full-status POST was removed in Phase 2A.
  if (req.method !== 'GET') return sendJSON(res, 405, { ok: false, error: 'method-not-allowed' });
  sendJSON(res, 200, { ok: true, ...liveStatus, activationError, activationAt, activationRequested });
}

function handleFloat(res) {
  if (!CORE_JS || !SCREEN_HTML) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('screen assets missing: run npm run build');
    return;
  }
  // Inline the core before the renderer; escape a literal </script> in the bundle.
  const coreTag = `<script>${CORE_JS.replace(/<\/script/gi, '<\\/script')}</script>`;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(SCREEN_HTML.replace('<script id="pet-core"></script>', coreTag));
}

const PID_FILE = DIRS.pid;

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
      // Match the app-dir token, not the shared runtime path: helpers carry the
      // runtime but not the app dir. A pre-instance (global) main is migrated.
      const tokens = args.trim().split(/\s+/);
      const instanceRoot = path.join(FLOAT_BASE, 'instances');
      const isThisInstance = tokens.includes(FLOAT_DIR);
      const isLegacyMain = tokens.includes(FLOAT_BASE) && !args.includes(instanceRoot);
      if (!isThisInstance && !isLegacyMain) continue;
      if (pid === selfPid || pid === currentPid) continue;
      try { process.kill(pid); } catch { /* already gone */ }
    }
  } catch { /* ps unavailable */ }
}

let floatOpening = false;

async function writeChildApp() {
  if (!CHILD_MAIN || !CHILD_PRELOAD || !CHILD_WATCHDOG || !CHILD_DISPLAY) throw new Error('screen child files missing: run npm run build');
  await fs.mkdir(FLOAT_DIR, { recursive: true });
  await fs.writeFile(path.join(FLOAT_DIR, 'package.json'), JSON.stringify({ name: 'desk-pet-float', version: '1.0.0', main: 'main.js' }));
  await fs.writeFile(path.join(FLOAT_DIR, 'main.js'), CHILD_MAIN);
  await fs.writeFile(path.join(FLOAT_DIR, 'host-watchdog.cjs'), CHILD_WATCHDOG);
  await fs.writeFile(path.join(FLOAT_DIR, 'display.cjs'), CHILD_DISPLAY);
  await fs.writeFile(path.join(FLOAT_DIR, 'preload.js'), CHILD_PRELOAD);
}

async function openFloatWindow({ x = 0, y = 0 } = {}) {
  // Serialize opens: concurrent calls must not both pass the liveness
  // check and spawn duplicate overlay windows.
  if (floatOpening) return { ok: true, already: true };
  floatOpening = true;
  try {
    if (floatChild && !floatChild.killed) {
      if (!petState.is('on')) petState.reset('on');
      return { ok: true, already: true };
    }
    if (!petState.is('on') && !petState.is('starting')) petState.set('starting');
    if (!serverOrigin) throw new Error('server origin unavailable');
    // The pet only starts on a prepared runtime; installing is a user decision
    // handled by /runtime/install. Re-resolve (never download) so a fresh Host
    // that has not been checked yet still starts correctly.
    if (runtimeState.phase === 'ready' && !(await pathExists(runtimeState.bin || runtimeBinPath()))) {
      await ensureRuntimePresent();
    }
    if (runtimeState.phase !== 'ready') await resolveRuntime();
    if (runtimeState.phase !== 'ready' || !(runtimeState.bin || runtimeBinPath())) {
      petState.reset('failed');
      return { ok: false, error: 'runtime-not-ready', phase: runtimeState.phase };
    }
    await killStaleChild();
    await killOrphanChildren();
    const bin = runtimeState.bin || runtimeBinPath();
    await writeChildApp();
    // The Harness session exports ELECTRON_RUN_AS_NODE=1 to subprocesses; left
    // in place, the child would run as plain Node without the electron module.
    const env = electronEnv();
    const { spawn } = await import('node:child_process');
    floatChild = spawn(bin, [FLOAT_DIR], {
      env: {
        ...env,
        DESK_PET_ORIGIN: serverOrigin,
        DESK_PET_TOKEN: INSTANCE_TOKEN,
        DESK_PET_API: API_BASE,
        DESK_PET_FLOAT_DIR: FLOAT_DIR,
        DESK_PET_X: String(x),
        DESK_PET_Y: String(y),
      },
      detached: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const decodeChild = createLineDecoder((message) => {
      if (message && message.type) childIpcLast = String(message.type);
      if (message && message.type === 'ipc-ping') childIpcAt = Number(message.at) || Date.now();
      else if (message && message.type === 'status-ack') childStatusAt = Number(message.at) || Date.now();
      else if (message && message.type === 'ui-event' && message.event) receiveUiEvent(message.event);
    });
    floatChild.stdout.setEncoding('utf8');
    floatChild.stdout.on('data', decodeChild);
    pushStatusToChild();
    floatChild.on('exit', () => {
      floatChild = null;
      if (shuttingDown) {
        petState.reset('off');
        return;
      }
      fs.rm(PID_FILE, { force: true }).catch(() => {});
      // Close/pet-off wins even if the exit event races the reset.
      if (petState.is('stopping') || liveStatus.petOn === false) petState.reset('off');
      else petState.reset('failed');
      // A crash (not a requested hide) must not leave the switch "on" with no pet.
      if (liveStatus.petOn) {
        // A child exit is not an explicit user "off": keep the persisted
        // intent so a DSH restart restores the pet. Explicit off/close paths
        // still persist false below.
        liveStatus = { ...liveStatus, petOn: false };
        broadcastStatus();
      }
    });
    floatChild.unref();
    if (floatChild.pid) await fs.writeFile(PID_FILE, String(floatChild.pid));
    // a toggle may have flipped off while we were spawning: honour the latest state
    if (liveStatus.petOn === false && floatChild) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
      petState.reset('off');
      return { ok: true };
    }
    petState.reset('on');
    return { ok: true };
  } catch (error) {
    petState.reset('failed');
    return { ok: false, error: String((error && error.message) || error) };
  } finally {
    floatOpening = false;
  }
}

async function handleFloatOpen(res) {
  // A stale claim must not resurrect a pet the user turned off.
  if (liveStatus.petOn === false) {
    sendJSON(res, 200, { ok: false, error: 'pet-off' });
    return;
  }
  sendJSON(res, 200, await openFloatWindow({}));
}

async function handleFloatClose(res) {
  // Closing the window is an explicit off, not just a process stop.
  liveStatus = { ...liveStatus, petOn: false };
  await saveSettings({ petOn: false });
  broadcastStatus();
  if (petState.is('on') || petState.is('starting')) petState.set('stopping');
  if (floatChild) {
    try { floatChild.kill(); } catch { /* already gone */ }
    floatChild = null;
  }
  petState.reset('off');
  killStaleChild().catch(() => {});
  killOrphanChildren().catch(() => {});
  sendJSON(res, 200, { ok: true });
}

/** One-slot event queue from the floating window to the in-app client
 *  (e.g. "open the petdex settings modal"). Acknowledged once consumed. */
let uiEvent = null;
async function handlePending(req, res) {
  if (req.method === 'GET') return sendJSON(res, 200, { ok: true, pending: liveStatus.pending });
  if (!requirePost(req, res)) return;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    const pending = normalizePending(body.pending);
    const selected = selectProjectionStatus(projectionValues.values());
    const fallbackMode = ['idle', 'working', 'waiting', 'done'].includes(body.mode) ? body.mode : 'idle';
    const fallbackTask = typeof body.task === 'string' ? body.task.slice(0, 500) : liveStatus.task;
    if (fallbackTask) clientFallbackTask = fallbackTask;
    // DSH's sidebar status is pushed here by the in-app client. It is fresher
    // than the log projection for turn boundaries, so it wins once present.
    clientStatusSeen = true;
    liveStatus = withProjectionClock({
      ...liveStatus,
      pending,
      kind: pending ? pending.kind : '',
      mode: pending ? 'waiting' : fallbackMode,
      sessionId: pending ? pending.sessionId : (body.sessionId || selected?.sessionId || liveStatus.sessionId),
      task: fallbackTask || pickTask(selected ? selected.task : '', fallbackTask) || liveStatus.task,
    }, selected);
    broadcastStatus();
  } catch (error) {
    if (bodyTooLarge(error)) return sendJSON(res, 413, { ok: false, error: 'body-too-large' });
    return sendJSON(res, 400, { ok: false, error: 'bad-pending' });
  }
  return sendJSON(res, 200, { ok: true, petOn: liveStatus.petOn });
}

function receiveUiEvent(body) {
  if (!body || typeof body !== 'object') return;
  if (body.ack && uiEvent && uiEvent.id === body.ack) {
    uiEvent = null;
    return;
  }
  if (!body.type) return;
  const { ack: _ack, type, ...rest } = body;
  uiEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: String(type),
    ...rest,
  };
  sse.broadcast('ui-event', uiEvent);
}

async function handleIpcCommand(req, res) {
  if (!requirePost(req, res)) return;
  if (!floatChild || !floatChild.stdin || !floatChild.stdin.writable) {
    return sendJSON(res, 409, { ok: false, error: 'child-not-running' });
  }
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    if (!['open-settings', 'menu'].includes(body.command)) return sendJSON(res, 400, { ok: false, error: 'bad-command' });
    floatChild.stdin.write(`${JSON.stringify({ type: 'command', command: body.command })}\n`);
    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    if (bodyTooLarge(error)) return sendJSON(res, 413, { ok: false, error: 'body-too-large' });
    return sendJSON(res, 400, { ok: false, error: 'bad-command' });
  }
}

async function handleUiEvent(req, res) {
  if (req.method === 'POST') {
    if (!requirePost(req, res)) return;
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      receiveUiEvent(body);
    } catch (error) {
      if (bodyTooLarge(error)) return sendJSON(res, 413, { ok: false, error: 'body-too-large' });
      /* keep queue */
    }
    return sendJSON(res, 200, { ok: true });
  }
  sendJSON(res, 200, { ok: true, event: uiEvent });
}

// Flat route dispatch; each branch delegates to a small handler.
// eslint-disable-next-line complexity
async function route(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const rest = url.pathname.startsWith(`${API_BASE}/`) ? url.pathname.slice(API_BASE.length + 1) : '';
  if (rest === 'stream') return handleStream(req, res);
  if (rest === 'manifest') {
    const pets = await getManifest();
    return sendJSON(res, 200, { ok: true, pets });
  }
  if (rest === 'installed') return handleInstalled(res);
  if (rest === 'runtime') {
    await ensureRuntimePresent();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'runtime/check') {
    if (!requirePost(req, res)) return;
    // 安装进行中不要重新探测，否则会把 downloading/extracting 覆盖成 missing。
    if (installPromise || runtimeState.phase === 'downloading' || runtimeState.phase === 'extracting') {
      return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
    }
    await resolveRuntime();
    await ensureRuntimePresent();
    if (pendingActivation || liveStatus.petOn) await openPendingActivation();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'runtime/install') {
    if (!requirePost(req, res)) return;
    installRuntime();
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'runtime/cancel') {
    if (!requirePost(req, res)) return;
    // Cancel clears the pending intent too, so a restart does not retry.
    pendingActivation = false;
    liveStatus = { ...liveStatus, petOn: false };
    await saveSettings({ petOn: false });
    broadcastStatus();
    cancelInstall();
    // 立刻退出下载态，别等后台清理（上游卡住时取消像“没反应”）。
    if (installPromise) {
      setRuntimeState({ phase: installResumePhase, source: '', bin: '', version: '', received: 0, total: 0, error: '' });
    }
    return sendJSON(res, 200, { ok: true, ...runtimeSummary() });
  }
  if (rest === 'status') return handleStatus(req, res);
  if (rest === 'float') return handleFloat(res);
  if (rest === 'float-open') {
    if (!requirePost(req, res)) return;
    return handleFloatOpen(res);
  }
  if (rest === 'float-close') {
    if (!requirePost(req, res)) return;
    return handleFloatClose(res);
  }
  if (rest === 'ui-event') return handleUiEvent(req, res);
  if (rest === 'config') {
    let refused = null;
    if (req.method === 'POST') {
      if (!requirePost(req, res)) return;
      try {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (typeof body.slug === 'string') {
          liveStatus = { ...liveStatus, slug: body.slug };
          await saveSettings({ slug: body.slug });
        }
        if (Number.isFinite(Number(body.opacity))) {
          liveStatus = { ...liveStatus, opacity: Math.min(1, Math.max(0.3, Number(body.opacity))) };
          await saveSettings({ opacity: liveStatus.opacity });
        }
        if (Number.isFinite(Number(body.size))) {
          liveStatus = { ...liveStatus, size: Math.min(1.3, Math.max(0.75, Number(body.size))) };
          await saveSettings({ size: liveStatus.size });
        }
        broadcastStatus();
        if (typeof body.petOn === 'boolean') refused = await applyPetOn(body.petOn);
      } catch (error) {
        if (bodyTooLarge(error)) return sendJSON(res, 413, { ok: false, error: 'body-too-large' });
        /* ignore */
      }
      return sendJSON(res, 200, { ok: true, petOn: liveStatus.petOn, ...(refused && refused.runtimeRequired ? { runtimeRequired: true, phase: refused.phase } : {}) });
    }
    return sendJSON(res, 200, { ok: true, ...liveStatus });
  }
  if (rest === 'float-state') return sendJSON(res, 200, { ok: true, open: !!(floatChild && !floatChild.killed), state: petState.get() });
  if (rest === 'install' || rest === 'remove') {
    if (!requirePost(req, res)) return;
    let body = {};
    try { body = JSON.parse((await readBody(req)) || '{}'); } catch (error) {
      if (bodyTooLarge(error)) return sendJSON(res, 413, { ok: false, error: 'body-too-large' });
      /* empty */
    }
    const slug = String(body.slug || '');
    return rest === 'install' ? handleInstall(slug, res) : handleRemove(slug, res);
  }
  if (rest === 'pending') return handlePending(req, res);
  if (rest === 'ipc-command') return handleIpcCommand(req, res);
  if (rest === 'ipc-state') return sendJSON(res, 200, { ok: true, at: childIpcAt, statusAt: childStatusAt, last: childIpcLast });
  if (rest === 'projection') return sendJSON(res, 200, { ok: true, error: projectionError, values: Object.fromEntries(projectionValues) });
  if (rest.startsWith('pet/')) return handleSprite(rest, res);
  if (rest === 'asset') return handleAsset(url, res);
  return sendJSON(res, 404, { ok: false, error: 'not-found' });
}

/** Host half: proxies the petdex.dev gallery through same-origin routes so the
 *  Web UI's CSP never blocks it, and installs pets into ~/.petdex/pets/<slug>/
 *  (the same layout the petdex CLI uses). */
function refreshProjectionStatus() {
  if (!clientStatusSeen) {
    liveStatus = applyProjectionStatus({ values: projectionValues.values(), liveStatus, fallbackTask: clientFallbackTask, broadcast: () => broadcastStatus() });
    return;
  }
  // The Client owns mode/task after its first post, but the turn clock still
  // comes from the Session log so the pet timer matches DSH exactly.
  const selected = selectProjectionStatus(projectionValues.values());
  if (!selected) return;
  liveStatus = withProjectionClock(liveStatus, selected);
  broadcastStatus();
}

function registerDeskPetProjection(ctx) {
  let off = null;
  let handle = null;
  let disposed = false;
  (async () => {
    const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : ctx.sessionProjections;
    if (!projections) return;
    try {
      handle = await projections.register(deskPetProjection);
      if (disposed) {
        await handle.dispose().catch(() => {});
        return;
      }
      off = projections.onChanged((session, key, value) => {
        if (key !== DESKPET_KEY) return;
        projectionValues.set(String(session.id || ''), value);
        refreshProjectionStatus();
      });
      // A plugin reload has no new event to drive `onChanged`; fold existing
      // sessions once so the pet is correct immediately.
      const agents = typeof ctx.get === 'function' ? ctx.get('agents') : ctx.agents;
      for (const agent of agents?.roots?.() || []) {
        const session = agent && agent.session ? agent.session : agent;
        if (!session) continue;
        try {
          const value = handle.stateOf(session);
          if (value) projectionValues.set(String(session.id || ''), value);
        } catch { /* skip unavailable session */ }
      }
      refreshProjectionStatus();
    } catch (error) {
      projectionError = String((error && error.message) || error);
    }
  })();
  return () => {
    disposed = true;
    if (off) off();
    if (handle) Promise.resolve(handle.dispose()).catch(() => {});
  };
}

export const inject = ['webServer'];

export function apply(ctx) {
  // Hard dependency via `inject`: without it, apply can run before the
  // webServer service exists and the routes would silently never register
  // (requests then fall into the connection package's authenticated /api
  // prefix and return 401).
  serverOrigin = ctx.webServer.getOrigin();
  ensureInstanceDirs();
  const persisted = loadSettings();
  if (typeof persisted.petOn === 'boolean') liveStatus = { ...liveStatus, petOn: persisted.petOn };
  if (typeof persisted.slug === 'string') liveStatus = { ...liveStatus, slug: persisted.slug };
  if (Number(persisted.defaultsVersion) >= DEFAULTS_VERSION) {
    if (Number.isFinite(Number(persisted.opacity))) liveStatus = { ...liveStatus, opacity: Math.min(1, Math.max(0.3, Number(persisted.opacity))) };
    if (Number.isFinite(Number(persisted.size))) liveStatus = { ...liveStatus, size: Math.min(1.3, Math.max(0.75, Number(persisted.size))) };
  } else {
    // 2.0 defaults: 100% opacity, medium size. Drop pre-2.0 appearance once.
    liveStatus = { ...liveStatus, opacity: 1, size: 1 };
    saveSettings({ opacity: 1, size: 1 });
  }
  try {
    const bound = new URL(serverOrigin).hostname;
    if (!isLoopbackHost(bound)) {
      console.warn(`[desk-pet] web server is bound to ${bound}; the pet API is reachable on that network. Prefer a loopback host.`);
    }
  } catch { /* origin unavailable */ }
  killStaleChild().catch(() => {});
  killOrphanChildren().catch(() => {});
  // NOTE: no trailing slash — webserver prefix matching requires
  // pathname.startsWith(prefix + '/'), so '/api/desk-pet/' would never match.
  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: API_BASE,
    handler: async (req, res) => {
      try {
        await route(req, res);
      } catch (error) {
        try { sendJSON(res, 500, { ok: false, error: String((error && error.message) || error) }); } catch { /* response already closed */ }
      }
    },
  });
  ctx.effect(() => registerDeskPetProjection(ctx));
  ctx.effect(() => () => {
    shuttingDown = true;
    dispose();
    sse.closeAll();
    if (activationRetry) { clearTimeout(activationRetry); activationRetry = null; }
    if (floatChild) {
      try { floatChild.kill(); } catch { /* already gone */ }
      floatChild = null;
    }
    petState.reset('off');
  });
  // Defer one tick so all effects/handlers are live before the child starts.
  if (liveStatus.petOn) {
    setTimeout(() => { restorePetOn().catch(() => {}); }, 0);
  }
}
