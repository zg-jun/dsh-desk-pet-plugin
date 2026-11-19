// Run clock with the same lifecycle DSH uses for its session footer:
// starts when the run starts, pauses while waiting on the user, freezes when
// the run is done, and resets when the pet leaves an active run.

export type RunPhase = 'idle' | 'running' | 'paused' | 'done';

export interface RunClock {
  readonly phase: RunPhase;
  /** Wall clock the current running segment started at (ms). */
  readonly startedAt: number;
  /** Elapsed time accumulated before the current segment (ms). */
  readonly accumulated: number;
}

export function idleClock(): RunClock {
  return { phase: 'idle', startedAt: 0, accumulated: 0 };
}

/**
 * Advance the clock for a new chat mode (`working` / `waiting` / `done` /
 * anything else = idle).
 */
export function advanceRunClock(clock: RunClock, mode: string, now: number): RunClock {
  if (mode === 'working') {
    if (clock.phase === 'running') return clock;
    // Resume (after waiting) or start a new run (after done/idle).
    const base = clock.phase === 'paused' || clock.phase === 'done' ? clock.accumulated : 0;
    return { phase: 'running', startedAt: now - base, accumulated: base };
  }
  if (mode === 'waiting') {
    if (clock.phase !== 'running') return clock;
    return { phase: 'paused', startedAt: 0, accumulated: now - clock.startedAt };
  }
  if (mode === 'done') {
    if (clock.phase === 'running') {
      return { phase: 'done', startedAt: 0, accumulated: now - clock.startedAt };
    }
    return { ...clock, phase: 'done' };
  }
  return idleClock();
}

/**
 * Sync with an authoritative turn clock (DSH's session footer): the first
 * working state adopts the server-side start, done adopts the server end.
 * Pause/resume still uses the local freeze semantics.
 */
export function syncRunClock(
  clock: RunClock, mode: string, now: number, startedAt = 0, endedAt = 0,
): RunClock {
  const start = Number(startedAt) || 0;
  if (mode === 'working') {
    if (clock.phase === 'running') return clock;
    if (clock.phase === 'paused') return advanceRunClock(clock, 'working', now);
    if (start > 0) return { phase: 'running', startedAt: start, accumulated: 0 };
    return advanceRunClock(clock, 'working', now);
  }
  if (mode === 'done') {
    if (start > 0) {
      const end = Number(endedAt) || now;
      return { phase: 'done', startedAt: 0, accumulated: Math.max(0, end - start) };
    }
    return advanceRunClock(clock, 'done', now);
  }
  return advanceRunClock(clock, mode, now);
}

/** Elapsed milliseconds for display (0 when there is no run to show). */
export function runElapsed(clock: RunClock, now: number): number {
  if (clock.phase === 'running') return Math.max(0, now - clock.startedAt);
  if (clock.phase === 'paused' || clock.phase === 'done') return clock.accumulated;
  return 0;
}
