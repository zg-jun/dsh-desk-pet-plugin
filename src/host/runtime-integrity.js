// Runtime download integrity: never extract an unverified Electron zip.
//
// The zip is the executable base of the pet child, so the Host verifies it
// against the release's SHASUMS256.txt before unpacking. Both the official
// release and the mirror are tried; a missing checksum fails closed.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * @param {string} text SHASUMS256.txt content
 * @param {string} filename
 */
export function parseShasums(text, filename) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match && match[2] === filename) return match[1].toLowerCase();
  }
  return null;
}

/** @param {string} file */
export async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

/**
 * @param {string} version
 * @param {string} platform
 * @param {string} arch
 * @param {(url: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 */
/**
 * Resolve the official SHA256 for a runtime zip.
 * @param {string} version
 * @param {string} platform
 * @param {string} arch
 * @param {(url: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 * @param {{ sources?: string[], signal?: AbortSignal }} [options]
 */
export async function fetchRuntimeHash(version, platform, arch, fetchImpl = fetch, options = {}) {
  const sources = options.sources;
  const signal = options.signal;
  const filename = `electron-v${version}-${platform}-${arch}.zip`;
  // 国内环境到 GitHub 基本不可达：先试镜像，避免每次安装都先卡 8s 超时。
  const urls = Array.isArray(sources) && sources.length > 0 ? sources : [
    `https://registry.npmmirror.com/-/binary/electron/v${version}/SHASUMS256.txt`,
    `https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`,
  ];
  for (const url of urls) {
    try {
      if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
      // 校验文件很小：单源 8s 超时，且响应取消信号，避免取消按钮“没反应”。
      const timeout = AbortSignal.timeout(6000);
      const scoped = signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, timeout])
        : timeout;
      const res = await fetchImpl(url, { redirect: 'follow', signal: scoped });
      if (!res.ok) continue;
      const expected = parseShasums(await res.text(), filename);
      if (expected) return { filename, expected, source: url };
    } catch { /* try the next source */ }
  }
  throw new Error(`runtime checksum unavailable for ${filename}`);
}

/**
 * @param {string} file
 * @param {string} expected
 */
export async function assertSha256(file, expected) {
  const actual = await sha256File(file);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`runtime checksum mismatch: expected ${expected}, got ${actual}`);
  }
  return actual;
}
