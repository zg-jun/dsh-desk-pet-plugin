import { describe, expect, it } from 'vitest';
import { en } from '../../src/scene/web/locale/en';
import { zh } from '../../src/scene/web/locale/zh';

/**
 * The two dictionaries are registered separately (the untyped locale API), so
 * nothing but this test enforces bilingual balance.
 */
describe('desk-pet locale dictionaries', () => {
  it('keeps the en/zh key sets identical', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty values in either language', () => {
    for (const [key, value] of Object.entries({ ...en, ...zh })) {
      expect(String(value).trim(), key).not.toBe('');
    }
  });
});
