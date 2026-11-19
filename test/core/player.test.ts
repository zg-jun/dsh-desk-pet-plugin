import { describe, expect, it } from 'vitest';
import { PetPlayer } from '../../src/core/player';

const player = (): PetPlayer => PetPlayer.fromSize(1536, 1872);

describe('PetPlayer timeline', () => {
  it('starts on idle frame 0', () => {
    const p = player();
    expect(p.animation).toBe('idle');
    expect(p.frameIndex).toBe(0);
    expect(p.rect()).toEqual({ sx: 0, sy: 0, sw: 192, sh: 208 });
  });

  it('advances only when the frame duration is reached', () => {
    const p = player();
    expect(p.advance(279)).toBe(false);
    expect(p.frameIndex).toBe(0);
    expect(p.advance(1)).toBe(true);
    expect(p.frameIndex).toBe(1);
    expect(p.advance(110)).toBe(true);
    expect(p.frameIndex).toBe(2);
  });

  it('loops and keeps the remainder', () => {
    const p = player();
    // idle: 280 + 110 + 110 = 500ms -> frame 3
    expect(p.advance(500)).toBe(true);
    expect(p.frameIndex).toBe(3);
    expect(p.elapsed).toBe(0);
  });

  it('switches animation and restarts the timeline', () => {
    const p = player();
    p.advance(300);
    p.setAnimation('running');
    expect(p.animation).toBe('running');
    expect(p.frameIndex).toBe(0);
    expect(p.elapsed).toBe(0);
    expect(p.rect().sy).toBe(7 * 208);
    // same animation is a no-op
    p.advance(120);
    p.setAnimation('running');
    expect(p.frameIndex).toBe(1);
  });

  it('ignores invalid deltas and survives large jumps', () => {
    const p = player();
    expect(p.advance(Number.NaN)).toBe(false);
    expect(p.advance(-10)).toBe(false);
    expect(p.advance(0)).toBe(false);
    expect(p.advance(10_000)).toBe(true);
    expect(p.frameIndex).toBeGreaterThanOrEqual(0);
    expect(p.frameIndex).toBeLessThan(6);
  });
});
