// Runtime install mechanics: download → verify → extract → stamp.
// Kept free of Host state so every step (and every failure mode) can be
// integration-tested without a 120MB network download.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { downloadVerifiedRuntime } from './runtime-download.js';

/**
 * Extract the verified zip; rejects on a non-zero exit or spawn error.
 * @param {object} options
 * @param {string} options.platform
 * @param {string} options.zipPath
 * @param {string} options.runtimeDir
 * @param {(cmd: string, args: string[], opts: object) => any} options.spawnImpl
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<void>}
 */
/** @returns {Array<[string, string[]]>} */
function extractCommands(platform, zipPath, runtimeDir) {
  if (platform === 'win32') return [['tar', ['-xf', zipPath, '-C', runtimeDir]]];
  if (platform === 'darwin') {
    // 绝对路径优先：Electron 应用的 PATH 可能不含 /usr/bin，spawn('unzip') 会 ENOENT。
    return [
      ['/usr/bin/unzip', ['-q', '-o', zipPath, '-d', runtimeDir]],
      ['/usr/bin/ditto', ['-x', '-k', zipPath, runtimeDir]],
      ['unzip', ['-q', '-o', zipPath, '-d', runtimeDir]],
    ];
  }
  return [['unzip', ['-q', '-o', zipPath, '-d', runtimeDir]]];
}

function runExtract(cmd, args, { spawnImpl, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args, { stdio: 'ignore' });
    const onAbort = () => { try { child.kill(); } catch { /* already gone */ } };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('exit', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`extract failed (code ${code})`), { code, cmd }));
    });
    child.on('error', (error) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(Object.assign(error, { cmd }));
    });
  });
}

export async function extractZip({ platform, zipPath, runtimeDir, spawnImpl, signal }) {
  const commands = extractCommands(platform, zipPath, runtimeDir);
  let lastError = null;
  for (const [cmd, args] of commands) {
    try {
      await runExtract(cmd, args, { spawnImpl, signal });
      return;
    } catch (error) {
      lastError = error;
      // 工具不存在 / 不可执行时才换下一个；解压本身失败直接报。
      const missing = error && (error.code === 'ENOENT' || error.code === 127);
      if (!missing) throw error;
    }
  }
  throw lastError || new Error('extract failed');
}

/**
 * Full install: download + verify + extract + stamp. The caller owns phase
 * reporting and activation; this module only throws raw errors.
 * @param {object} options
 */
export async function installRuntimeCore(options) {
  const {
    zipUrl, shasumsUrls, version, platform, arch, zipPath, runtimeDir, binPath, stampFile,
    fetchImpl = fetch, spawnImpl, signal, onProgress, onPhase,
  } = options;
  const fsImpl = options.fsImpl || fs;
  // 解压到暂存目录，成功后再原子替换：升级被取消/失败时不会破坏已有运行时。
  const stagingDir = `${runtimeDir}.partial`;
  const relativeBin = path.relative(runtimeDir, binPath);
  const stageBin = path.join(stagingDir, relativeBin);
  await fsImpl.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  await fsImpl.mkdir(stagingDir, { recursive: true });
  try {
    const { total, received } = await downloadVerifiedRuntime({
      zipUrl, version, platform, arch, zipPath, signal, shasumsUrls,
      ...(fetchImpl ? { fetchImpl } : {}),
      ...(onProgress ? { onProgress } : {}),
    });
    if (onPhase) onPhase({ phase: 'extracting', received, total });
    const spawn = spawnImpl || (await import('node:child_process')).spawn;
    await extractZip({ platform, zipPath, runtimeDir: stagingDir, spawnImpl: spawn, signal });
    await fsImpl.rm(zipPath, { force: true });
    try {
      await fsImpl.access(stageBin);
    } catch {
      throw new Error('extracted binary missing');
    }
    await fsImpl.writeFile(path.join(stagingDir, stampFile), version);
    await fsImpl.rm(runtimeDir, { recursive: true, force: true });
    await fsImpl.rename(stagingDir, runtimeDir);
    return { bin: binPath, version, received, total };
  } catch (error) {
    await fsImpl.rm(zipPath, { force: true }).catch(() => {});
    await fsImpl.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
