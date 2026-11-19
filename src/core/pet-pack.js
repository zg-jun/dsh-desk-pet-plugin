// Versioned, data-only pet-pack manifest. Executable payloads are rejected;
// unknown kinds/actions must never run code from a downloaded pet.

export const PET_PACK_SCHEMA = 'pet-pack@1';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEMVER = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/;
const EXECUTABLE_KEYS = new Set(['main', 'script', 'entry', 'exec', 'command', 'bin']);

/**
 * @param {unknown} manifest
 * @returns {{ id: string; version: string; displayName: string; atlas: string; animations: Record<string, string>; theme?: Record<string, string>; checksum?: string }}
 */
// A data-only schema validator is intentionally guard-heavy: one place to
// audit every accepted field before a pet pack reaches disk.
// eslint-disable-next-line complexity
export function parsePetPack(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('pet-pack must be an object');
  const m = /** @type {Record<string, any>} */ (manifest);
  if (m.schemaVersion !== PET_PACK_SCHEMA) throw new Error(`unsupported pet-pack schema: ${m.schemaVersion}`);
  for (const key of Object.keys(m)) if (EXECUTABLE_KEYS.has(key)) throw new Error(`pet-pack may not contain ${key}`);
  if (typeof m.id !== 'string' || !ID.test(m.id)) throw new Error('invalid pet-pack id');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) throw new Error('invalid pet-pack version');
  if (typeof m.displayName !== 'string' || !m.displayName.trim()) throw new Error('pet-pack displayName required');
  if (typeof m.atlas !== 'string' || !m.atlas.trim()) throw new Error('pet-pack atlas required');
  if (!m.animations || typeof m.animations !== 'object' || Array.isArray(m.animations)) throw new Error('pet-pack animations required');
  const animations = {};
  for (const [name, file] of Object.entries(m.animations)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name) || typeof file !== 'string' || !file.trim()) throw new Error('invalid pet-pack animation');
    animations[name] = file.slice(0, 200);
  }
  const theme = m.theme && typeof m.theme === 'object' && !Array.isArray(m.theme) ? m.theme : undefined;
  return {
    id: m.id,
    version: m.version,
    displayName: m.displayName.slice(0, 120),
    atlas: m.atlas.slice(0, 200),
    animations,
    ...(theme ? { theme } : {}),
    ...(typeof m.checksum === 'string' ? { checksum: m.checksum.slice(0, 128) } : {}),
  };
}
