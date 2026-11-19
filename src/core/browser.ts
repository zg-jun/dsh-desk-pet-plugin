// Browser entry: bundled into dist/pet-core.js (IIFE, global `PetCore`).
// Only the parts both scenes need; no Node or DOM access.
export {
  ANIMATIONS,
  SHEET_COLUMNS,
  animationSpec,
  createAtlas,
  detectRows,
  frameAt,
  frameCount,
  frameRect,
} from './atlas';
export { PetPlayer } from './player';
export {
  deriveViewModel,
  describePending,
  pendingText,
  presentationFor,
  taskTextOf,
  truncateTask,
  filterPets,
} from './view-model';
export { COLORS, DOT_COLORS, cssVariables, dotColorFor } from './tokens';
export {
  API_BASE,
  MODES,
  RUNTIME_PHASES,
  UI_EVENT_TYPES,
  isRuntimePhase,
  isUiEventType,
} from './protocol';
export { formatRunDuration } from './duration';
export { advanceRunClock, idleClock, runElapsed, syncRunClock } from './run-clock';
export { LruCache } from './image-cache';
export { DEFAULT_BASE, DEFAULT_FIT_LIMITS, MAX_SCALE, MIN_SCALE, clampScale, fitWindow } from './layout';
