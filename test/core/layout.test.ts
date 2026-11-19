import { describe, expect, it } from 'vitest';
import { DEFAULT_BASE, clampScale, fitWindow } from '../../src/core/layout';

const pet = { w: 96, h: 104 };
const approval = { w: 230, h: 89 };
const question = { w: 230, h: 192 };

describe('fitWindow', () => {
  it('keeps the current size at scale 1', () => {
    expect(fitWindow({ pet, bubbles: [] })).toMatchObject({ w: 300, h: 175 });
    expect(fitWindow({ pet, bubbles: [approval] })).toMatchObject({ w: 304, h: 247 });
    expect(fitWindow({ pet, bubbles: [question] })).toMatchObject({ w: 304, h: 350 });
  });

  it('scales the logical box exactly once (fixes the 1.3 clipping)', () => {
    expect(fitWindow({ pet, bubbles: [approval], scale: 1.3 })).toMatchObject({ w: 395, h: 321 });
    expect(fitWindow({ pet, bubbles: [question], scale: 1.3 })).toMatchObject({ w: 395, h: 455 });
    expect(fitWindow({ pet, bubbles: [], scale: 1.3 })).toMatchObject({ w: 390, h: 228 });
  });

  it('fits the scale tier to 0.75–1.3', () => {
    expect(clampScale(0.5)).toBe(0.75);
    expect(clampScale(2)).toBe(1.3);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('honours width growth and limits', () => {
    expect(fitWindow({ pet, bubbles: [{ w: 400, h: 20 }] }).w).toBe(474);
    expect(fitWindow({ pet, bubbles: [{ w: 1000, h: 20 }] }).w).toBe(560);
    expect(fitWindow({ pet, bubbles: [], limits: { minW: 400, maxW: 800, minH: 300, maxH: 900 } })).toMatchObject({ w: 400, h: 300 });
  });

  it('uses the documented base box', () => {
    expect(DEFAULT_BASE).toEqual({ w: 300, h: 175 });
  });
});
