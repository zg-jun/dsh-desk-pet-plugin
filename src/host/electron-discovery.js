// Local standalone-Electron discovery. A real Electron on the machine makes
// the ~121MB runtime download unnecessary. Packaged apps (VS Code, Slack, DSH
// itself) embed their own app and cannot launch an arbitrary app directory.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function electronCandidates() {
  const home = os.homedir();
  const out = [];
  const add = (p) => { if (p) out.push(p); };
  const electronApp = (root) => {
    if (process.platform === 'darwin') add(path.join(root, 'Electron.app/Contents/MacOS/Electron'));
    else if (process.platform === 'win32') add(path.join(root, 'electron.exe'));
    else add(path.join(root, 'electron'));
  };
  if (process.platform === 'darwin') {
    add('/Applications/Electron.app/Contents/MacOS/Electron');
    add(path.join(home, 'Applications/Electron.app/Contents/MacOS/Electron'));
  }
  // electron's own download cache (any version)
  const caches = process.platform === 'darwin'
    ? [path.join(home, 'Library/Caches/electron')]
    : process.platform === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData/Local'), 'electron', 'Cache')]
      : [path.join(home, '.cache/electron')];
  // node_modules/electron in the workspace or the home directory
  for (const base of [process.cwd(), home]) electronApp(path.join(base, 'node_modules/electron/dist'));
  return { out, caches };
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function isStandaloneElectron(bin) {
  if (!(await exists(bin))) return false;
  if (process.platform === 'darwin') {
    if (path.basename(bin) !== 'Electron') return false;
    const contents = path.dirname(path.dirname(bin));
    return exists(path.join(contents, 'Frameworks', 'Electron Framework.framework'));
  }
  return true;
}

/** First usable local Electron binary, or null. No caching: cheap stat scan. */
export async function findLocalElectron() {
  const { out, caches } = electronCandidates();
  const candidates = [...out];
  for (const cache of caches) {
    try {
      for (const entry of await fs.readdir(cache)) {
        if (process.platform === 'darwin') {
          candidates.push(path.join(cache, entry, 'Electron.app/Contents/MacOS/Electron'));
          candidates.push(path.join(cache, entry, 'electron', 'Electron.app/Contents/MacOS/Electron'));
        } else if (process.platform === 'win32') {
          candidates.push(path.join(cache, entry, 'electron.exe'));
        } else {
          candidates.push(path.join(cache, entry, 'electron'));
        }
      }
    } catch { /* no cache dir */ }
  }
  for (const bin of candidates) {
    if (await isStandaloneElectron(bin)) return bin;
  }
  return null;
}
