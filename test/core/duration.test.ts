import { describe, expect, it } from 'vitest';
import { formatRunDuration } from '../../src/core/duration';

describe('formatRunDuration', () => {
  it('always shows seconds', () => {
    expect(formatRunDuration(1000)).toBe('1秒');
    expect(formatRunDuration(45_900)).toBe('45秒');
    expect(formatRunDuration(0)).toBe('0秒');
  });

  it('adds minutes at one minute and keeps the remainder', () => {
    expect(formatRunDuration(60_000)).toBe('1分0秒');
    expect(formatRunDuration(65_000)).toBe('1分5秒');
    expect(formatRunDuration(3_599_000)).toBe('59分59秒');
  });

  it('adds hours past one hour', () => {
    expect(formatRunDuration(3_600_000)).toBe('1小时0分0秒');
    expect(formatRunDuration(3_665_000)).toBe('1小时1分5秒');
  });

  it('localizes to English units', () => {
    expect(formatRunDuration(1000, 'en')).toBe('1s');
    expect(formatRunDuration(65_000, 'en')).toBe('1m 5s');
    expect(formatRunDuration(3_665_000, 'en')).toBe('1h 1m 5s');
  });
});
