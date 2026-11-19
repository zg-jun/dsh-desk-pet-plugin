// Bundles src/core into a single IIFE for the float window and (later) the web client.
// Output is committed because the host serves it at runtime without a build step.
import { build } from 'esbuild';
import { mkdir, stat, writeFile, readFile, copyFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/core/browser.ts'],
  outfile: 'dist/pet-core.js',
  bundle: true,
  format: 'iife',
  globalName: 'PetCore',
  platform: 'browser',
  target: ['chrome120'],
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const { size } = await stat('dist/pet-core.js');
console.log(`built dist/pet-core.js (${size} bytes)`);

// Screen app: real source files -> one self-contained page + the child main.
const css = await readFile('src/scene/screen/style.css', 'utf8');
const renderer = await readFile('src/scene/screen/renderer.js', 'utf8');
const shell = await readFile('src/scene/screen/index.html', 'utf8');
const screenHtml = shell
  .replace('<!--SCREEN_STYLE-->', `<style>\n${css}\n</style>`)
  .replace('<!--SCREEN_SCRIPT-->', `<script>\n${renderer}\n</script>`);
await mkdir('dist/screen', { recursive: true });
await writeFile('dist/screen/float.html', screenHtml);
await copyFile('src/scene/screen/main.cjs', 'dist/screen/main.cjs');
await copyFile('src/scene/screen/host-watchdog.cjs', 'dist/screen/host-watchdog.cjs');
await copyFile('src/scene/screen/display.cjs', 'dist/screen/display.cjs');
await copyFile('src/scene/screen/preload.cjs', 'dist/screen/preload.cjs');
console.log(`built dist/screen/float.html (${screenHtml.length} bytes)`);

// Web client: ESM source -> CJS -> factory(require) wrapper expected by the shell.
const clientBuild = await build({
  entryPoints: ['src/scene/web/client.js'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120'],
  external: ['react'],
  logLevel: 'warning',
});
const cjs = clientBuild.outputFiles[0].text;
const wrapped = `window.__ModuleLoader__.load({
  id: 'dsh-desk-pet-plugin',
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
${cjs}
    return module.exports.plugin;
  },
});
`;
await writeFile('dist/client.js', wrapped);
const clientSize = (await stat('dist/client.js')).size;
// DSH's client loader resolves package-root client.js by convention.
await copyFile('dist/client.js', 'client.js');
console.log(`built dist/client.js + client.js (${clientSize} bytes)`);

// Host: ESM bundle so index.js is a build artifact too. node:* stays external.
await build({
  entryPoints: ['src/index.js'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  external: ['node:*'],
  logLevel: 'warning',
});
console.log(`built dist/index.js (${(await stat('dist/index.js')).size} bytes)`);
