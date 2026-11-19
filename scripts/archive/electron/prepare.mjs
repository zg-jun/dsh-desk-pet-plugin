// Generate the Electron layout-probe app from the CURRENT float HTML.
// Usage: node scripts/archive/electron/prepare.mjs [--out <dir>]
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const outFlag = process.argv.indexOf('--out');
const OUT = outFlag > 0 ? path.resolve(process.argv[outFlag + 1]) : path.join(ROOT, '.tmp/electron-eval');

let html = await readFile(path.join(ROOT, 'dist/screen/float.html'), 'utf8');
const core = await readFile(path.join(ROOT, 'dist/pet-core.js'), 'utf8');
html = html.replace('<script id="pet-core"></script>', `<script>${core.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace('<title>Desk Pet</title>', `<title>Desk Pet</title>${BOOT}`);

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'index.html'), html);
await copyFile(path.join(import.meta.dirname, 'layout.cjs'), path.join(OUT, 'main.js'));
await writeFile(path.join(OUT, 'package.json'), JSON.stringify({ name: 'dsh-pet-eval', version: '1.0.0', main: 'main.js' }));

console.log(`prepared ${OUT}`);
console.log(`run: env -u ELECTRON_RUN_AS_NODE "$PET_ELECTRON" "${OUT}" --no-sandbox --disable-gpu --user-data-dir=/tmp/dsh-pet-eval-userdata`);
