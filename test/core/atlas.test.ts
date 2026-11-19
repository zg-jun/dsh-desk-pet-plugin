import { describe, expect, it } from 'vitest';
import { ANIMATIONS, animationSpec, createAtlas, detectRows, frameCount, frameRect } from '../../src/core/atlas';
import type { AnimName } from '../../src/core/types';

describe('atlas geometry', () => {
  it('detects the real petdex sheet: 1536x1872 -> 8x9, 192x208 cells', () => {
    const atlas = createAtlas(1536, 1872);
    expect(atlas.columns).toBe(8);
    expect(atlas.rows).toBe(9);
    expect(atlas.cellWidth).toBe(192);
    expect(atlas.cellHeight).toBe(208);
    expect(atlas.ratio).toBeCloseTo(208 / 192, 6);
  });

  it('derives rows from the divisor closest to the cell width', () => {
    expect(detectRows(1536, 1536)).toBe(8);
    expect(detectRows(1536, 1728)).toBe(9);
    expect(detectRows(0, 0)).toBe(1);
  });

  it('honours an explicit rows override (pet.json)', () => {
    expect(createAtlas(1536, 1872, { rows: 10 }).rows).toBe(10);
    expect(createAtlas(1536, 1872, { rows: 10 }).cellHeight).toBeCloseTo(187.2);
  });

  it('maps idle frames to the first row', () => {
    const atlas = createAtlas(1536, 1872);
    expect(frameRect(atlas, 'idle', 0)).toEqual({ sx: 0, sy: 0, sw: 192, sh: 208 });
    expect(frameRect(atlas, 'idle', 5)).toEqual({ sx: 960, sy: 0, sw: 192, sh: 208 });
  });

  it('maps the runtime animations to their rows', () => {
    const atlas = createAtlas(1536, 1872);
    expect(frameRect(atlas, 'running-right', 2).sy).toBe(208);
    expect(frameRect(atlas, 'running-left', 2).sy).toBe(416);
    expect(frameRect(atlas, 'waving', 2).sy).toBe(624);
    expect(frameRect(atlas, 'jumping', 2).sy).toBe(832);
    expect(frameRect(atlas, 'waiting', 2).sy).toBe(1248);
    expect(frameRect(atlas, 'running', 2).sy).toBe(1456);
  });

  it('falls back to idle for an unknown animation name', () => {
    const atlas = createAtlas(1536, 1872);
    expect(frameRect(atlas, 'nope' as AnimName, 1)).toEqual(frameRect(atlas, 'idle', 1));
    expect(animationSpec('nope' as AnimName)).toBe(ANIMATIONS.idle);
  });

  it('exposes frame counts and last-frame durations', () => {
    expect(frameCount('idle')).toBe(6);
    expect(frameCount('waving')).toBe(4);
    expect(frameCount('jumping')).toBe(5);
    expect(animationSpec('idle').frames[5]?.durationMs).toBe(320);
    expect(animationSpec('running-right').frames[7]?.durationMs).toBe(220);
    expect(animationSpec('running-right').frames[0]?.durationMs).toBe(120);
  });
});
