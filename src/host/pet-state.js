// Explicit pet lifecycle state owned by the Host.
//
// The child process is a companion of DSH: one writer decides when it starts,
// stops, or fails. Keeping the transition table here (instead of scattered
// effects) makes illegal states visible in tests and diagnostics.

export const PET_STATES = ['off', 'starting', 'on', 'stopping', 'failed'];

const ALLOWED = {
  off: ['starting'],
  starting: ['on', 'failed', 'stopping'],
  on: ['stopping', 'failed'],
  stopping: ['off', 'starting'],
  failed: ['starting', 'off'],
};

/**
 * @param {string} state
 * @param {string} next
 */
export function canTransition(state, next) {
  return Boolean(ALLOWED[state] && ALLOWED[state].includes(next));
}

/**
 * @param {string} [initial]
 * @param {(state: string) => void} [onChange]
 */
export function createPetState(initial = 'off', onChange) {
  if (!PET_STATES.includes(initial)) throw new Error(`bad pet state: ${initial}`);
  let state = initial;
  return {
    get: () => state,
    is: (value) => state === value,
    can: (next) => canTransition(state, next),
    set(next) {
      if (!canTransition(state, next)) throw new Error(`illegal pet transition: ${state} -> ${next}`);
      state = next;
      if (onChange) onChange(state);
      return state;
    },
    /** External events (child exit / host cleanup) may need to reset. */
    reset(next) {
      if (!PET_STATES.includes(next)) throw new Error(`bad pet state: ${next}`);
      state = next;
      if (onChange) onChange(state);
      return state;
    },
  };
}
