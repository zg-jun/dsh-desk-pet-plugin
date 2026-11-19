// Elapsed-time label, mirroring DSH's session footer formatter:
// seconds always, minutes once the total reaches a minute, hours when needed.
export type DurationLang = 'zh' | 'en';

const UNITS: Record<DurationLang, { h: string; m: string; s: string }> = {
  zh: { h: '小时', m: '分', s: '秒' },
  en: { h: 'h', m: 'm', s: 's' },
};

/** @param ms elapsed milliseconds (clamped to at least one second by callers) */
export function formatRunDuration(ms: number, lang: DurationLang = 'zh'): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  const unit = UNITS[lang] || UNITS.zh;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}${unit.h}`);
  if (total >= 60) parts.push(`${minutes}${unit.m}`);
  parts.push(`${seconds}${unit.s}`);
  return parts.join(lang === 'en' ? ' ' : '');
}
