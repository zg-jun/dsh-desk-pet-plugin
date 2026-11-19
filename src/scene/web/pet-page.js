import React from 'react';
import * as core from '../../core/browser';
import { CSS } from './styles';
import {
  h, API, LS_ACTIVE, LS_OPACITY, LS_SIZE, clampOpacity, clampSize, thumbUrl,
  shared, useShared, saveJSON, fetchManifest, manifestIsFresh, manifestCache,
} from './shared';
import { AddPetDrawer, RuntimeInfoCard, SettingsCard, Stage } from './pet-page-cards';

const { useEffect, useRef, useState } = React;

const PETDEX_URL = 'https://petdex.dev';

function usePetPageModel(t) {
  const state = useShared();
  const { installed, activeSlug, opacity, size } = state;
  const [query, setQuery] = useState('');
  const [manifest, setManifest] = useState(() => (Array.isArray(manifestCache) ? manifestCache : null));
  const [error, setError] = useState('');
  const [busySlug, setBusySlug] = useState('');
  const [previewSlug, setPreviewSlug] = useState('');
  const [stageAnim, setStageAnim] = useState('idle');
  const [previewAnim, setPreviewAnim] = useState('idle');
  const [runtime, setRuntime] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [runtimePrompt, setRuntimePrompt] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const lastToggle = useRef(0);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}installed`).then((r) => r.json()).then((d) => {
      if (!cancelled && d && d.ok === true && Array.isArray(d.pets)) shared.set({ installed: d.pets });
    }).catch(() => {});
    // The page must also work when the overlay is not mounted: hydrate the
    // Host's persisted appearance instead of relying on the SSE status.
    fetch(`${API}status`).then((r) => r.json()).then((d) => {
      if (cancelled || !d || d.ok !== true) return;
      if (typeof d.petOn === 'boolean') shared.set({ petOn: d.petOn });
      if (typeof d.slug === 'string' && d.slug) {
        shared.set({ activeSlug: d.slug });
        saveJSON(LS_ACTIVE, d.slug);
      }
      if (Number.isFinite(Number(d.opacity))) shared.set({ opacity: clampOpacity(Number(d.opacity)) });
      if (Number.isFinite(Number(d.size))) shared.set({ size: clampSize(Number(d.size)) });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      fetch(`${API}status`).then((r) => r.json()).then((d) => {
        if (cancelled || !d || d.ok !== true) return;
        if (typeof d.petOn === 'boolean' && Date.now() - lastToggle.current > 1500) shared.set({ petOn: d.petOn });
        if (typeof d.slug === 'string' && d.slug) {
          shared.set({ activeSlug: d.slug });
          saveJSON(LS_ACTIVE, d.slug);
        }
        if (Number.isFinite(Number(d.opacity))) shared.set({ opacity: clampOpacity(Number(d.opacity)) });
        if (Number.isFinite(Number(d.size))) shared.set({ size: clampSize(Number(d.size)) });
      }).catch(() => {});
    };
    const timer = setInterval(sync, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (manifestIsFresh()) {
      setManifest(manifestCache);
      return undefined;
    }
    fetchManifest().then((pets) => {
      if (!cancelled) setManifest(pets);
    }).catch(() => {
      if (!cancelled) setError('loadFailed');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!drawerOpen || manifest) return undefined;
    let cancelled = false;
    fetchManifest().then((pets) => {
      if (!cancelled) setManifest(pets);
    }).catch(() => {
      if (!cancelled) setError('loadFailed');
    });
    return () => { cancelled = true; };
  }, [drawerOpen, manifest]);

  const promptedRef = useRef('');
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const handleRuntimePhase = (phase) => {
    if (!aliveRef.current) return;
    const needsInstall = phase === 'missing' || phase === 'outdated' || phase === 'failed';
    if (!needsInstall) return;
    // 只登记“待提醒”，真正弹框由页面在“可见”时触发一次（见 PetPage 的 IntersectionObserver）。
    if (promptedRef.current !== phase) {
      promptedRef.current = phase;
      setRuntimePrompt(true);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`${API}runtime`);
        const d = await r.json();
        if (alive && d && d.ok) setRuntime(d);
      } catch { /* ignore */ }
    };
    fetch(`${API}runtime/check`, { method: 'POST' }).then((r) => r.json()).then((d) => {
      if (!alive) return;
      setRuntime(d);
      // 进入设置页时如果环境没就绪，提醒一次（每次进入只提醒一次）。
      handleRuntimePhase(d && d.phase);
    }).catch(() => {});
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const q = query.trim().toLowerCase();
  const installedSlugs = new Set(installed.map((p) => p.slug));
  const results = manifest && q ? core.filterPets(manifest, query) : [];

  const pushConfig = (patch) => {
    try {
      fetch(`${API}config`, { method: 'POST', body: JSON.stringify(patch) }).catch(() => {});
    } catch { /* ignore */ }
  };
  const setActive = (slug) => {
    shared.set({ activeSlug: slug });
    saveJSON(LS_ACTIVE, slug);
    pushConfig({ slug });
  };
  const setOpacity = (v) => {
    const next = clampOpacity(v);
    shared.set({ opacity: next });
    saveJSON(LS_OPACITY, next);
    pushConfig({ opacity: next });
  };
  const setSize = (v) => {
    const next = clampSize(v);
    shared.set({ size: next });
    saveJSON(LS_SIZE, next);
    pushConfig({ size: next });
  };
  const install = async (pet) => {
    setBusySlug(pet.slug);
    setError('');
    try {
      const res = await fetch(`${API}install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: pet.slug }),
      });
      const data = await res.json();
      if (!data || data.ok !== true) throw new Error('install');
      const r = await fetch(`${API}installed`);
      const d = await r.json();
      if (d && d.ok === true && Array.isArray(d.pets)) shared.set({ installed: d.pets });
      setActive(pet.slug);
    } catch {
      setError('installFailed');
    } finally {
      setBusySlug('');
    }
  };
  const remove = async (slug) => {
    try {
      await fetch(`${API}remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
    } catch { /* ignore */ }
    if (activeSlug === slug) setActive('');
    try {
      const r = await fetch(`${API}installed`);
      const d = await r.json();
      if (d && d.ok === true && Array.isArray(d.pets)) shared.set({ installed: d.pets });
    } catch { /* ignore */ }
  };

  // 不做默认预览：只有用户点了某一条结果才展示，避免“搜出来就自动选中”。
  const previewPet = previewSlug ? results.find((p) => p.slug === previewSlug) || null : null;
  const previewName = previewPet ? (previewPet.displayName || previewPet.slug) : '';
  // 未安装的宠物在宿主上没有本地精灵图，走 asset 代理，否则预览是空白。
  const previewUrl = previewPet && !installedSlugs.has(previewPet.slug) && previewPet.spritesheetUrl
    ? thumbUrl(previewPet.spritesheetUrl)
    : '';
  const activeName = activeSlug
    ? ((installed.find((p) => p.slug === activeSlug) || {}).displayName || activeSlug)
    : t('builtinCat');
  const pets = [{ slug: '', name: t('builtinCat') }, ...installed.map((p) => ({
    slug: p.slug,
    name: p.displayName || p.slug,
  }))];

  const petOn = state.petOn === true;
  const setPetOn = (next) => {
    // Do not optimistically flip the switch: during the Host's runtime retry a
    // second click would send the opposite petOn and cancel the activation.
    // The Host response/status is the source of truth.
    if (switching) return;
    setSwitching(true);
    lastToggle.current = Date.now();
    const payload = JSON.stringify({ petOn: next });
    try {
      fetch(`${API}config`, { method: 'POST', body: payload })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.petOn === 'boolean') shared.set({ petOn: d.petOn });
          // Host 拒绝激活（没有运行时）：按依赖运行时的操作处理，打开下载卡片。
          if (d && d.runtimeRequired) {
            fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: 'open-runtime-card' }) }).catch(() => {});
          }
        })
        .catch(() => {})
        .finally(() => setSwitching(false));
    } catch {
      setSwitching(false);
    }
    if (next && runtime && runtime.phase !== 'ready') {
      try {
        fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: 'open-runtime-card' }) }).catch(() => {});
      } catch { /* ignore */ }
    }
  };

  // 安装请求返回后保持「下载中…」直到轮询把状态切到 downloading/extracting，避免按钮被瞬间抽走。
  useEffect(() => {
    if (!installing) return undefined;
    const phase = runtime && runtime.phase;
    if (phase === 'downloading' || phase === 'extracting') { setInstalling(false); return undefined; }
    const timer = setTimeout(() => setInstalling(false), 6000);
    return () => clearTimeout(timer);
  }, [installing, runtime && runtime.phase]);

  const installRuntime = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      const res = await fetch(`${API}runtime/install`, { method: 'POST' });
      const d = await res.json();
      if (d && d.ok) {
        // 先把弹框打开并把下载态一起带过去。页面状态不在这里改：
        // 卡片按钮要等弹框（遮罩）出现后再随轮询收起，否则会闪一下。
        fetch(`${API}ui-event`, {
          method: 'POST',
          body: JSON.stringify({ type: 'open-runtime-card', runtime: d }),
        }).catch(() => {});
      } else {
        setInstalling(false);
      }
    } catch { setInstalling(false); }
    // 成功时保持 installing，直到轮询把状态切到 downloading/extracting（见上面的 effect），
    // 这样按钮不会在弹框出现前被抽走或重复点击。
  };

  return {
    topbar: h('div', { className: 'dpp-topbar' }, h('h1', null, t('menuPet'))),
    stage: {
      t,
      pets,
      activeSlug,
      anim: stageAnim,
      petOn,
      switching,
      onToggle: setPetOn,
      onAnim: setStageAnim,
      onPick: setActive,
      onRemove: remove,
      onAdd: () => setDrawerOpen(true),
    },
    settings: { t, opacity, size, onOpacity: setOpacity, onSize: setSize },
    runtime: { t, runtime, installing, onInstall: installRuntime },
    runtimePrompt,
    clearRuntimePrompt: () => setRuntimePrompt(false),
    drawer: {
      t,
      open: drawerOpen,
      onClose: () => {
        setDrawerOpen(false);
        setQuery('');
        setPreviewSlug('');
        setPreviewAnim('idle');
      },
      query,
      onQuery: (value) => { setQuery(value); setPreviewSlug(''); setPreviewAnim('idle'); },
      manifest,
      results,
      error,
      busySlug,
      installedSlugs,
      previewSlug: previewPet ? previewPet.slug : '',
      previewUrl,
      previewName,
      anim: previewAnim,
      onAnim: setPreviewAnim,
      onPreview: (slug) => {
        setPreviewSlug(slug);
        setPreviewAnim('idle');
      },
      onInstall: install,
      siteUrl: PETDEX_URL,
    },
  };
}

export function PetPage({ t }) {
  const view = usePetPageModel(t);
  const rootRef = useRef(null);
  React.useEffect(() => {
    if (!view.runtimePrompt || typeof IntersectionObserver !== 'function') return undefined;
    const el = rootRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      view.clearRuntimePrompt();
      fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: 'open-runtime-card' }) }).catch(() => {});
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view.runtimePrompt]);
  return h('div', { className: 'desk-pet-page', ref: rootRef },
    h('style', null, CSS),
    view.topbar,
    h('div', { className: 'dpp-scroll' },
      h('div', { className: 'dpp-wrap' },
        h(Stage, view.stage),
        h('div', { className: 'dpp-stack' },
          h(SettingsCard, view.settings),
          h(RuntimeInfoCard, view.runtime)))),
    h(AddPetDrawer, view.drawer));
}
