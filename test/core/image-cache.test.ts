import { describe, expect, it } from 'vitest';
import { LruCache } from '../../src/core/image-cache';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now most recent
    cache.set('c', 3);
    expect(cache.has('b')).toBe(false);
    expect(cache.keys()).toEqual(['a', 'c']);
  });

  it('refreshes recency on set of an existing key', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    cache.set('c', 3);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(10);
  });

  it('reports size and clears', () => {
    const cache = new LruCache<string>(3);
    cache.set('x', '1');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('x')).toBeUndefined();
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new LruCache<number>(0)).toThrow(/capacity/);
    expect(() => new LruCache<number>(1.5)).toThrow(/capacity/);
  });
});
