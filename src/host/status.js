// Host-side normalization for the live status posted by the Web client.
//
// The Host ultimately forwards this to the floating window, so it must not
// accept arbitrary objects/lengths from a local HTTP caller. Keep this pure so
// it can be unit-tested without starting the server.

import { MODES } from '../core/protocol.ts';

export const MAX_TASK = 500;
export const MAX_SUMMARY = 500;
export const MAX_OPTIONS = 8;
export const MAX_TEXT = 200;

/** @param {unknown} value */
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const summaryText = (value, max) => {
  if (typeof value === 'string') return value.slice(0, max);
  if (!value || typeof value !== 'object') return '';
  const record = /** @type {Record<string, unknown>} */ (value);
  for (const key of ['title', 'summary', 'label', 'text', 'message', 'description', 'reason']) {
    if (typeof record[key] === 'string' && record[key]) return record[key].slice(0, max);
  }
  return '';
};

/** @param {unknown} pending */
export function normalizePending(pending) {
  if (!pending || typeof pending !== 'object') return null;
  const p = /** @type {Record<string, unknown>} */ (pending);
  const kind = text(p.kind, 40);
  if (!['approval', 'question', 'other'].includes(kind)) return null;
  const options = Array.isArray(p.options)
    ? p.options.slice(0, MAX_OPTIONS).map((option) => {
      if (typeof option === 'string') return option.slice(0, MAX_TEXT);
      if (!option || typeof option !== 'object') return null;
      const o = /** @type {Record<string, unknown>} */ (option);
      return {
        label: text(o.label, MAX_TEXT),
        ...(typeof o.description === 'string' ? { description: o.description.slice(0, MAX_TEXT) } : {}),
        ...(o.recommended === true ? { recommended: true } : {}),
      };
    }).filter(Boolean)
    : undefined;
  return {
    kind,
    sessionId: text(p.sessionId, 200),
    ...(typeof p.requestId === 'string' ? { requestId: text(p.requestId, 200) } : {}),
    ...(typeof p.questionId === 'string' ? { questionId: text(p.questionId, 200) } : {}),
    summary: summaryText(p.summary, MAX_SUMMARY),
    ...(typeof p.detail === 'string' ? { detail: p.detail.slice(0, MAX_SUMMARY) } : {}),
    ...(options ? { options } : {}),
    ...(p.multi === true ? { multi: true } : {}),
    ...(p.fallback === true ? { fallback: true } : {}),
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {Record<string, unknown> | null} [previous]
 */
export function normalizeStatus(raw, previous = null) {
  const prev = previous || {};
  const mode = typeof raw.mode === 'string' && MODES.includes(/** @type {any} */ (raw.mode)) ? raw.mode : (prev.mode || 'idle');
  const opacity = Number.isFinite(Number(raw.opacity))
    ? Math.min(1, Math.max(0.3, Number(raw.opacity)))
    : (Number(prev.opacity) || 1);
  const size = Number.isFinite(Number(raw.size))
    ? Math.min(1.3, Math.max(0.75, Number(raw.size)))
    : (Number(prev.size) || 1);
  return {
    mode,
    slug: text(raw.slug, 80),
    task: text(raw.task, MAX_TASK),
    kind: text(raw.kind, 40),
    sessionId: text(raw.sessionId, 200),
    pending: normalizePending(raw.pending),
    opacity,
    size,
    // The switch is owned by /config; a status post must never flip it on.
    petOn: prev.petOn !== false,
  };
}
