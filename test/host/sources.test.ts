import { describe, expect, it } from 'vitest';
import { createSourceRegistry } from '../../src/host/sources.js';

describe('PetSource registry', () => {
  it('prefers priority and disposes', () => {
    const registry = createSourceRegistry();
    const dispose = registry.register({ id: 'a', priority: 1, read: () => ({ mode: 'idle', task: 'a' }) });
    registry.register({ id: 'b', priority: 5, read: () => ({ mode: 'working', task: 'b' }) });
    expect(registry.snapshot()?.sourceId).toBe('b');
    dispose();
    expect(registry.snapshot()?.sourceId).toBe('b');
    registry.dispose();
    expect(registry.snapshot()).toBeNull();
  });

  it('skips stale and failing sources', () => {
    const registry = createSourceRegistry();
    registry.register({ id: 'stale', priority: 9, ttlMs: 10, read: () => ({ mode: 'done', updatedAt: 0 }) });
    registry.register({ id: 'throw', priority: 8, read: () => { throw new Error('x'); } });
    registry.register({ id: 'fresh', priority: 1, read: () => ({ mode: 'working', updatedAt: 100 }) });
    expect(registry.snapshot(100)?.sourceId).toBe('fresh');
  });
});
