import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  isHostGone,
  createHostWatchdog,
}: {
  isHostGone: (hostPid: number, currentPpid: number, probe: (pid: number) => boolean) => boolean;
  createHostWatchdog: (options: Record<string, unknown>) => () => void;
} = require('../../src/scene/screen/host-watchdog.cjs');

afterEach(() => vi.useRealTimers());

describe('host-watchdog', () => {
  it('detects a changed ppid or a dead host pid', () => {
    expect(isHostGone(100, 100, () => true)).toBe(false);
    expect(isHostGone(100, 101, () => true)).toBe(true);
    expect(isHostGone(100, 100, () => false)).toBe(true);
    expect(isHostGone(0, 0, () => false)).toBe(false);
  });

  it('quits once the host is gone and stops cleanly', () => {
    vi.useFakeTimers();
    const quit = vi.fn();
    const stop = createHostWatchdog({
      hostPid: 100,
      quit,
      intervalMs: 500,
      currentPpid: () => 100,
      probe: () => false,
    });
    vi.advanceTimersByTime(1200);
    expect(quit).toHaveBeenCalled();
    stop();
    const calls = quit.mock.calls.length;
    vi.advanceTimersByTime(1200);
    expect(quit.mock.calls.length).toBe(calls);
  });

  it('does nothing while the host is alive', () => {
    vi.useFakeTimers();
    const quit = vi.fn();
    const stop = createHostWatchdog({
      hostPid: 100,
      quit,
      intervalMs: 500,
      currentPpid: () => 100,
      probe: () => true,
    });
    vi.advanceTimersByTime(2000);
    expect(quit).not.toHaveBeenCalled();
    stop();
  });
});
