// Duplication ratchet for B0: known duplicate primitives and debt counters may
// only go DOWN. Growth fails the gate; run with --update to re-baseline on purpose.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { maskSource, functions } from './validate/lib/scan.mjs';

const BASELINE = 'test/debt-baseline.json';
const UPDATE = process.argv.includes('--update');

const index = await readFile('src/index.js', 'utf8');
// client.js is generated now: measure its source, and the core sources, not the bundle.
const client = await readFile('src/scene/web/client.js', 'utf8');
const hostFiles = (await readdir('src/host')).filter((f) => f.endsWith('.js')).sort();
const hostSources = await Promise.all(hostFiles.map((f) => readFile(`src/host/${f}`, 'utf8')));
const screenCss = await readFile('src/scene/screen/style.css', 'utf8');
const screenJs = await readFile('src/scene/screen/renderer.js', 'utf8');
const screenHtml = await readFile('src/scene/screen/index.html', 'utf8');
const coreFiles = (await readdir('src/core')).filter((f) => f.endsWith('.ts')).sort();
const coreSources = await Promise.all(coreFiles.map((f) => readFile(`src/core/${f}`, 'utf8')));
const assetFiles = (await readdir('src/assets')).filter((f) => f.endsWith('.js')).sort();
const assetSources = await Promise.all(assetFiles.map((f) => readFile(`src/assets/${f}`, 'utf8')));
// tokens.ts is the one place colour literals are allowed. src/assets/* carry
// their own SVG palette and are exempt from the colour scan (but still counted
// for structural duplication).
const colorSources = coreSources.filter((_, i) => coreFiles[i] !== 'tokens.ts');
const all = [index, ...hostSources, client, ...colorSources, screenCss, screenJs, screenHtml].join('\n');
const count = (text, re) => (text.match(re) || []).length;

function embedded(raw) {
  return [...raw.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

function longFunctions(raw, { skipFactory = false } = {}) {
  return functions(maskSource(raw), raw)
    .filter((f) => f.lines > 60 && !(skipFactory && f.name === 'factory'))
    .map((f) => `${f.name}:${f.lines}`);
}

const long = [
  ...longFunctions(index),
  ...hostSources.flatMap((s) => longFunctions(s)),
  ...embedded(index).flatMap((s) => longFunctions(s)),
  ...longFunctions(client),
  ...longFunctions(screenJs),
  ...coreSources.flatMap((s) => longFunctions(s)),
  ...assetSources.flatMap((s) => longFunctions(s)),
];

const actual = {
  catSvg64: count(`${client}\n${assetSources.join('\n')}`, /M17 28 L11 7 L34 19 Z/g),
  catSvg96: count(`${index}\n${screenHtml}`, /M26 38 L17 9 L47 26 Z/g),
  segPrimitive: count(all, /\.dpp-seg \{|\.desk-pet-seg \{/g),
  buttonPrimitive: count(all, /\.dp-btn \{|\.dpp-btn \{|\.desk-pet-runtime-primary,/g),
  cardPrimitive: count(all, /\.dpp-card \{|\.desk-pet-runtime \{|const card = \{/g),
  hexColors: count(all, /#[0-9a-fA-F]{3,8}\b/g),
  rgbaColors: count(all, /\brgba?\(/g),
  functionsOver60: long.length,
};

if (UPDATE) {
  const next = {
    capturedAt: new Date().toISOString().slice(0, 10),
    note: 'Ratchet: counts may only go down. Update deliberately with --update.',
    patterns: actual,
    longFunctions: long,
  };
  await writeFile(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`updated ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(BASELINE, 'utf8')).patterns;
const rows = [];
let failed = 0;
let improved = 0;
for (const [key, now] of Object.entries(actual)) {
  const was = baseline[key];
  const state = was === undefined ? 'NEW' : now > was ? 'GROW' : now < was ? 'DOWN' : 'ok';
  if (state === 'GROW' || (state === 'NEW' && now > 0)) failed += 1;
  if (state === 'DOWN') improved += 1;
  rows.push({ key, was, now, state });
}

const width = Math.max(...rows.map((r) => r.key.length));
for (const r of rows) {
  console.log(`${r.key.padEnd(width)}  was=${String(r.was).padStart(4)}  now=${String(r.now).padStart(4)}  ${r.state}`);
}
console.log(`\nlong functions (>60): ${long.join(', ')}`);
if (failed) {
  console.error(`\nDEBT FAIL: ${failed} counter(s) grew. Remove the duplicate or justify via --update.`);
  process.exit(1);
}
console.log(`\nDEBT OK${improved ? ` (${improved} improved — run --update to lock in)` : ''}`);
