// Which plugin generation is the RUNNING host actually serving?
//
// Replacing an installed package needs a DSH restart: the files on disk can be
// 2.0 while the live host still runs 1.4.x. This probe is the acceptance gate
// for that hand-off:
//   2.0     -> GET /api/desk-pet/stream is 200 text/event-stream
//              and /status no longer carries the 1.4.x fields postedAt/wx/wy/…
//   1.4.x   -> /stream 404 and /status still has postedAt/wx/wy/ww/wh
//
// Usage: npm run check:live [-- --origin http://127.0.0.1:PORT] [--json]
// Origin defaults to $DSH_WEB_URL.
import process from 'node:process';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const origin = value('--origin', process.env.DSH_WEB_URL || '').replace(/\/+$/, '');
const asJson = args.includes('--json');
const LEGACY_FIELDS = ['postedAt', 'wx', 'wy', 'ww', 'wh'];

if (!origin) {
  console.error('no origin: pass --origin http://127.0.0.1:PORT or set DSH_WEB_URL');
  process.exit(2);
}

const base = `${origin}/api/desk-pet`;

async function readJson(path) {
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(3000) });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (error) {
    return { status: 0, data: null, error: String((error && error.message) || error) };
  }
}

async function probeStream() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${base}/stream`, {
      signal: controller.signal,
      headers: { accept: 'text/event-stream' },
    });
    const contentType = res.headers.get('content-type') || '';
    // Headers are enough; drop the long-lived body immediately.
    try { await res.body?.cancel(); } catch { /* already closed */ }
    return { status: res.status, contentType };
  } catch (error) {
    return { status: 0, contentType: '', error: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

const [statusRes, streamRes, floatRes] = await Promise.all([
  readJson('/status'),
  probeStream(),
  readJson('/float-state'),
]);

const statusData = statusRes.data && typeof statusRes.data === 'object' ? statusRes.data : null;
const legacyFields = statusData ? LEGACY_FIELDS.filter((key) => key in statusData) : [];
const streamOk = streamRes.status === 200 && /text\/event-stream/i.test(streamRes.contentType);

let generation = 'unknown';
if (streamOk && legacyFields.length === 0) generation = '2.0.0';
else if (!streamOk && legacyFields.length > 0) generation = '1.4.x';
else if (streamOk && legacyFields.length > 0) generation = 'mixed';

const report = {
  origin,
  generation,
  status: { status: statusRes.status, ok: statusData?.ok === true, mode: statusData?.mode ?? null, petOn: statusData?.petOn ?? null, legacyFields },
  stream: { status: streamRes.status, contentType: streamRes.contentType, ok: streamOk },
  float: { status: floatRes.status, open: floatRes.data?.open ?? null },
  pass: generation === '2.0.0',
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`origin      ${origin}`);
  console.log(`status      ${report.status.status}  mode=${report.status.mode} petOn=${report.status.petOn} legacy=${legacyFields.join(',') || 'none'}`);
  console.log(`stream      ${report.stream.status}  ${report.stream.contentType || '(no content-type)'}`);
  console.log(`float       ${report.float.status}  open=${report.float.open}`);
  console.log(`generation  ${generation}`);
  console.log('');
  if (report.pass) {
    console.log('2.0 LIVE — run the 24 acceptance rows in docs/acceptance.md.');
  } else if (generation === '1.4.x') {
    console.log('2.0 NOT LIVE — the files are installed but the host still runs 1.4.x.');
    console.log('Restart DeepSeek Harness, then run this check again.');
  } else {
    console.log('generation unclear — inspect the two probes above before restarting.');
  }
}

process.exit(report.pass ? 0 : 1);
