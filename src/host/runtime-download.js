// Download the runtime zip and verify it before any extraction. Extracted from
// installRuntime so the fetch→write→SHA256 path can be integration-tested
// without a 120MB network download.

import { createWriteStream } from 'node:fs';
import { fetchRuntimeHash, assertSha256 } from './runtime-integrity.js';

/**
 * @param {object} options
 * @param {string} options.zipUrl
 * @param {string} options.version
 * @param {string} options.platform
 * @param {string} options.arch
 * @param {string} options.zipPath
 * @param {AbortSignal} [options.signal]
 * @param {(received: number, total: number) => void} [options.onProgress]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string[]} [options.shasumsUrls]
 */
export async function downloadVerifiedRuntime(options) {
  const {
    zipUrl, version, platform, arch, zipPath, signal, onProgress, fetchImpl = fetch, shasumsUrls,
  } = options;
  const { expected } = await fetchRuntimeHash(version, platform, arch, fetchImpl, { sources: shasumsUrls, signal });
  if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
  if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
  const resp = await fetchImpl(zipUrl, { redirect: 'follow', signal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const total = Number(resp.headers.get('content-length')) || 0;
  const out = createWriteStream(zipPath);
  let received = 0;
  // 读流可能在断网/卡住时长时间没有 chunk：用 abort 直接打断，而不是等下一个 chunk。
  const aborted = signal
    ? new Promise((_, reject) => {
      const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
    })
    : null;
  const reading = (async () => {
    for await (const chunk of /** @type {any} */ (resp.body)) {
      received += chunk.length;
      if (onProgress) onProgress(received, total);
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    await assertSha256(zipPath, expected);
  })();
  try {
    await (aborted ? Promise.race([reading, aborted]) : reading);
  } catch (error) {
    out.destroy();
    throw error;
  }
  return { expected, total: total || received, received };
}
