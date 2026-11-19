import { describe, expect, it } from 'vitest';
import { centerInside, parkOnPrimary } from '../../src/scene/screen/display.cjs';

describe('multi-display geometry', () => {
  const primary = { x: 0, y: 0, width: 1440, height: 900 };
  const secondary = { x: 1440, y: 0, width: 1920, height: 1080 };
  const win = { x: 1500, y: 100, width: 300, height: 175 };

  it('keeps a window whose center is on a display', () => {
    expect(centerInside(win, [{ bounds: primary }, { bounds: secondary }])).toBe(true);
  });

  it('parks on the primary bottom-right when its display disappears', () => {
    expect(centerInside(win, [{ bounds: primary }])).toBe(false);
    expect(parkOnPrimary(win, primary)).toEqual({ x: 1116, y: 701 });
  });
});
