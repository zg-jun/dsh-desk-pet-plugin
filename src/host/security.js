// Request policy for the pet API. The host web server has no global auth, so
// every mutating route must reject cross-site callers itself.

/** @param {string} hostname */
export function isLoopbackHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
}

function isDesktopShell(headers) {
  const origin = headers.origin;
  if (typeof origin === 'string') {
    try {
      const from = new URL(origin);
      if (from.protocol === 'dsh-app:' && from.hostname === 'app') return true;
    } catch { /* fall through */ }
  }
  return typeof headers.referer === 'string' && headers.referer.startsWith('dsh-app://app');
}

export function isTrustedRequest(req, serverOrigin) {
  const headers = req.headers || {};
  const origin = headers.origin;
  // The desktop app's renderer runs on its own dsh-app://app scheme while the
  // Host API is loopback HTTP. Its POSTs are cross-site by Fetch metadata but
  // are still the trusted app shell, not an arbitrary web page.
  if (isDesktopShell(headers)) return true;
  const site = headers['sec-fetch-site'];
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false;

  if (typeof origin !== 'string') return true;
  if (origin === 'null') return site === undefined || site === 'none';
  if (!serverOrigin) return false;

  try {
    const from = new URL(origin);
    const self = new URL(serverOrigin);
    if (from.protocol !== self.protocol || from.port !== self.port) return false;
    if (from.hostname === self.hostname) return true;
    return isLoopbackHost(from.hostname) && isLoopbackHost(self.hostname);
  } catch {
    return false;
  }
}
