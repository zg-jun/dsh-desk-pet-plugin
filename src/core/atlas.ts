// Sprite-sheet geometry: the single source for columns, rows, cell size and
// per-animation frame timings. Renderers only ask for rectangles.
import type { AnimName, AtlasMeta, FrameRect, FrameSpec } from './types';

export const SHEET_COLUMNS = 8;

export interface AnimationSpec {
  readonly row: number;
  readonly frames: readonly FrameSpec[];
}

const frame = (col: number, durationMs: number): FrameSpec => ({ col, durationMs });

/** n frames; every frame uses `durationMs` except the last, which uses `lastMs`. */
function uniform(n: number, durationMs: number, lastMs: number): readonly FrameSpec[] {
  return Array.from({ length: n }, (_, i) => frame(i, i === n - 1 ? lastMs : durationMs));
}

/**
 * Row layout of a petdex sheet (8 columns). Rows 5 and 8 are unused by the
 * product but reserved by the format.
 */
export const ANIMATIONS: Readonly<Record<AnimName, AnimationSpec>> = {
  idle: { row: 0, frames: [frame(0, 280), frame(1, 110), frame(2, 110), frame(3, 140), frame(4, 140), frame(5, 320)] },
  'running-right': { row: 1, frames: uniform(8, 120, 220) },
  'running-left': { row: 2, frames: uniform(8, 120, 220) },
  waving: { row: 3, frames: uniform(4, 140, 280) },
  jumping: { row: 4, frames: uniform(5, 140, 280) },
  waiting: { row: 6, frames: uniform(6, 150, 260) },
  running: { row: 7, frames: uniform(6, 120, 220) },
};

/** Rows are the divisor of the sheet height whose cell is closest to the cell width. */
export function detectRows(width: number, height: number, columns = SHEET_COLUMNS): number {
  if (!(width > 0) || !(height > 0) || columns < 1) return 1;
  const cellWidth = width / columns;
  let bestRows = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let rows = 1; rows <= 16; rows += 1) {
    if (height % rows !== 0) continue;
    const diff = Math.abs(height / rows - cellWidth);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestRows = rows;
    }
  }
  return bestRows;
}

export interface AtlasOptions {
  readonly columns?: number;
  /** Explicit override (e.g. from pet.json) beats detection. */
  readonly rows?: number;
}

export function createAtlas(width: number, height: number, options: AtlasOptions = {}): AtlasMeta {
  const columns = options.columns ?? SHEET_COLUMNS;
  const rows = options.rows ?? detectRows(width, height, columns);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  return {
    width,
    height,
    columns,
    rows,
    cellWidth,
    cellHeight,
    ratio: cellWidth === 0 ? 0 : cellHeight / cellWidth,
  };
}

export function animationSpec(name: AnimName): AnimationSpec {
  return ANIMATIONS[name] ?? ANIMATIONS.idle;
}

export function frameCount(name: AnimName): number {
  return animationSpec(name).frames.length;
}

export function frameAt(name: AnimName, index: number): FrameSpec {
  const frames = animationSpec(name).frames;
  return frames[index] ?? frames[0]!;
}

export function frameRect(meta: AtlasMeta, name: AnimName, index: number): FrameRect {
  const spec = animationSpec(name);
  const current = frameAt(name, index);
  return {
    sx: current.col * meta.cellWidth,
    sy: spec.row * meta.cellHeight,
    sw: meta.cellWidth,
    sh: meta.cellHeight,
  };
}
