import { describe, expect, it } from 'vitest';
import { isLoopbackHost, isTrustedRequest } from '../../src/host/security.js';

const SELF = 'http://127.0.0.1:56777';
const req = (headers: Record<string, string | undefined>) => ({ headers });

describe('isLoopbackHost', () => {
  it('classifies loopback aliases', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('192.168.1.10')).toBe(false);
  });
});

describe('isTrustedRequest', () => {
  it('allows non-browser callers (no Origin)', () => {
    expect(isTrustedRequest(req({}), SELF)).toBe(true);
    expect(isTrustedRequest(req({ 'sec-fetch-site': 'none' }), SELF)).toBe(true);
  });

  it('allows the same origin and loopback aliases', () => {
    expect(isTrustedRequest(req({ origin: SELF }), SELF)).toBe(true);
    expect(isTrustedRequest(req({ origin: 'http://localhost:56777' }), SELF)).toBe(true);
    expect(isTrustedRequest(req({ origin: 'http://127.0.0.1:56777', 'sec-fetch-site': 'same-origin' }), SELF)).toBe(true);
  });

  it('rejects cross-site callers', () => {
    expect(isTrustedRequest(req({ origin: 'https://evil.example' }), SELF)).toBe(false);
    expect(isTrustedRequest(req({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), SELF)).toBe(false);
    expect(isTrustedRequest(req({ 'sec-fetch-site': 'cross-site' }), SELF)).toBe(false);
  });

  it('rejects origins on another port or protocol', () => {
    expect(isTrustedRequest(req({ origin: 'http://127.0.0.1:56778' }), SELF)).toBe(false);
    expect(isTrustedRequest(req({ origin: 'https://127.0.0.1:56777' }), SELF)).toBe(false);
  });

  it('treats a null origin as trusted only without cross-site evidence', () => {
    expect(isTrustedRequest(req({ origin: 'null' }), SELF)).toBe(true);
    expect(isTrustedRequest(req({ origin: 'null', 'sec-fetch-site': 'none' }), SELF)).toBe(true);
    expect(isTrustedRequest(req({ origin: 'null', 'sec-fetch-site': 'cross-site' }), SELF)).toBe(false);
  });

  it('rejects origin-bearing requests when the host origin is unknown', () => {
    expect(isTrustedRequest(req({ origin: SELF }), null)).toBe(false);
  });
});
