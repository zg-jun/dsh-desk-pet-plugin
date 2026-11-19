import { describe, expect, it } from 'vitest';
import casesJson from '../fixtures/sessions/cases.json';
import expectedJson from '../fixtures/sessions/expected.json';
import {
  deriveViewModel,
  describePending,
  presentationFor,
  truncateTask,
} from '../../src/core/view-model';
import type {
  PendingInteraction,
  SessionRow,
  SessionSnapshot,
  SessionStatus,
} from '../../src/core/view-model';

interface CaseData {
  statuses?: Record<string, SessionStatus>;
  rows?: SessionRow[];
}

const fixtures = casesJson as { cases: Record<string, CaseData> };
const expected = expectedJson as { cases: Record<string, unknown> };

/** Rebuild the source from declarative fixtures, applying the legacy defaults. */
function sourceOf({ statuses = {}, rows = [] }: CaseData): SessionSnapshot {
  const list: SessionRow[] = rows.map((row) => ({
    blank: false,
    running: false,
    retainedBy: { mainView: 0 },
    displayTitle: `title-${row.id}`,
    projectionValues: { todos: [] },
    ...row,
  }));
  return { rows: list, statusOf: (id) => statuses[id] };
}

describe('deriveViewModel parity with v1.4.4 golden', () => {
  for (const [name, data] of Object.entries(fixtures.cases)) {
    it(name, () => {
      expect(deriveViewModel(sourceOf(data))).toEqual(expected.cases[name]);
    });
  }
});

describe('helpers', () => {
  it('truncates at 40 chars with an ellipsis', () => {
    expect(truncateTask('A'.repeat(40))).toBe('A'.repeat(40));
    expect(truncateTask('A'.repeat(41))).toBe(`${'A'.repeat(39)}…`);
  });

  it('extracts a readable approval summary from object reasons', () => {
    const pi = { kind: 'approval', sessionId: 's', displayReason: { title: 'Approve Bash' } } as unknown as PendingInteraction;
    expect(describePending(pi)).toMatchObject({ kind: 'approval', sessionId: 's', summary: 'Approve Bash' });
  });

  it('normalises approval summaries from reason/tool fallbacks', () => {
    const pi: PendingInteraction = { kind: 'approval', sessionId: 's', toolName: 'Bash' };
    expect(describePending(pi)).toEqual({ kind: 'approval', sessionId: 's', summary: 'Bash' });
  });

  it('prefers the sidebar running flag over a stale row.running', () => {
    const snapshot: SessionSnapshot = {
      rows: [{ id: 's', running: true, displayTitle: 'Finished task', retainedBy: { mainView: 0 } }],
      statusOf: (id) => (id === 's' ? { running: false, completionUnread: true } : undefined),
    };
    expect(deriveViewModel(snapshot)).toMatchObject({ mode: 'done', task: 'Finished task' });
  });

  it('falls back for plan-review and supporting question detail', () => {
    const plan: PendingInteraction = {
      kind: 'question', sessionId: 's',
      questions: [{ id: 'a', question: 'Review', intent: { kind: 'plan-review' } }],
    };
    expect(describePending(plan)).toEqual({ kind: 'other', sessionId: 's', summary: '', fallback: true });
    const detail: PendingInteraction = {
      kind: 'question', sessionId: 's',
      questions: [{ id: 'a', header: 'DB', question: 'Q', detail: 'long detail' }],
    };
    expect(describePending(detail)).toMatchObject({ kind: 'question', summary: 'DB · Q', detail: 'long detail' });
  });

  it('strips recommended markers in both locales into the badge flag', () => {
    const pi: PendingInteraction = {
      kind: 'question', sessionId: 's',
      questions: [{
        id: 'q', question: '合并范围',
        options: [
          { label: '今天 + 仅我的（4 个）（推荐）' },
          { label: 'Postgres (recommended)' },
          { label: '自 11-11 + 仅我的（17 个）' },
        ],
      }],
    };
    const model = describePending(pi);
    expect(model.options).toEqual([
      { label: '今天 + 仅我的（4 个）', description: '', recommended: true },
      { label: 'Postgres', description: '', recommended: true },
      { label: '自 11-11 + 仅我的（17 个）', description: '', recommended: false },
    ]);
  });

  it('falls back for approval extras and unknown pending', () => {
    expect(describePending({ kind: 'approval', sessionId: 's', always: 'always' }))
      .toEqual({ kind: 'other', sessionId: 's', summary: '', fallback: true });
    expect(describePending({ kind: 'other', sessionId: 's' }))
      .toEqual({ kind: 'other', sessionId: 's', summary: '', fallback: true });
  });

  it('degrades batched questions to other', () => {
    const pi: PendingInteraction = {
      kind: 'question',
      sessionId: 's',
      questions: [{ id: 'a' }, { id: 'b' }],
    };
    expect(describePending(pi)).toEqual({ kind: 'other', sessionId: 's', summary: '', fallback: true });
  });
});

describe('presentation mapping', () => {
  it('maps modes to animation, dot and bubble', () => {
    expect(presentationFor('working')).toEqual({ anim: 'running', dot: '#81858c', bubble: 'status', bob: 'busy' });
    expect(presentationFor('waiting')).toEqual({ anim: 'jumping', dot: '#f59e0b', bubble: 'alert', bob: null });
    expect(presentationFor('done')).toEqual({ anim: 'idle', dot: '#22c55e', bubble: 'status', bob: null });
    expect(presentationFor('idle')).toEqual({ anim: 'idle', dot: null, bubble: null, bob: null });
  });
});
