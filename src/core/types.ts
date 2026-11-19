// Shared vocabulary for the three ends. One name per concept; see docs/glossary.md.

/** Session semantics: what the sidebar would say this session is doing. */
export type Mode = 'idle' | 'working' | 'waiting' | 'done';

/** Sprite animation: which row of the sheet is playing. */
export type AnimName =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'waiting'
  | 'running';

/** Speech bubble chrome: how the message is presented. */
export type BubbleKind = 'status' | 'alert' | 'greet' | 'act';

/** What kind of interaction is pending, after normalisation. */
export type PendingKind = 'approval' | 'question' | 'other';

export interface FrameSpec {
  readonly col: number;
  readonly durationMs: number;
}

export interface FrameRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

export interface AtlasMeta {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly ratio: number;
}

export interface Box {
  readonly w: number;
  readonly h: number;
}

export interface ScaleTier {
  readonly key: 'small' | 'medium' | 'large';
  readonly value: number;
}
