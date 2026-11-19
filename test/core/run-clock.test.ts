import { describe, expect, it } from 'vitest';
import { advanceRunClock, idleClock, runElapsed, syncRunClock } from '../../src/core/run-clock';

describe('run clock', () => {
  it('starts at zero when a run begins', () => {
    const c = advanceRunClock(idleClock(), 'working', 1000);
    expect(c.phase).toBe('running');
    expect(runElapsed(c, 5000)).toBe(4000);
  });

  it('pauses while waiting and resumes from the same elapsed', () => {
    const running = advanceRunClock(idleClock(), 'working', 1000);
    const paused = advanceRunClock(running, 'waiting', 6000);
    expect(paused.phase).toBe('paused');
    expect(runElapsed(paused, 99999)).toBe(5000);
    const resumed = advanceRunClock(paused, 'working', 20000);
    expect(resumed.phase).toBe('running');
    expect(runElapsed(resumed, 22000)).toBe(7000);
  });

  it('freezes the final duration when done', () => {
    const running = advanceRunClock(idleClock(), 'working', 1000);
    const done = advanceRunClock(running, 'done', 12000);
    expect(done.phase).toBe('done');
    expect(runElapsed(done, 60000)).toBe(11000);
  });

  it('resets when the pet goes idle', () => {
    const running = advanceRunClock(idleClock(), 'working', 1000);
    const idle = advanceRunClock(running, 'idle', 4000);
    expect(idle.phase).toBe('idle');
    expect(runElapsed(idle, 9000)).toBe(0);
  });

  it('adopts the authoritative turn start from DSH', () => {
    const start = 1_770_000_000_000;
    const c = syncRunClock(idleClock(), 'working', start + 16_000, start, 0);
    expect(c.phase).toBe('running');
    expect(runElapsed(c, start + 16_000)).toBe(16_000);
  });

  it('uses the authoritative start and end for the final duration', () => {
    const start = 1_770_000_000_000;
    const c = syncRunClock(idleClock(), 'done', start + 20_000, start, start + 16_000);
    expect(c.phase).toBe('done');
    expect(runElapsed(c, start + 99_000)).toBe(16_000);
  });

  it('resumes from a pause instead of re-syncing the start', () => {
    const start = 1_770_000_000_000;
    const running = syncRunClock(idleClock(), 'working', start + 5_000, start, 0);
    const paused = advanceRunClock(running, 'waiting', start + 8_000);
    const resumed = syncRunClock(paused, 'working', start + 30_000, start, 0);
    // paused at +8s (8s elapsed), resumed at +30s → +31s shows 8s + 1s
    expect(runElapsed(resumed, start + 31_000)).toBe(9_000);
  });

  it('does not restart while working and already running', () => {
    const running = advanceRunClock(idleClock(), 'working', 1000);
    const again = advanceRunClock(running, 'working', 3000);
    expect(again.startedAt).toBe(1000);
  });
});
