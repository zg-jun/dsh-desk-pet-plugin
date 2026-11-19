#!/usr/bin/env node
// Live acceptance for Phase 2A/3b against a running DSH profile.
// Usage: npm run check:phase2 -- http://127.0.0.1:<port>

const origin = (process.argv[2] || process.env.DSH_WEB_URL || '').replace(/\/$/, '');
if (!origin) {
  console.error('usage: npm run check:phase2 -- http://127.0.0.1:<port>');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const request = async (path, init = {}) => {
  const res = await fetch(origin + path, init);
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body };
};

const json = (body, headers = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const projection = await request('/api/desk-pet/projection');
check('projection readable', projection.status === 200 && projection.body?.ok === true, `status=${projection.status}`);
check('projection registered', projection.body?.ok === true && projection.body?.error === '', `error=${projection.body?.error}`);
check('projection has a session value', projection.body?.values && Object.keys(projection.body.values).length > 0, `values=${Object.keys(projection.body?.values || {}).length}`);

const status = await request('/api/desk-pet/status');
check('status GET', status.status === 200 && typeof status.body?.mode === 'string', `mode=${status.body?.mode}`);
check('status task is short', typeof status.body?.task === 'string' && status.body.task.length <= 120, `len=${status.body?.task?.length}`);

const postStatus = await request('/api/desk-pet/status', json({}));
check('status POST is 405', postStatus.status === 405, `status=${postStatus.status}`);

const noOrigin = await request('/api/desk-pet/config', json({}));
check('no-origin mutation is 403', noOrigin.status === 403, `status=${noOrigin.status}`);

const originConfig = await request('/api/desk-pet/config', json({}, { origin }));
check('same-origin config accepted', originConfig.status === 200 && originConfig.body?.ok === true, `status=${originConfig.status}`);

const injected = await request('/api/desk-pet/pending', json({
  pending: { kind: 'approval', sessionId: 'check-phase2', summary: 'phase2 live check', options: ['allowed-once'] },
}, { origin }));
const waiting = await request('/api/desk-pet/status');
check('pending write', injected.status === 200 && waiting.body?.pending?.kind === 'approval', `status=${injected.status}`);
check('pending mode waiting', waiting.body?.mode === 'waiting', `mode=${waiting.body?.mode}`);

await request('/api/desk-pet/pending', json({ pending: null }, { origin }));
const cleared = await request('/api/desk-pet/status');
check('pending clears', cleared.body?.pending === null, `pending=${JSON.stringify(cleared.body?.pending)}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
