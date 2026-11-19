// Copy this workspace into an installed DSH profile (the profile uses a copied
// package, not a symlink). Dry-run by default; pass --apply to write.
//
// The file list comes from package.json `files`, so a new shipped file only
// needs to be declared once (npm always includes package.json itself).
import { readFile, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const profile = value('--profile', 'desktop');
const apply = args.includes('--apply');
const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const TARGET = path.join(os.homedir(), '.dsh', 'profiles', profile, 'node_modules', pkg.name);

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Expand the single `dir/*.ext` glob shape the manifest uses; keep the rest literal. */
async function expand(entries) {
  const out = new Set(['package.json']);
  for (const entry of entries) {
    if (!entry.includes('*')) {
      out.add(entry);
      continue;
    }
    const dir = path.posix.dirname(entry);
    const base = path.posix.basename(entry);
    const pattern = new RegExp(`^${base.split('*').map(escapeRe).join('.*')}$`);
    const names = await readdir(path.join(ROOT, dir));
    for (const name of names.sort()) {
      if (pattern.test(name)) out.add(path.posix.join(dir, name));
    }
  }
  return [...out];
}

const paths = await expand(Array.isArray(pkg.files) ? pkg.files : []);

// index.js reads these at runtime; a missing one is a 500 or a blank slot, so
// refuse to copy a half-built tree.
const REQUIRED = ['index.js', 'client.js', 'dist/index.js', 'dist/client.js', 'cordis.patch.yml', 'dist/pet-core.js', 'dist/screen/float.html', 'dist/screen/main.cjs', 'dist/screen/preload.cjs', 'dist/screen/host-watchdog.cjs', 'dist/screen/display.cjs'];
const missing = [];
for (const rel of REQUIRED) {
  try {
    await stat(path.join(ROOT, rel));
  } catch {
    missing.push(rel);
  }
}
if (missing.length > 0) {
  console.error(`missing build artifact(s): ${missing.join(', ')}`);
  console.error('run `npm run build` first');
  process.exit(1);
}

try {
  await stat(TARGET);
} catch {
  console.error(`target not found: ${TARGET}`);
  console.error('install the plugin first (plugin_manager install_bundle) or check --profile');
  process.exit(1);
}

const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const rows = [];
for (const rel of paths) {
  const from = path.join(ROOT, rel);
  const to = path.join(TARGET, rel);
  let state = 'new';
  try {
    state = (await hash(from)) === (await hash(to)) ? 'same' : 'changed';
  } catch {
    /* missing at target */
  }
  rows.push({ rel, state });
}

const width = Math.max(...rows.map((r) => r.rel.length));
for (const r of rows) console.log(`${r.rel.padEnd(width)}  ${r.state}`);
const changed = rows.filter((r) => r.state !== 'same').length;
console.log(`\nprofile=${profile}\ntarget=${TARGET}\nchanged=${changed}/${rows.length}`);

if (!apply) {
  console.log('\nDRY RUN — re-run with --apply to copy, then restart DeepSeek Harness.');
  process.exit(0);
}
for (const r of rows) {
  const to = path.join(TARGET, r.rel);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(path.join(ROOT, r.rel), to);
}
console.log(`\napplied ${changed} file(s). Restart DeepSeek Harness to load the new host code.`);
console.log('verify with: npm run check:live');
