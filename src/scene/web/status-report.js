import React from 'react';
import * as core from '../../core/browser';

const { useEffect } = React;

/**
 * Push pending approvals/questions to the Host. mode/task come from the Host's
 * session projection; this hook only carries the interaction the Host cannot
 * derive from the log. No periodic heartbeat.
 */
export function useStatusReport({ status, onPetOn }) {
  const pendingKey = status.pending ? JSON.stringify(status.pending) : '';
  const postPending = () => {
    fetch(`${core.API_BASE}/pending`, {
      method: 'POST',
      body: JSON.stringify({
        pending: status.pending || null,
        sessionId: status.sessionId,
        kind: status.kind,
        // Degraded fallback only; the Host ignores these when a projection is available.
        mode: status.mode,
        task: status.task,
      }),
    }).then((r) => r.json()).then((d) => {
      if (d && typeof d.petOn === 'boolean') onPetOn(d.petOn);
    }).catch(() => {});
  };

  useEffect(() => {
    postPending();
  }, [pendingKey, status.sessionId, status.kind, status.mode, status.task]);

  return { postPending };
}
