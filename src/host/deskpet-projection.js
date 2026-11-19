// Host-side desk-pet projection. Phase 2A foundation: derive the running/task
// half of the pet status from the Session log, instead of the Web client
// scanning every store and POSTing it.
//
// Pending approvals/questions are intentionally NOT here: DSH exposes them on
// the Client's uiSession.sessionStatus, so the thin client still pushes those
// on change (see the companion architecture plan).

export const DESKPET_KEY = 'deskPetStatus';
export const DESKPET_STATE_VERSION = 1;

// The projection table expects ZodType at runtime; this structural schema is
// enough for the registry's parse/safeParse calls and keeps the plugin free of
// a duplicate zod dependency.
const passthrough = {
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
};

/** Event timestamps arrive as epoch ms (seconds are normalized defensively). */
function epochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return epochMs(n);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** @param {any} header @param {number} _inherited */
export function init(header, _inherited) {
  return {
    sessionId: String((header && header.id) || ''),
    running: false,
    mode: 'idle',
    task: typeof (header && header.title) === 'string' ? header.title.slice(0, 120) : '',
    startedAt: 0,
    endedAt: 0,
    updatedAt: 0,
  };
}

/** @param {any} content */
function textOf(content) {
  if (!Array.isArray(content)) return '';
  const contextLine = /^(Current runtime context|Current working directory|Current DSH file policy|Approval prompts|Current DeepSeek Harness|Current DSH Web GUI URL|Time sampled|Browser time zone|Elapsed since)/;
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !contextLine.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Pure fold over the Session log. `turn/start`/`turn/end` drive running;
 * the latest user text is the task label.
 * @param {any} state @param {any} event
 */
export function apply(state, event) {
  if (!event || typeof event.type !== 'string') return state;
  const at = epochMs(event.time) || state.updatedAt;
  switch (event.type) {
    case 'turn/start':
      return { ...state, running: true, mode: 'working', startedAt: at || state.startedAt, endedAt: 0, updatedAt: at };
    case 'user/message': {
      const task = textOf(event.data && event.data.content);
      return {
        ...state, task: state.task || task, running: true, mode: 'working',
        startedAt: state.startedAt || at, updatedAt: at,
      };
    }
    case 'turn/end': {
      const kind = event.data && event.data.reason && event.data.reason.kind;
      return {
        ...state, running: false, mode: kind === 'completed' ? 'done' : 'idle',
        endedAt: at || state.endedAt, updatedAt: at,
      };
    }
    default:
      return state;
  }
}

/** @param {any} state */
export function view(state) {
  return {
    running: Boolean(state.running),
    mode: state.mode,
    task: state.task,
    sessionId: state.sessionId,
    startedAt: Number(state.startedAt) || 0,
    endedAt: Number(state.endedAt) || 0,
    updatedAt: state.updatedAt,
  };
}

export const deskPetProjection = {
  key: DESKPET_KEY,
  stateVersion: DESKPET_STATE_VERSION,
  stateSchema: passthrough,
  init,
  apply,
  wire: { viewSchema: passthrough, view, summary: false },
};

/**
 * Pick the status the pet should show from per-session projection values.
 * Running sessions outrank finished ones; within a rank the latest update wins.
 * @param {Iterable<any>} values
 */
export function selectProjectionStatus(values) {
  const all = [...values].filter((value) => value && typeof value === 'object');
  if (all.length === 0) return null;
  const rank = (value) => (value.running ? 2 : value.mode === 'done' ? 1 : 0);
  all.sort((a, b) => rank(b) - rank(a) || (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  const best = all[0];
  return {
    mode: best.running ? 'working' : (best.mode === 'done' ? 'done' : 'idle'),
    task: typeof best.task === 'string' ? best.task : '',
    sessionId: typeof best.sessionId === 'string' ? best.sessionId : '',
    startedAt: Number(best.startedAt) || 0,
    endedAt: Number(best.endedAt) || 0,
  };
}

/**
 * Pick a human-readable task label. Projection titles are preferred; goal
 * prompts/runtime-context dumps fall back to the Client's short status task.
 * @param {unknown} projected @param {unknown} fallback
 */
export function pickTask(projected, fallback) {
  const p = typeof projected === 'string' ? projected.trim() : '';
  const f = typeof fallback === 'string' ? fallback.trim() : '';
  const noisy = !p || p.length > 160 || /^<goal_round>|Current runtime context|Current working directory/.test(p);
  return (noisy && f ? f : p).slice(0, 120);
}
