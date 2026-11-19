#!/usr/bin/env node
// Render the real PetPage bundle in Electron with mocked Host data.
// Usage: node scripts/validate/settings-visual.mjs [--dark]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(os.tmpdir(), `pet-settings-${process.argv.includes('--dark') ? 'dark' : 'light'}.png`);
const ELECTRON = process.env.DESK_PET_REAL_ELECTRON || path.join(os.homedir(), '.petdex/dsh-float/runtime/Electron.app/Contents/MacOS/Electron');
const APP = path.join(ROOT, '.tmp/settings-visual');
const dark = process.argv.includes('--dark');
const tokens = dark ? `
  --dsw-alias-bg-base:#17181c; --dsw-alias-bg-layer-1:#202127; --dsw-alias-bg-layer-2:#272930;
  --dsw-alias-bg-overlay:#202127; --dsw-alias-border-l1:#3a3d46; --dsw-alias-border-l2:#4a4e59;
  --dsw-alias-label-primary:#f1f2f5; --dsw-alias-label-secondary:#a8acb6;
  --dsw-alias-state-success-primary:#6fcf97; --dsw-alias-state-warn-primary:#e2b04a;
  --dsw-alias-state-error-primary:#ef7b7b; --dsw-alias-brand-primary:#8ab4ff;
` : `
  --dsw-alias-bg-base:#ffffff; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#f6f7f9;
  --dsw-alias-bg-overlay:#ffffff; --dsw-alias-border-l1:#e3e5e9; --dsw-alias-border-l2:#d2d5da;
  --dsw-alias-label-primary:#1f2329; --dsw-alias-label-secondary:#6b7280;
  --dsw-alias-state-success-primary:#2e7d32; --dsw-alias-state-warn-primary:#a66a00;
  --dsw-alias-state-error-primary:#c62828; --dsw-alias-brand-primary:#2f6fed;
`;
const client = await readFile(path.join(ROOT, 'dist/client.js'), 'utf8');
const page = `<!doctype html><meta charset="utf-8"><style>
:root { ${tokens} }
html,body { margin:0; min-height:100%; background:var(--dsw-alias-bg-base); }
body { font: 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color:var(--dsw-alias-label-primary); }
#root { min-height:100vh; }
</style><div id="root"></div><script>window.__ModuleLoader__={load:(o)=>{window.__factory=o.factory;}};</script>`;
await mkdir(APP, { recursive: true });
await writeFile(path.join(APP, 'index.html'), page);
const main = `const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
nativeTheme.themeSource = ${JSON.stringify(dark ? 'dark' : 'light')};
app.whenReady().then(async () => {
  try {
  const win = new BrowserWindow({ width: 980, height: 900, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(${JSON.stringify(path.join(APP, 'index.html'))});
  await win.webContents.executeJavaScript(${JSON.stringify(client)});
  const result = await win.webContents.executeJavaScript(\`(async()=>{
    const React = require('react');
    const { createRoot } = require('react-dom/client');
    const pets = [
      { slug:'alpha', displayName:'Alpha', description:'first', ext:'webp' },
      { slug:'beta', displayName:'Beta', description:'second', ext:'webp' },
      { slug:'gamma', displayName:'Gamma', description:'third', ext:'webp' },
    ];
    const manifest = pets.concat([
      { slug:'delta', displayName:'Delta', description:'fourth', spritesheetUrl:'https://x/d.webp' },
      { slug:'epsilon', displayName:'Epsilon', description:'fifth', spritesheetUrl:'https://x/e.webp' },
    ]);
    window.fetch = async (url, init) => {
      const u = String(url);
      const json = (d) => ({ ok:true, json: async () => d });
      if (u.includes('/manifest')) return json({ ok:true, pets: manifest });
      if (u.includes('/installed')) return json({ ok:true, pets });
      if (u.includes('/runtime/check') || u.includes('/runtime')) return json({ ok:true, phase:'ready', source:'detected', version:'45.2.2' });
      if (u.includes('/status')) return json({ ok:true, petOn:true, slug:'alpha', opacity:1, size:1 });
      return json({ ok:true, petOn:true });
    };
    const captured = {};
    const ctx = {
      effect: (cb) => { const d = cb(); return () => { if (typeof d === 'function') d(); }; },
      locale: { register: () => () => {}, bind: () => (key) => key, subscribe: () => () => {}, getSnapshot: () => ({ active:'en', locales:[], revision:0 }) },
      slots: { inject: (_s, cb) => cb(), register: (o, c) => { captured[String(o.name)] = c; return () => {}; } },
      layout: { selectPanel: () => {} },
      uiWorkspace: { openSession: () => {} },
    };
    // client.js was evaluated before this block; it registered the factory.
    const plugin = window.__factory(require);
    plugin.apply(ctx);
    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(captured.main));
    return { ok:true };
  })()\`);
  if (!result || !result.ok) throw new Error('render failed');
  await new Promise((r) => setTimeout(r, 1200));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(${JSON.stringify(OUT)}, image.toPNG());
  console.log('CAPTURED ' + ${JSON.stringify(OUT)} + ' ' + image.getSize().width + 'x' + image.getSize().height);
  app.quit();
  } catch (error) { console.error(error); app.quit(); }
});
`;
await writeFile(path.join(APP, 'package.json'), JSON.stringify({ name:'pet-settings-visual', version:'1.0.0', main:'main.js' }));
await writeFile(path.join(APP, 'main.js'), main);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(ELECTRON, [APP, '--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(APP, 'userData')}`], { env, stdio:['ignore','pipe','pipe'] });
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });
await new Promise((resolve) => child.on('exit', resolve));
if (log.includes('CAPTURED')) console.log(log.trim());
else { console.error(log); process.exit(1); }
