// Automated acceptance probe for the RUNNING host. Read-only except for
// rejected cross-origin requests: it never installs, never opens/closes the
// float, never posts status/config, and never consumes ui-events.
//
// Usage: npm run acceptance:probe [-- --origin http://127.0.0.1:PORT] [--wait-ping]
// Origin defaults to $DSH_WEB_URL. Exit 0 = every required probe passed.
import { readFile, access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const origin = value('--origin', process.env.DSH_WEB_URL || '').replace(/\/+$/, '');
const waitPing = args.includes('--wait-ping');
if (!origin) {
  console.error('no origin: pass --origin http://127.0.0.1:PORT or set DSH_WEB_URL');
  process.exit(2);
}
const base = `${origin}/api/desk-pet`;
const rows = [];
let failed = 0;

function record(name, ok, detail, { warn = false } = {}) {
  if (!ok && !warn) failed += 1;
  rows.push({ name, state: ok ? 'PASS' : warn ? 'WARN' : 'FAIL', detail });
}

async function getJson(pathname) {
  const res = await fetch(base + pathname, { signal: AbortSignal.timeout(4000) });
  const data = await res.json().catch(() => null);
  return { res, data };
}

async function probe(name, fn) {
  try {
    const result = await fn();
    record(name, result.ok, result.detail, { warn: result.warn });
  } catch (error) {
    record(name, false, String((error && error.message) || error));
  }
}

const LEGACY = ['postedAt', 'wx', 'wy', 'ww', 'wh'];

await probe('status shape', async () => {
  const { res, data } = await getJson('/status');
  const legacy = data ? LEGACY.filter((key) => key in data) : [];
  return {
    ok: res.status === 200 && data?.ok === true && legacy.length === 0,
    detail: `HTTP ${res.status} mode=${data?.mode ?? '?'} legacy=${legacy.join(',') || 'none'}`,
  };
});

await probe('installed pets + sprite', async () => {
  const { res, data } = await getJson('/installed');
  const pets = Array.isArray(data?.pets) ? data.pets : [];
  if (res.status !== 200 || !data?.ok || pets.length === 0) {
    return { ok: false, detail: `HTTP ${res.status} pets=${pets.length}` };
  }
  const slug = pets[0].slug;
  const sprite = await fetch(`${base}/pet/${encodeURIComponent(slug)}/sprite`, { signal: AbortSignal.timeout(6000) });
  const bytes = (await sprite.arrayBuffer()).byteLength;
  return {
    ok: sprite.status === 200 && bytes > 0,
    detail: `pets=${pets.length} first=${slug} sprite=${sprite.status}/${bytes}B`,
  };
});

await probe('float page has PetCore + fitWindow', async () => {
  const res = await fetch(`${base}/float`, { signal: AbortSignal.timeout(4000) });
  const html = await res.text();
  return {
    ok: res.status === 200 && html.includes('PetCore') && html.includes('fitWindow'),
    detail: `HTTP ${res.status} bytes=${html.length} PetCore=${html.includes('PetCore')} fitWindow=${html.includes('fitWindow')}`,
  };
});

await probe('runtime snapshot', async () => {
  const { res, data } = await getJson('/runtime');
  return {
    ok: res.status === 200 && data?.ok === true && typeof data.phase === 'string',
    detail: `HTTP ${res.status} phase=${data?.phase ?? '?'} version=${data?.version ?? '?'}`,
  };
});

await probe('float process state', async () => {
  const { res, data } = await getJson('/float-state');
  return { ok: res.status === 200 && typeof data?.open === 'boolean', detail: `HTTP ${res.status} open=${data?.open}` };
});

await probe('SSE stream: 200 + initial status event', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${base}/stream`, {
      signal: controller.signal,
      headers: { accept: 'text/event-stream' },
    });
    const type = res.headers.get('content-type') || '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sawStatus = false;
    while (!sawStatus && buffer.length < 64 * 1024) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      sawStatus = /event: status\ndata: \{/.test(buffer);
    }
    try { await reader.cancel(); } catch { /* closing */ }
    return {
      ok: res.status === 200 && /text\/event-stream/i.test(type) && sawStatus,
      detail: `HTTP ${res.status} ${type || '(no type)'} statusEvent=${sawStatus}`,
    };
  } finally {
    clearTimeout(timer);
  }
});

if (waitPing) {
  await probe('SSE heartbeat (event: ping)', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(`${base}/stream`, { signal: controller.signal, headers: { accept: 'text/event-stream' } });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let ping = false;
      while (!ping && buffer.length < 64 * 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        ping = /event: ping/.test(buffer);
      }
      try { await reader.cancel(); } catch { /* closing */ }
      return { ok: res.status === 200 && ping, detail: `ping=${ping}` };
    } finally {
      clearTimeout(timer);
    }
  });
}

await probe('cross-origin mutations rejected', async () => {
  const targets = ['/config', '/status', '/install', '/float-open'];
  const results = [];
  for (const pathname of targets) {
    const res = await fetch(base + pathname, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(4000),
    });
    results.push(`${pathname}:${res.status}`);
  }
  return { ok: results.every((text) => text.endsWith(':403')), detail: results.join(' ') };
});

await probe('cross-site without Origin rejected', async () => {
  const res = await fetch(`${base}/config`, {
    method: 'POST',
    headers: { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(4000),
  });
  return { ok: res.status === 403, detail: `HTTP ${res.status}` };
});

await probe('GET on a mutation route is 405', async () => {
  const res = await fetch(`${base}/float-open`, { signal: AbortSignal.timeout(4000) });
  return { ok: res.status === 405, detail: `HTTP ${res.status}` };
});

const envKey = (() => {
  const raw = (process.env.DSH_PROFILE || (process.env.DSH_PROFILE_DIR ? path.basename(process.env.DSH_PROFILE_DIR) : '') || 'default').trim();
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 64) || 'default';
})();
const instancesRoot = path.join(os.homedir(), '.petdex', 'dsh-float', 'instances');
let key = envKey;
try {
  const names = (await readdir(instancesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  // The live Host may still use the env-derived or legacy key; report the one
  // that actually exists so a stale "default" instance does not look like a failure.
  if (!names.includes(envKey) && names.length === 1) key = names[0];
} catch { /* instances root missing */ }
const instanceDir = path.join(instancesRoot, key);

await probe(`instance dir (${key}${key !== envKey ? `, env=${envKey}` : ''})`, async () => {
  try {
    await access(instanceDir);
    return { ok: true, detail: instanceDir };
  } catch {
    return { ok: false, detail: `missing ${instanceDir}`, warn: true };
  }
});

await probe('instance settings.json', async () => {
  try {
    const raw = await readFile(path.join(instanceDir, 'settings.json'), 'utf8');
    const data = JSON.parse(raw);
    return { ok: typeof data.petOn === 'boolean', detail: `petOn=${data.petOn}` };
  } catch {
    return { ok: false, detail: 'not written yet (only created after a toggle)', warn: true };
  }
});

const width = Math.max(...rows.map((row) => row.name.length));
for (const row of rows) console.log(`${row.state.padEnd(4)}  ${row.name.padEnd(width)}  ${row.detail}`);
const passed = rows.filter((row) => row.state === 'PASS').length;
const warned = rows.filter((row) => row.state === 'WARN').length;
console.log(`\n${passed} pass / ${warned} warn / ${failed} fail`);
if (failed > 0) {
  console.error(`acceptance probe FAILED (${failed})`);
  process.exit(1);
}
console.log('acceptance probe OK — remaining manual rows are interaction/layout only.');
