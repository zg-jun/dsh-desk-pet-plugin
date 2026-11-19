import { describe, expect, it } from 'vitest';
import { BUBBLE_SPEC_VERSION, toBubbleSpec } from '../../src/core/bubbles.js';

describe('BubbleSpec', () => {
  it('maps known and unknown kinds with data-only actions', () => {
    expect(toBubbleSpec({ kind: 'approval', summary: 's', options: ['yes', { label: 'no', recommended: true }] })).toMatchObject({
      schemaVersion: BUBBLE_SPEC_VERSION, kind: 'approval', summary: 's',
      actions: [{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no', recommended: true }],
    });
    expect(toBubbleSpec({ kind: 'form' })?.kind).toBe('other');
    expect(toBubbleSpec(null)).toBeNull();
  });
});
