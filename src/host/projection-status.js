import { pickTask, selectProjectionStatus } from './deskpet-projection.js';

/**
 * Copy the authoritative turn clock from the projection into the live status.
 * Used even after the Client starts driving mode/task (pending is fresher
 * there), so the pet timer always follows the Session log.
 */
export function withProjectionClock(liveStatus, selected) {
  if (!selected) return liveStatus;
  return {
    ...liveStatus,
    turnStartedAt: Number(selected.startedAt) || 0,
    turnEndedAt: Number(selected.endedAt) || 0,
  };
}

/**
 * Merge the selected projection into the Host's live status. Pending keeps
 * mode=waiting; the task label uses the same fallback rules as /pending.
 */
export function applyProjectionStatus({ values, liveStatus, fallbackTask, broadcast }) {
  const selected = selectProjectionStatus(values);
  if (!selected) return liveStatus;
  const next = withProjectionClock({
    ...liveStatus,
    mode: liveStatus.pending ? 'waiting' : selected.mode,
    task: pickTask(selected.task, fallbackTask) || liveStatus.task,
    sessionId: selected.sessionId || liveStatus.sessionId,
  }, selected);
  broadcast(next);
  return next;
}
