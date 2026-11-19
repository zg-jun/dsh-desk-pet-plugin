// Design tokens: the only place colour literals live. Both scenes read these.
import type { Mode } from './types';

export const DOT_COLORS = {
  working: '#81858c',
  waiting: '#f59e0b',
  done: '#22c55e',
} as const;

export const COLORS = {
  brand: '#4f6ef0',
  brandSoft: 'rgba(79,110,240,0.10)',
  surface: '#ffffff',
  text: '#33333b',
  muted: '#6b7079',
} as const;

export function dotColorFor(mode: Mode): string | null {
  if (mode === 'working') return DOT_COLORS.working;
  if (mode === 'waiting') return DOT_COLORS.waiting;
  if (mode === 'done') return DOT_COLORS.done;
  return null;
}

/** CSS custom properties shared by the float window and the settings sheet. */
export function cssVariables(): Readonly<Record<string, string>> {
  return {
    '--dp-dot-working': DOT_COLORS.working,
    '--dp-dot-waiting': DOT_COLORS.waiting,
    '--dp-dot-done': DOT_COLORS.done,
    '--dp-brand': COLORS.brand,
    '--dp-text': COLORS.text,
    '--dp-muted': COLORS.muted,
  };
}
