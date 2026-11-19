// Versioned BubbleSpec seam. Pending interactions are already the only
// client-pushed state; this maps them to a stable, data-only shape so future
// kinds (forms, rich cards) can degrade to "other" instead of crashing.

export const BUBBLE_SPEC_VERSION = 1;
export const BUBBLE_KINDS = ['approval', 'question', 'other'];

/** @param {unknown} pending */
export function toBubbleSpec(pending) {
  if (!pending || typeof pending !== 'object') return null;
  const p = /** @type {Record<string, any>} */ (pending);
  const kind = BUBBLE_KINDS.includes(p.kind) ? p.kind : 'other';
  const summary = typeof p.summary === 'string' ? p.summary.slice(0, 500) : '';
  const actions = Array.isArray(p.options)
    ? p.options.slice(0, 8).map((option) => {
      if (typeof option === 'string') return { label: option.slice(0, 200), value: option.slice(0, 200) };
      if (!option || typeof option !== 'object') return null;
      const label = typeof option.label === 'string' ? option.label.slice(0, 200) : '';
      if (!label) return null;
      return { label, value: label, ...(option.recommended === true ? { recommended: true } : {}) };
    }).filter(Boolean)
    : [];
  return {
    schemaVersion: BUBBLE_SPEC_VERSION,
    kind,
    summary,
    sessionId: typeof p.sessionId === 'string' ? p.sessionId.slice(0, 200) : '',
    ...(typeof p.questionId === 'string' ? { questionId: p.questionId.slice(0, 200) } : {}),
    ...(p.multi === true ? { multi: true } : {}),
    actions,
  };
}
