import { describe, expect, it } from 'vitest';
import { applyProjectionStatus, withProjectionClock } from '../../src/host/projection-status.js';

const running = {
  running: true, mode: 'working', task: '气泡计时', sessionId: 's1',
  startedAt: 1_770_000_000_000, endedAt: 0,
};

describe('projection status merge', () => {
  it('fills mode/task/session and the authoritative turn clock', () => {
    const values = new Map([['s1', running]]);
    const out = applyProjectionStatus({
      values: values.values(), liveStatus: { mode: 'idle', task: '', sessionId: '' },
      fallbackTask: '', broadcast: () => {},
    });
    expect(out).toMatchObject({
      mode: 'working', task: '气泡计时', sessionId: 's1',
      turnStartedAt: 1_770_000_000_000, turnEndedAt: 0,
    });
  });

  it('keeps the clock when the client already owns mode/task', () => {
    const out = withProjectionClock({ mode: 'waiting', task: '客户端任务', turnStartedAt: 0 }, running);
    expect(out).toMatchObject({ mode: 'waiting', task: '客户端任务', turnStartedAt: 1_770_000_000_000 });
  });

  it('leaves the status untouched without a selected projection', () => {
    const live = { mode: 'idle', turnStartedAt: 0 };
    expect(withProjectionClock(live, null)).toBe(live);
  });
});
