import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PETS_DIR = path.join(os.homedir(), '.petdex', 'pets');
const MANIFEST_URL = 'https://petdex.dev/api/manifest';
const ASSET_ORIGIN = 'https://assets.petdex.dev/';
const MANIFEST_TTL = 5 * 60 * 1000;
const SLUG_RE = /^[a-z0-9-]+$/;

let manifestCache = { at: 0, pets: null };

export async function getManifest() {
  if (manifestCache.pets && Date.now() - manifestCache.at < MANIFEST_TTL) return manifestCache.pets;
  try {
    // A dead CDN must not hold the settings page in loading forever; fall back
    // to the last successful catalog when the request fails or times out.
    const res = await fetch(MANIFEST_URL, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const data = await res.json();
    const pets = Array.isArray(data.pets) ? data.pets : [];
    manifestCache = { at: Date.now(), pets };
    return pets;
  } catch (error) {
    if (manifestCache.pets) return manifestCache.pets;
    throw error;
  }
}

export function sendJSON(res, status, obj) {
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

export async function handleInstalled(res) {
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
    let installedAt = 0;
    try {
      const stat = await fs.stat(dir);
      installedAt = stat.birthtimeMs || stat.mtimeMs || 0;
    } catch { /* keep zero */ }
    pets.push({ slug: entry.name, displayName, description, ext, installedAt });
  }
  // Newest install first: the pool should show the just-added pet right after
  // the built-in cat, including after a restart.
  pets.sort((a, b) => b.installedAt - a.installedAt);
  for (const pet of pets) delete pet.installedAt;
  sendJSON(res, 200, { ok: true, pets });
}

export async function handleInstall(slug, res) {
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

export async function handleRemove(slug, res) {
  if (!SLUG_RE.test(slug)) return sendJSON(res, 400, { ok: false, error: 'bad-slug' });
  await fs.rm(path.join(PETS_DIR, slug), { recursive: true, force: true });
  sendJSON(res, 200, { ok: true });
}

export async function handleSprite(rest, res) {
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

export async function handleAsset(url, res) {
  const target = url.searchParams.get('url') || '';
  if (!target.startsWith(ASSET_ORIGIN)) return sendJSON(res, 400, { ok: false, error: 'bad-url' });
  try {
    const upstream = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
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

