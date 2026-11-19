// Window sizing: one place that turns logical pet/bubble boxes into window
// bounds. Scaling is applied once, here, so measurements and visuals agree.
import type { Box } from './types';

export interface FitLimits {
  readonly minW: number;
  readonly maxW: number;
  readonly minH: number;
  readonly maxH: number;
}

export const DEFAULT_FIT_LIMITS: FitLimits = { minW: 220, maxW: 560, minH: 160, maxH: 720 };
export const DEFAULT_BASE: Box = { w: 300, h: 175 };
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 1.3;
/** Room for the largest colored state glow (blur + ring). */
export const SHADOW_PAD = 28;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function clampScale(scale: number): number {
  return clamp(Number.isFinite(scale) ? scale : 1, MIN_SCALE, MAX_SCALE);
}

export interface FitInput {
  readonly pet: Box;
  readonly bubbles: readonly Box[];
  readonly base?: Box;
  readonly scale?: number;
  readonly limits?: FitLimits;
}

export interface FitResult {
  readonly w: number;
  readonly h: number;
  readonly logicalW: number;
  readonly logicalH: number;
  readonly scale: number;
}

/**
 * Logical bounds are the pet plus the visible bubbles; the window is that
 * box times the scale. Bubbles are laid out above the pet, hence +26.
 */
export function fitWindow(input: FitInput): FitResult {
  const base = input.base ?? DEFAULT_BASE;
  const limits = input.limits ?? DEFAULT_FIT_LIMITS;
  const scale = clampScale(input.scale ?? 1);
  const bubbleW = input.bubbles.reduce((max, box) => Math.max(max, box.w), 0);
  const bubbleH = input.bubbles.reduce((sum, box) => sum + box.h, 0);
  const logicalW = Math.max(base.w, bubbleW + 18 + SHADOW_PAD * 2);
  const logicalH = Math.max(base.h, input.pet.h + bubbleH + 26 + SHADOW_PAD);
  return {
    w: clamp(Math.round(logicalW * scale), limits.minW, limits.maxW),
    h: clamp(Math.round(logicalH * scale), limits.minH, limits.maxH),
    logicalW,
    logicalH,
    scale,
  };
}
