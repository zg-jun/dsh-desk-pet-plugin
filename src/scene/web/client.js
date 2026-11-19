import React from 'react';
import * as core from '../../core/browser';
import { en } from './locale/en';
import { RuntimeDialog } from './runtime-dialog';
import { useUiEvents } from './ui-events';
import { usePetLifecycle } from './pet-lifecycle';
import { useStatusReport } from './status-report';
import { zh } from './locale/zh';
import { PetPage } from './pet-page';
import { CSS } from './styles';
import { h, API, LS_ACTIVE, LS_OPACITY, LS_SIZE, shared, useShared, saveJSON, fetchManifest, manifestIsFresh } from './shared';

const { useEffect, useRef, useState } = React;

    function StatusBridge({ useSessionStatus, useSessions, onStatus }) {
      const statusMap = useSessionStatus ? useSessionStatus((s) => s) : null;
      const sessionsList = useSessions ? useSessions((s) => s) : null;
      const status = React.useMemo(() => {
        const rows = sessionsList && sessionsList.byId ? Object.values(sessionsList.byId) : [];
        return core.deriveViewModel({
          rows,
          statusOf: (id) => (statusMap && typeof statusMap.get === 'function' ? statusMap.get(id) : undefined),
        });
      }, [statusMap, sessionsList]);
      useEffect(() => onStatus(status), [status, onStatus]);
      return null;
    }

    /** Keeps one failing decoration from taking the whole overlay entry down. */
    class ErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false }; }
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error) {
        console.error('[desk-pet] crashed:', error);
        try {
          fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: `err:render:${String((error && error.message) || error).slice(0, 200)}` }) }).catch(() => {});
        } catch { /* ignore */ }
      }
      render() { return this.state.failed ? null : this.props.children; }
    }

    /** Focus/Escape/Tab trap for the runtime dialog; restores focus on close. */
    function DeskPet(props) {
      const { t, subscribeLocale, getLocaleSnapshot, useSessionStatus, useSessions, openSession, openPage } = props;
      const [status, setStatus] = useState({ mode: 'idle', task: '', extra: 0, sessionId: '', kind: '' });
      const sharedState = useShared();
      const installed = sharedState.installed;
      const activeSlug = sharedState.activeSlug;
      const [runtime, setRuntime] = useState(null);
      const [cardOpen, setCardOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const [claimError, setClaimError] = useState('');
      const statusRef2 = useRef(null);
      // keep the live status map so pet-answer events can resolve instances
      const statusMapLive = useSessionStatus ? useSessionStatus((s2) => s2) : null;
      useEffect(() => { statusRef2.current = statusMapLive; }, [statusMapLive]);

      React.useSyncExternalStore(subscribeLocale, getLocaleSnapshot);


      const refreshInstalled = async () => {
        try {
          const res = await fetch(`${API}installed`);
          const data = await res.json();
          if (data && data.ok === true && Array.isArray(data.pets)) shared.set({ installed: data.pets });
        } catch { /* host route unavailable; keep current list */ }
      };
      useEffect(() => { refreshInstalled(); }, []);
      // Warm the petdex catalog while the app is idle so the first modal open
      // is already cached.
      useEffect(() => {
        const id = setTimeout(() => { if (!manifestIsFresh()) fetchManifest().catch(() => {}); }, 600);
        return () => clearTimeout(id);
      }, []);

      // Host status is authoritative for petOn; the client only mirrors it.
      const applyPetOn = (on) => {
        if (on === shared.get().petOn) return;
        shared.set({ petOn: on });
        if (on) { checkRuntime(true); return; }
        setCardOpen(false);
        setClaimError('');
        fetch(`${API}float-close`, { method: 'POST' }).catch(() => {});
      };

      useStatusReport({ status, onPetOn: applyPetOn });

      const { checkRuntime, startInstall, cancelDownload, dismissCard } = usePetLifecycle({
        runtime, setRuntime, setBusy, setClaimError, cardOpen, setCardOpen,
      });

      useUiEvents({
        statusRef: statusRef2,
        openPage,
        checkRuntime,
        onRuntimeSnapshot: setRuntime,
        openSession,
        onPetOn: applyPetOn,
        onStatus: (next) => {
          if (!next) return;
          if (typeof next.slug === 'string') {
            if (next.slug && next.slug !== shared.get().activeSlug) {
              shared.set({ activeSlug: next.slug });
              saveJSON(LS_ACTIVE, next.slug);
            } else if (!next.slug && shared.get().activeSlug) {
              // Legacy localStorage selection with an empty Host: migrate once.
              fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ slug: shared.get().activeSlug }) }).catch(() => {});
            }
          }
          if (Number.isFinite(Number(next.opacity))) {
            const o = Math.min(1, Math.max(0.3, Number(next.opacity)));
            if (o !== shared.get().opacity) { shared.set({ opacity: o }); saveJSON(LS_OPACITY, o); }
          }
          if (Number.isFinite(Number(next.size))) {
            const z = Math.min(1.3, Math.max(0.75, Number(next.size)));
            if (z !== shared.get().size) { shared.set({ size: z }); saveJSON(LS_SIZE, z); }
          }
        },
        onQuit: () => {
          shared.set({ petOn: false });
          try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: false }) }).catch(() => {}); } catch { /* ignore */ }
          setCardOpen(false);
          setClaimError('');
          fetch(`${API}float-close`, { method: 'POST' }).catch(() => {});
        },
      });

      const onRemove = async (slug) => {
        try {
          await fetch(`${API}remove`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug }),
          });
        } catch { /* keep list as-is */ }
        if (activeSlug === slug) persistActive('');
        await refreshInstalled();
      };


      const runtimeCard = h(RuntimeDialog, {
        t, runtime, busy, claimError, cardOpen, floatOk: false,
        onInstall: startInstall, onCancel: cancelDownload, onDismiss: dismissCard,
        onRetry: () => {
          setCardOpen(false);
          try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: true }) }).catch(() => {}); } catch { /* ignore */ }
        },
      });

      return h(React.Fragment, null,
        h('style', null, CSS),
        h(ErrorBoundary, null, h(StatusBridge, { useSessionStatus, useSessions, onStatus: setStatus })),
        runtimeCard);
    }

/** Sidebar icon for the settings page. */
function PetSidebarIcon({ size, active }) {
  return h('span', {
    style: { fontSize: Math.round((size || 18) * 0.68), lineHeight: 1, opacity: active ? 1 : 0.72 },
    'aria-hidden': true,
  }, '🐾');
}

const reportError = (where, error) => {
  try {
    fetch(`${API}ui-event`, {
      method: 'POST',
      body: JSON.stringify({ type: `err:${where}:${String((error && error.message) || error).slice(0, 300)}` }),
    }).catch(() => {});
  } catch { /* ignore */ }
};

/** One effect per slot: a failed injection must not take the others down. */
function registerSlots(ctx, t, entries) {
  const register = (slot, options, Component, where) => ctx.effect(() => {
    try {
      return ctx.slots.inject(slot, () => ctx.slots.register(options, Component));
    } catch (error) {
      reportError(where, error);
      return undefined;
    }
  });
  register('sidebar.panellist', {
    name: 'sidebar.panellist', id: 'desk-pet', order: 20, label: () => t('menuPet'),
  }, entries.sidebar, 'sidebar');
  register('main', { name: 'main', key: 'desk-pet' }, entries.page, 'main');
  register('shell.overlay', {
    name: 'shell.overlay', id: 'desk-pet', order: 0, label: () => t('ariaLabel'),
  }, entries.overlay, 'overlay');
}

const inject = ['slots', 'locale', 'uiWorkspace', 'layout'];
function apply(ctx) {
        // During HMR the previous generation's disposers may run after the new
        // apply: a duplicate (ns, locale) registration throws. Tolerate it —
        // the surviving dictionary has the same keys.
        let disposeEn = () => {};
        let disposeZh = () => {};
        try {
          disposeEn = ctx.locale.register('desk-pet', 'en', en);
        } catch { /* duplicate registration during HMR */ }
        try {
          disposeZh = ctx.locale.register('desk-pet', 'zh', zh);
        } catch { /* duplicate registration during HMR */ }
        ctx.effect(() => () => { disposeEn(); disposeZh(); });

        const t = ctx.locale.bind('desk-pet');
        const subscribeLocale = (cb) => ctx.locale.subscribe(cb);
        const getLocaleSnapshot = () => ctx.locale.getSnapshot();
        const openSession = (id) => ctx.uiWorkspace.openSession(id);

        const openPage = () => { try { ctx.layout.selectPanel('desk-pet'); } catch { /* ignore */ } };

        function DeskPetEntry(props) {
          return h(ErrorBoundary, null,
            h(DeskPet, { ...props, t, subscribeLocale, getLocaleSnapshot, openSession, openPage }));
        }

        function PetPageEntry() {
          return h(PetPage, { t });
        }

        registerSlots(ctx, t, {
          sidebar: PetSidebarIcon,
          page: PetPageEntry,
          overlay: DeskPetEntry,
        });
}

export const plugin = { inject, apply };
