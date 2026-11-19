// SessionSnapshot -> PetViewModel. The only place that decides what the pet
// should show: priority, aggregation, pending normalisation and presentation.
import { dotColorFor } from './tokens';
import type { AnimName, BubbleKind, Mode, PendingKind } from './types';

export interface TodoItem {
  readonly status?: string;
  readonly content?: string;
}

export interface SessionRow {
  readonly id: string;
  readonly blank?: boolean;
  readonly running?: boolean;
  readonly displayTitle?: string;
  readonly origin?: string;
  readonly parentId?: string;
  readonly retainedBy?: { readonly mainView?: number };
  readonly projectionValues?: { readonly todos?: readonly TodoItem[] };
}

export interface QuestionOption {
  readonly label?: string;
  readonly description?: string;
}

export interface Question {
  readonly id?: string;
  readonly question?: string;
  readonly detail?: string;
  readonly header?: string;
  readonly multiSelect?: boolean;
  readonly options?: readonly QuestionOption[];
  readonly intent?: { readonly kind?: string; readonly always?: string };
}

export interface PendingInteraction {
  readonly kind?: string;
  readonly sessionId?: string;
  readonly displayReason?: string;
  readonly reason?: string;
  readonly toolName?: string;
  readonly questions?: readonly Question[];
  readonly always?: string;
  readonly intent?: { readonly kind?: string; readonly always?: string };
}

export interface SessionStatus {
  readonly running?: boolean;
  readonly completionUnread?: boolean;
  readonly pendingInteraction?: PendingInteraction | null;
}

export interface SessionSnapshot {
  readonly rows: readonly SessionRow[];
  statusOf(id: string): SessionStatus | undefined;
}

export interface PendingOption {
  readonly label: string;
  readonly description: string;
  readonly recommended: boolean;
}

export interface PendingModel {
  readonly kind: PendingKind;
  readonly sessionId: string;
  readonly summary: string;
  readonly questionId?: string;
  readonly detail?: string;
  readonly multi?: boolean;
  readonly options?: readonly PendingOption[];
  readonly more?: number;
  /** True when the interaction cannot be represented safely in the bubble. */
  readonly fallback?: boolean;
}

export interface PetViewModel {
  readonly mode: Mode;
  readonly kind: string;
  readonly task: string;
  readonly extra: number;
  readonly sessionId: string;
  readonly pending?: PendingModel | null;
}

export interface Presentation {
  readonly anim: AnimName;
  readonly dot: string | null;
  readonly bubble: BubbleKind | null;
  readonly bob: 'busy' | 'jump' | null;
}

// The merge skills and DSH cards mark the preferred option in either locale:
// "(recommended)", "（推荐）", "(推荐)". Strip every form and render the badge.
const RECOMMENDED = /[(（]recommended[)）]|[(（]推荐[)）]/i;
const RECOMMENDED_STRIP = /\s*(?:[(（]recommended[)）]|[(（]推荐[)）])/gi;

export function truncateTask(text: string): string {
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function taskTextOf(row: SessionRow): string {
  const todos = row.projectionValues?.todos;
  if (Array.isArray(todos)) {
    const current = todos.find((todo) => todo && todo.status === 'in_progress');
    if (current && current.content) return truncateTask(current.content);
  }
  return typeof row.displayTitle === 'string' ? truncateTask(row.displayTitle) : '';
}

export function pendingText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['title', 'summary', 'label', 'text', 'message', 'description', 'reason']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return '';
}

export function describePending(pi: PendingInteraction): PendingModel {
  const kind = pi.kind ? String(pi.kind) : 'other';
  const sessionId = typeof pi.sessionId === 'string' ? pi.sessionId : '';
  if (kind === 'approval') {
    const approvalQuestions: readonly Question[] = Array.isArray(pi.questions) ? pi.questions : [];
    if (pi.always || pi.intent?.always || pi.intent?.kind === 'plan-review' || approvalQuestions.length > 1) {
      return { kind: 'other', sessionId, summary: '', fallback: true };
    }
    const summary = pendingText(pi.displayReason as unknown)
      || pendingText(pi.reason as unknown)
      || (typeof pi.toolName === 'string' ? pi.toolName : '');
    return { kind: 'approval', sessionId, summary };
  }
  if (kind === 'question') {
    const questions: readonly Question[] = Array.isArray(pi.questions) ? pi.questions : [];
    // Batches, plan review, supporting detail and >4 options are not safely
    // representable in the bubble: one unified fallback card is shown instead.
    if (questions.length !== 1) return { kind: 'other', sessionId, summary: '', fallback: true };
    const first = questions[0];
    if (!first) return { kind: 'other', sessionId, summary: '', fallback: true };
    const allOptions: readonly QuestionOption[] = Array.isArray(first.options) ? first.options : [];
    if (first.intent && first.intent.kind === 'plan-review') {
      return { kind: 'other', sessionId, summary: '', fallback: true };
    }
    const options = allOptions.map((option) => {
      const label = String(option?.label || '');
      return {
        label: label.replace(RECOMMENDED_STRIP, ''),
        description: String(option?.description || ''),
        recommended: RECOMMENDED.test(label),
      };
    }).filter((option) => option.label);
    return {
      kind: 'question',
      sessionId,
      questionId: typeof first.id === 'string' ? first.id : '',
      summary: [first.header, first.question].filter(Boolean).map(String).join(' · '),
      ...(first.detail ? { detail: String(first.detail) } : {}),
      multi: Boolean(first.multiSelect),
      options,
    };
  }
  return { kind: 'other', sessionId, summary: '', fallback: true };
}

const isMain = (row: SessionRow): number => ((row.retainedBy?.mainView ?? 0) > 0 ? 1 : 0);
const mainFirst = (a: SessionRow, b: SessionRow): number => isMain(b) - isMain(a);
const jumpIdOf = (row: SessionRow): string =>
  (row.origin === 'subagent' && row.parentId ? row.parentId : row.id) || '';

const IDLE: PetViewModel = { mode: 'idle', task: '', extra: 0, sessionId: '', kind: '' };

interface Buckets {
  readonly waiting: readonly { row: SessionRow; kind: string }[];
  readonly working: readonly SessionRow[];
  readonly done: readonly SessionRow[];
}

/** Classify rows with the sidebar's priority and main-view tie-break. */
function bucket(snapshot: SessionSnapshot, rows: readonly SessionRow[]): Buckets {
  const waiting: { row: SessionRow; kind: string }[] = [];
  const working: SessionRow[] = [];
  const done: SessionRow[] = [];
  for (const row of rows) {
    const status = snapshot.statusOf(row.id);
    if (status?.pendingInteraction) {
      waiting.push({ row, kind: status.pendingInteraction.kind ?? '' });
      continue;
    }
    // The live SessionStatus is the sidebar's source of truth. `row.running`
    // can stay true for a tick after the turn ends; only use it when the
    // status map has no opinion.
    if (status?.running === true || (status?.running === undefined && row.running)) {
      working.push(row);
      continue;
    }
    // Match the sidebar exactly: unread only counts outside the main view.
    if (status?.completionUnread && !isMain(row)) done.push(row);
  }
  waiting.sort((a, b) => mainFirst(a.row, b.row));
  working.sort(mainFirst);
  done.sort(mainFirst);
  return { waiting, working, done };
}

export function deriveViewModel(snapshot: SessionSnapshot): PetViewModel {
  const rows = snapshot.rows.filter((row) => row && !row.blank);
  if (rows.length === 0) return IDLE;
  const { waiting, working, done } = bucket(snapshot, rows);
  if (waiting.length > 0) {
    const first = waiting[0]!;
    const pi = snapshot.statusOf(first.row.id)?.pendingInteraction;
    return {
      mode: 'waiting',
      kind: first.kind,
      task: taskTextOf(first.row),
      extra: waiting.length - 1,
      sessionId: jumpIdOf(first.row),
      pending: pi ? describePending(pi) : null,
    };
  }
  if (working.length > 0) {
    const first = working[0]!;
    return {
      mode: 'working',
      kind: '',
      task: taskTextOf(first),
      extra: working.length - 1,
      sessionId: jumpIdOf(first),
    };
  }
  if (done.length > 0) {
    const first = done[0]!;
    return {
      mode: 'done',
      kind: '',
      task: taskTextOf(first),
      extra: done.length - 1,
      sessionId: jumpIdOf(first),
    };
  }
  return IDLE;
}

/** Presentation is a pure function of mode; colours come from tokens. */
export function presentationFor(mode: Mode): Presentation {
  switch (mode) {
    case 'working':
      return { anim: 'running', dot: dotColorFor(mode), bubble: 'status', bob: 'busy' };
    case 'waiting':
      return { anim: 'jumping', dot: dotColorFor(mode), bubble: 'alert', bob: null };
    case 'done':
      return { anim: 'idle', dot: dotColorFor(mode), bubble: 'status', bob: null };
    case 'idle':
    default:
      return { anim: 'idle', dot: null, bubble: null, bob: null };
  }
}

/** Catalog search: slug/displayName contains query, capped for the result list. */
export function filterPets(
  pets: Array<{ slug?: string; displayName?: string }> | null | undefined,
  query: string,
  limit = 10,
): Array<{ slug?: string; displayName?: string }> {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return (pets || []).filter((pet) => {
    const slug = typeof pet.slug === 'string' ? pet.slug.toLowerCase() : '';
    const name = typeof pet.displayName === 'string' ? pet.displayName.toLowerCase() : '';
    return slug.includes(q) || name.includes(q);
  }).slice(0, limit);
}
