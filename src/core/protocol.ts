// Wire vocabulary shared by host, client and float. Type guards keep unknown
// network payloads from leaking into the domain.
import type { Mode } from './types';

export const API_BASE = '/api/desk-pet';

export const MODES = ['idle', 'working', 'waiting', 'done'] as const satisfies readonly Mode[];

export const RUNTIME_PHASES = [
  'unknown',
  'checking',
  'missing',
  'outdated',
  'ready',
  'downloading',
  'extracting',
  'failed',
] as const;
export type RuntimePhase = (typeof RUNTIME_PHASES)[number];

/** Events the float window sends to the in-app client. */
export const UI_EVENT_TYPES = [
  'open-settings',
  'open-session',
  'open-runtime-card',
  'pet-answer',
  'quit-pet',
] as const;
export type UiEventType = (typeof UI_EVENT_TYPES)[number];

export function isRuntimePhase(value: unknown): value is RuntimePhase {
  return typeof value === 'string' && (RUNTIME_PHASES as readonly string[]).includes(value);
}

export function isUiEventType(value: unknown): value is UiEventType {
  return typeof value === 'string' && (UI_EVENT_TYPES as readonly string[]).includes(value);
}
