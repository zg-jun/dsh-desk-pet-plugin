// Per-profile instance identity and paths. The Electron runtime is shared, but
// pid/pos/settings/userData must not be: two profiles otherwise kill each
// other's pet and overwrite the on/off state.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Profile name from the installed package path:
 *   ~/.dsh/profiles/<name>/node_modules/<pkg>/index.js
 * The GUI-launched Host does not export DSH_PROFILE, so this is the only
 * stable per-profile signal available to the plugin.
 * @param {string} fileUrl
 */
export function profileFromPath(fileUrl) {
  try {
    const parts = fileURLToPath(fileUrl).split(path.sep);
    const index = parts.lastIndexOf('profiles');
    const name = index >= 0 ? parts[index + 1] : '';
    return typeof name === 'string' ? name : '';
  } catch {
    return '';
  }
}

/** Stable across port changes; based on the active DSH profile. */
export function instanceKey(env = process.env, fileUrl = import.meta.url) {
  const fromPath = profileFromPath(fileUrl);
  const fromProfile = typeof env.DSH_PROFILE === 'string' ? env.DSH_PROFILE : '';
  const fromDir = typeof env.DSH_PROFILE_DIR === 'string' && env.DSH_PROFILE_DIR
    ? path.basename(env.DSH_PROFILE_DIR)
    : '';
  const raw = (fromPath || fromProfile || fromDir || 'default').trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 64);
  return safe || 'default';
}

/** @param {string} baseDir @param {string} key */
export function resolveDirs(baseDir, key) {
  const instance = path.join(baseDir, 'instances', key);
  return {
    base: baseDir,
    runtime: path.join(baseDir, 'runtime'),
    instance,
    settings: path.join(instance, 'settings.json'),
    pid: path.join(instance, 'child.pid'),
    pos: path.join(instance, 'pos.json'),
    userData: path.join(instance, 'userData'),
    main: path.join(instance, 'main.js'),
    preload: path.join(instance, 'preload.js'),
    pkg: path.join(instance, 'package.json'),
  };
}
