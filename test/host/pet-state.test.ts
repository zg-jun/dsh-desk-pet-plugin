import { describe, expect, it, vi } from 'vitest';
import { canTransition, createPetState, PET_STATES } from '../../src/host/pet-state.js';

describe('pet-state', () => {
  it('accepts the documented transitions and rejects illegal ones', () => {
    expect(canTransition('off', 'starting')).toBe(true);
    expect(canTransition('starting', 'on')).toBe(true);
    expect(canTransition('starting', 'failed')).toBe(true);
    expect(canTransition('on', 'stopping')).toBe(true);
    expect(canTransition('on', 'failed')).toBe(true);
    expect(canTransition('starting', 'stopping')).toBe(true);
    expect(canTransition('stopping', 'off')).toBe(true);
    expect(canTransition('failed', 'starting')).toBe(true);
    expect(canTransition('failed', 'off')).toBe(true);

    expect(canTransition('off', 'on')).toBe(false);
    expect(canTransition('on', 'starting')).toBe(false);
    expect(canTransition('stopping', 'on')).toBe(false);
    expect(canTransition('off', 'failed')).toBe(false);
    expect(canTransition('unknown', 'off')).toBe(false);
  });

  it('rejects unknown initial states and illegal transitions', () => {
    expect(() => createPetState('bogus')).toThrow(/bad pet state/);
    const state = createPetState('off');
    expect(() => state.set('on')).toThrow(/illegal pet transition/);
    expect(PET_STATES).toEqual(['off', 'starting', 'on', 'stopping', 'failed']);
  });

  it('notifies on every accepted transition', () => {
    const seen: string[] = [];
    const state = createPetState('off', (next) => seen.push(next));
    state.set('starting');
    state.set('on');
    state.set('stopping');
    state.set('off');
    expect(seen).toEqual(['starting', 'on', 'stopping', 'off']);
    expect(state.get()).toBe('off');

    state.set('starting');
    state.reset('failed');
    expect(state.get()).toBe('failed');
    state.set('starting');
    state.set('on');
    state.reset('off');
    expect(state.get()).toBe('off');
  });
});
