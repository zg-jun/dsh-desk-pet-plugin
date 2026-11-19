import { isTrustedRequest } from './security.js';

export const MAX_BODY = 64 * 1024;

export const bodyTooLarge = (error) => Boolean(error && /** @type {any} */ (error).code === 'body-too-large');

export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body-too-large'), { code: 'body-too-large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Enforce POST + trusted caller. `sendJSON` is injected to keep this module
 * independent of the Host's response helpers.
 */
export function requirePost(req, res, { serverOrigin, token, sendJSON }) {
  if (req.method !== 'POST') {
    sendJSON(res, 405, { ok: false, error: 'method-not-allowed' });
    return false;
  }
  if (!isTrustedRequest(req, serverOrigin)) {
    sendJSON(res, 403, { ok: false, error: 'forbidden' });
    return false;
  }
  const desktopClient = String(req.headers['user-agent'] || '').includes('@deepseek-ai/dsh-desktop/');
  const browserSignal = typeof req.headers.origin === 'string'
    || typeof req.headers['sec-fetch-site'] === 'string'
    || (typeof req.headers['sec-fetch-mode'] === 'string' && desktopClient);
  if (!browserSignal && req.headers['x-desk-pet-token'] !== token) {
    sendJSON(res, 403, { ok: false, error: 'forbidden' });
    return false;
  }
  return true;
}
