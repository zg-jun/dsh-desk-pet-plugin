import { describe, expect, it } from 'vitest';
import { normalizePending, normalizeStatus } from '../../src/host/status.js';

describe('normalizeStatus', () => {
  it('rejects an unknown mode and keeps the previous one', () => {
    expect(normalizeStatus({ mode: 'bogus' }, { mode: 'working' }).mode).toBe('working');
    expect(normalizeStatus({ mode: 'bogus' }).mode).toBe('idle');
    expect(normalizeStatus({ mode: 'waiting' }).mode).toBe('waiting');
  });

  it('caps text fields and clamps opacity/size', () => {
    const status = normalizeStatus({
      task: 'x'.repeat(800),
      slug: 's'.repeat(120),
      opacity: 0.1,
      size: 9,
    });
    expect(status.task.length).toBe(500);
    expect(status.slug.length).toBe(80);
    expect(status.opacity).toBe(0.3);
    expect(status.size).toBe(1.3);
  });

  it('never lets a status post flip petOn on', () => {
    expect(normalizeStatus({}, { petOn: false }).petOn).toBe(false);
    expect(normalizeStatus({}, { petOn: true }).petOn).toBe(true);
  });

  it('extracts a readable object summary', () => {
    const pending = normalizePending({ kind: 'approval', summary: { title: 'Use Bash' } }) as any;
    expect(pending.summary).toBe('Use Bash');
  });

  it('sanitizes pending and caps options', () => {
    const pending = normalizePending({
      kind: 'question',
      sessionId: 's1',
      summary: 'pick',
      multi: true,
      questionId: 'q1',
      options: Array.from({ length: 10 }, (_, i) => ({ label: `o${i}`, description: 'd', recommended: i === 0 })),
    }) as any;
    expect(pending.kind).toBe('question');
    expect(pending.options).toHaveLength(8);
    expect(pending.options[0].recommended).toBe(true);
    expect(normalizePending({ kind: 'nope' })).toBeNull();
    expect((normalizePending({ kind: 'approval', summary: 'x'.repeat(800) }) as any).summary.length).toBe(500);
  });
});
