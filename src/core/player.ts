// Animation state machine + timeline. Pure logic: feed it elapsed milliseconds,
// ask it for the current frame rectangle. No canvas, no timers.
import { ANIMATIONS, animationSpec, createAtlas, frameRect } from './atlas';
import type { AnimName, AtlasMeta, FrameRect, FrameSpec } from './types';

export class PetPlayer {
  private readonly meta: AtlasMeta;
  private anim: AnimName = 'idle';
  private index = 0;
  private elapsedMs = 0;

  constructor(meta: AtlasMeta) {
    this.meta = meta;
  }

  static fromSize(width: number, height: number): PetPlayer {
    return new PetPlayer(createAtlas(width, height));
  }

  get atlas(): AtlasMeta {
    return this.meta;
  }

  get animation(): AnimName {
    return this.anim;
  }

  get frameIndex(): number {
    return this.index;
  }

  get elapsed(): number {
    return this.elapsedMs;
  }

  /** Switching animation restarts the timeline; re-selecting the same one is a no-op. */
  setAnimation(name: AnimName): void {
    const next: AnimName = name in ANIMATIONS ? name : 'idle';
    if (next === this.anim) return;
    this.anim = next;
    this.index = 0;
    this.elapsedMs = 0;
  }

  reset(): void {
    this.index = 0;
    this.elapsedMs = 0;
  }

  /** Advance the clock; returns true when the visible frame changed. */
  advance(dtMs: number): boolean {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return false;
    const frames = animationSpec(this.anim).frames;
    this.elapsedMs += dtMs;
    let changed = false;
    let guard = 0;
    while (this.elapsedMs >= frameAt(this.anim, this.index).durationMs && guard < 10_000) {
      this.elapsedMs -= frameAt(this.anim, this.index).durationMs;
      this.index = (this.index + 1) % frames.length;
      changed = true;
      guard += 1;
    }
    return changed;
  }

  currentFrame(): FrameSpec {
    return frameAt(this.anim, this.index);
  }

  rect(): FrameRect {
    return frameRect(this.meta, this.anim, this.index);
  }
}

function frameAt(anim: AnimName, index: number): FrameSpec {
  const frames = animationSpec(anim).frames;
  return frames[index] ?? frames[0]!;
}
