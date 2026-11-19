import { describe, expect, it } from 'vitest';
import { MODES, UI_EVENT_TYPES, isRuntimePhase, isUiEventType } from '../../src/core/protocol';
import { DOT_COLORS, cssVariables, dotColorFor } from '../../src/core/tokens';

describe('protocol vocabulary', () => {
  it('lists the four session modes', () => {
    expect(MODES).toEqual(['idle', 'working', 'waiting', 'done']);
  });

  it('guards runtime phases', () => {
    expect(isRuntimePhase('ready')).toBe(true);
    expect(isRuntimePhase('downloading')).toBe(true);
    expect(isRuntimePhase('nope')).toBe(false);
    expect(isRuntimePhase(42)).toBe(false);
  });

  it('does not resurrect removed ui events', () => {
    expect(UI_EVENT_TYPES).toContain('pet-answer');
    expect(UI_EVENT_TYPES).not.toContain('activate-pet');
    expect(isUiEventType('open-settings')).toBe(true);
    expect(isUiEventType('set-pet')).toBe(false);
  });
});

describe('tokens', () => {
  it('owns the dot colours', () => {
    expect(dotColorFor('working')).toBe(DOT_COLORS.working);
    expect(dotColorFor('waiting')).toBe(DOT_COLORS.waiting);
    expect(dotColorFor('done')).toBe(DOT_COLORS.done);
    expect(dotColorFor('idle')).toBeNull();
  });

  it('serialises css variables', () => {
    const vars = cssVariables();
    expect(vars['--dp-dot-waiting']).toBe(DOT_COLORS.waiting);
    expect(vars['--dp-brand']).toMatch(/^#/);
  });
});
