import React from 'react';
import * as core from '../../core/browser';

const { useEffect, useRef } = React;

/** The float window asked to resolve a pending interaction. */
function answerPending(statusRef, event) {
  try {
    const map = statusRef.current;
    const target = map && typeof map.get === 'function' ? map.get(event.sessionId) : null;
    const pi = target && target.pendingInteraction;
    if (!pi || typeof pi.answer !== 'function') return;
    if (event.kind === 'approval' && (event.answer === 'allowed-once' || event.answer === 'rejected')) {
      pi.answer(event.answer);
    } else if (event.kind === 'question' && event.answer && Array.isArray(event.answer.answers)) {
      pi.answer({ answers: event.answer.answers });
    }
  } catch { /* answer failed; user can still act in the session */ }
}

function openSessionFor(event, openSession) {
  if (!event.sessionId || !openSession) return;
  try { openSession(event.sessionId); } catch (error) { console.error('[desk-pet] openSession failed:', error); }
}



/** SSE ui-events with the 350ms polling fallback; acks each event once. */
export function useUiEvents({ statusRef, openPage, checkRuntime, openSession, onPetOn, onQuit, onStatus = null, onRuntimeSnapshot = null }) {
  const lastId = useRef('');
      // Events from the screen pet: SSE first, 350ms polling as fallback.
  const handler = useRef(null);
  handler.current = (event) => {
        if (!event || !event.id || event.id === lastId.current) return;
        lastId.current = event.id;
        if (event.type === 'open-settings') openPage();
        if (event.type === 'open-runtime-card') {
          // 事件可携带最新的运行时快照：弹框直接以 downloading 状态打开，避免先闪一帧 missing。
          if (event.runtime && typeof onRuntimeSnapshot === 'function') onRuntimeSnapshot(event.runtime);
          checkRuntime(false);
        }
        if (event.type === 'pet-answer') answerPending(statusRef, event);
        if (event.type === 'open-session') openSessionFor(event, openSession);
        if (event.type === 'quit-pet') {
          onQuit();
        }
        fetch(`${core.API_BASE}/ui-event`, { method: 'POST', body: JSON.stringify({ ack: event.id }) }).catch(() => {});
      };
  useEffect(() => {
        let es = null;
        let timer = null;
        let lastStatusPoll = 0;
        const poll = async () => {
          try {
            const r = await fetch(`${core.API_BASE}/ui-event`);
            const d = await r.json();
            if (d && d.event) handler.current(d.event);
          } catch { /* host unreachable */ }
          if (Date.now() - lastStatusPoll > 1000) {
            lastStatusPoll = Date.now();
            try {
              const r = await fetch(`${core.API_BASE}/status`);
              const status = await r.json();
              if (status && typeof status.petOn === 'boolean') onPetOn(status.petOn);
              if (status && onStatus) onStatus(status);
            } catch { /* host unreachable */ }
          }
        };
        const startPoll = () => {
          if (timer) return;
          timer = setInterval(poll, 350);
        };
        if (typeof EventSource !== 'undefined') {
          try {
            es = new EventSource(`${core.API_BASE}/stream`);
            es.addEventListener('ui-event', (e) => {
              try { handler.current(JSON.parse(e.data)); } catch { /* bad frame */ }
            });
            es.addEventListener('status', (e) => {
              try {
                const status = JSON.parse(e.data);
                if (status && typeof status.petOn === 'boolean') onPetOn(status.petOn);
                if (status && onStatus) onStatus(status);
              } catch { /* bad frame */ }
            });
            es.onerror = () => {
              try { es.close(); } catch { /* already closed */ }
              es = null;
              startPoll();
            };
          } catch { es = null; }
        }
        if (!es) startPoll();
        return () => { if (es) es.close(); if (timer) clearInterval(timer); };
  }, []);

}

