import { describe, expect, it } from 'vitest';
import { apply, init, pickTask, selectProjectionStatus, view } from '../../src/host/deskpet-projection.js';

const ev = (type: string, data: any = {}, time = 1) => ({ type, data, time, seq: 1 });

describe('deskPet projection fold', () => {
  it('starts idle and moves to working on turn/start', () => {
    const s0 = init({ id: 's1' }, 0);
    expect(view(s0)).toMatchObject({ running: false, mode: 'idle', sessionId: 's1' });
    const s1 = apply(s0, ev('turn/start', { turn: 1 }));
    expect(view(s1)).toMatchObject({ running: true, mode: 'working' });
  });

  it('takes the latest user text as the task', () => {
    const s0 = init({ id: 's1' }, 0);
    const s1 = apply(s0, ev('user/message', {
      content: [{ type: 'text', text: '重构方案' }, { type: 'image', data: 'x' }],
    }));
    expect(s1.task).toBe('重构方案');
    const titled = init({ id: 's1', title: '会话标题' }, 0);
    expect(titled.task).toBe('会话标题');
    const kept = apply(titled, ev('user/message', { content: [{ type: 'text', text: '新消息' }] }));
    expect(kept.task).toBe('会话标题');
  });

  it('completes to done or idle from turn/end', () => {
    const s0 = init({ id: 's1' }, 0);
    const done = apply(s0, ev('turn/end', { reason: { kind: 'completed' } }));
    expect(view(done)).toMatchObject({ running: false, mode: 'done' });
    const aborted = apply(s0, ev('turn/end', { reason: { kind: 'aborted' } }));
    expect(view(aborted)).toMatchObject({ running: false, mode: 'idle' });
  });

  it('ignores unrelated events', () => {
    const s0 = init({ id: 's1' }, 0);
    expect(apply(s0, ev('tool/call', { name: 'Read' }))).toBe(s0);
    expect(apply(s0, null)).toBe(s0);
  });
});

describe('turn clock', () => {
  it('records the turn start and end timestamps', () => {
    const s0 = init({ id: 's1' }, 0);
    const started = apply(s0, ev('turn/start', { turn: 1 }, 1770000000000));
    expect(view(started).startedAt).toBe(1770000000000);
    expect(view(started).endedAt).toBe(0);

    const messaged = apply(started, ev('user/message', { content: [{ type: 'text', text: 'x' }] }, 1770000005000));
    expect(messaged.startedAt).toBe(1770000000000);

    const done = apply(messaged, ev('turn/end', { reason: { kind: 'completed' } }, 1770000016000));
    expect(view(done)).toMatchObject({ mode: 'done', startedAt: 1770000000000, endedAt: 1770000016000 });
  });

  it('normalizes second-based timestamps to milliseconds', () => {
    const s0 = init({ id: 's1' }, 0);
    const started = apply(s0, ev('turn/start', {}, 1770000000));
    expect(view(started).startedAt).toBe(1770000000000);
  });
});

describe('selectProjectionStatus', () => {
  it('prefers running, then the latest finished session', () => {
    const running = { ...init({ id: 'run' }, 0), running: true, mode: 'working', task: 'run', updatedAt: 10 };
    const done = { ...init({ id: 'done' }, 0), running: false, mode: 'done', task: 'done', updatedAt: 20 };
    expect(selectProjectionStatus([done, running])).toMatchObject({ mode: 'working', task: 'run', sessionId: 'run' });
    expect(selectProjectionStatus([done])).toMatchObject({ mode: 'done', task: 'done', sessionId: 'done' });
    expect(selectProjectionStatus([])).toBeNull();
  });
});

describe('pickTask', () => {
  it('prefers a normal title, falls back for goal/context dumps', () => {
    expect(pickTask('会话标题', 'fallback')).toBe('会话标题');
    expect(pickTask('<goal_round> long prompt', '短任务')).toBe('短任务');
    expect(pickTask('Current runtime context. x', '短任务')).toBe('短任务');
    expect(pickTask('', '短任务')).toBe('短任务');
    expect(pickTask('x'.repeat(200), '短任务')).toBe('短任务');
  });
});
