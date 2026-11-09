window.__ModuleLoader__.load({
  id: 'dsh-desk-pet-plugin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const API = '/api/desk-pet/';
    const LS_ACTIVE = 'desk-pet:active';
    const LS_OPACITY = 'desk-pet:opacity-v2';
    const LS_SIZE = 'desk-pet:size-v2';
    const DEFAULT_OPACITY = 1;
    const clampOpacity = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1, Math.max(0.3, n)) : DEFAULT_OPACITY;
    };
    const clampSize = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1.3, Math.max(0.75, n)) : 1;
    };

    // The pet itself lives ONLY on the screen (fullscreen transparent overlay
    // spawned by the Host). This client is deliberately thin: it hosts the
    // Petdex settings modal, pushes live session status to the Host, and
    // consumes right-click-menu events from the screen pet.

    const CSS = `
.desk-pet-runtime {
  /* Self-contained palette so the card matches the design 1:1 instead of
     inheriting the app's black brand accent. Dark values follow the OS. */
  --dp-bg: #ffffff;
  --dp-border: #e6e7ec;
  --dp-text: #1c1c22;
  --dp-muted: #6b7079;
  --dp-track: #eceef2;
  --dp-ok: #16a34a;
  --dp-warn: #b45309;
  --dp-err: #dc2626;
  --dp-brand: #4f6ef0;
  --dp-brand-2: #5b7cfa;
  --dp-green: #22c55e;
  --dp-green-track: #e9f7ee;
  --dp-ghost-border: #e2e4ea;
  --dp-ghost-text: #4a4f57;
  --dp-link: #9aa0a8;
  position: absolute; left: 0; top: 0; width: 320px; box-sizing: border-box;
  pointer-events: auto;
  padding: 20px 20px 16px; border-radius: 16px; text-align: center;
  background: var(--dp-bg); border: 1px solid var(--dp-border); color: var(--dp-text);
  box-shadow: 0 16px 36px -18px rgba(16,16,24,0.28), 0 2px 6px rgba(16,16,24,0.06);
  font-size: 11.5px; line-height: 1.5;
  animation: desk-pet-fade-in 0.18s ease-out both;
}
.desk-pet-runtime-layer {
  position: fixed; inset: 0; z-index: 7; pointer-events: none;
}
@media (prefers-color-scheme: dark) {
  .desk-pet-runtime {
    --dp-bg: #26262e;
    --dp-border: #34343e;
    --dp-text: #ececf1;
    --dp-muted: #b4b9c2;
    --dp-track: #3a3a45;
    --dp-ok: #34d399;
    --dp-warn: #fbbf24;
    --dp-err: #f87171;
    --dp-green-track: #1e3a2a;
    --dp-ghost-border: #3a3a45;
    --dp-ghost-text: #ececf1;
    --dp-link: #8d94a0;
    box-shadow: 0 16px 36px -18px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.4);
  }
}
.desk-pet-runtime-icon { display: flex; justify-content: center; margin-bottom: 10px; }
.desk-pet-runtime-icon svg { display: block; width: 48px; height: 48px; border-radius: 14px;
  box-shadow: 0 6px 16px -6px rgba(210,150,40,0.55), 0 0 0 1px rgba(0,0,0,0.04); }
.desk-pet-runtime-title { font-size: 13.5px; font-weight: 650; color: var(--dp-text); }
.desk-pet-runtime-title.ok { color: var(--dp-ok); }
.desk-pet-runtime-title.warn { color: var(--dp-warn); }
.desk-pet-runtime-title.err { color: var(--dp-err); }
.desk-pet-runtime-body { color: var(--dp-muted); margin-top: 6px; line-height: 1.7; word-break: break-word; }
.desk-pet-runtime-bar { height: 5px; border-radius: 999px; overflow: hidden; margin-top: 14px; background: var(--dp-track); }
.desk-pet-runtime-bar > i { display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--dp-brand-2), var(--dp-brand)); transition: width 0.3s ease; }
.desk-pet-runtime-bar.ok { background: var(--dp-green-track); }
.desk-pet-runtime-bar.ok > i { background: var(--dp-green); }
.desk-pet-runtime-meta { display: flex; justify-content: center; margin-top: 7px; font-size: 10.5px; color: var(--dp-muted); }
.desk-pet-runtime-actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.desk-pet-runtime-primary, .desk-pet-runtime-ghost, .desk-pet-runtime-warn {
  font: inherit; font-size: 11.5px; border-radius: 999px; padding: 7px 18px; cursor: pointer;
  border: 1px solid transparent; transition: filter 0.12s ease, background 0.12s ease;
}
.desk-pet-runtime-primary { background: var(--dp-brand); color: #fff; }
.desk-pet-runtime-primary:hover { filter: brightness(1.08); }
.desk-pet-runtime-warn { background: #f59e0b; color: #fff; }
.desk-pet-runtime-warn:hover { filter: brightness(1.06); }
.desk-pet-runtime-ghost { background: transparent; color: var(--dp-ghost-text); border-color: var(--dp-ghost-border); }
.desk-pet-runtime-ghost:hover { background: rgba(0,0,0,0.04); }
@media (prefers-color-scheme: dark) { .desk-pet-runtime-ghost:hover { background: rgba(255,255,255,0.08); } }
.desk-pet-runtime-primary:disabled, .desk-pet-runtime-warn:disabled { opacity: 0.6; cursor: default; }
.desk-pet-runtime-link { background: none; border: 0; padding: 3px 4px; font: inherit; font-size: 10.5px; color: var(--dp-link); cursor: pointer; }
.desk-pet-runtime-link:hover { color: var(--dp-text); }
.desk-pet-seg { display: flex; gap: 2px; background: #f3f4f7; border-radius: 999px; padding: 3px; width: fit-content; }
.desk-pet-seg > span { font-size: 11px; padding: 4px 12px; border-radius: 999px; color: #6b7079; cursor: pointer; }
.desk-pet-seg > span.on { background: #fff; color: #1c1c22; font-weight: 550; box-shadow: 0 1px 2px rgba(16,16,24,0.10); }
@media (prefers-color-scheme: dark) {
  .desk-pet-seg { background: rgba(255,255,255,0.06); }
  .desk-pet-seg > span { color: #a6acb6; }
  .desk-pet-seg > span.on { background: rgba(255,255,255,0.14); color: #ececf1; box-shadow: none; }
}
.desk-pet-page { height: 100%; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); line-height: 1.5; }
.dpp-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.dpp-wrap { width: 860px; max-width: 100%; margin: 0 auto; padding: 24px 32px 40px; box-sizing: border-box; }
.dpp-topbar { flex: none; height: 52px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); display: flex; align-items: center; }
.dpp-topbar-inner { width: 100%; padding: 0 24px; box-sizing: border-box;
  display: flex; align-items: center; }
.dpp-topbar h1 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: 0.01em; line-height: 1.4;
  color: var(--dsw-alias-label-primary); }
.dpp-hero { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
.dpp-pic { width: 52px; height: 52px; border-radius: 15px; overflow: hidden; flex: none;
  box-shadow: 0 6px 16px -8px rgba(210,150,40,0.6); }
.dpp-pic svg { display: block; }
.dpp-t1 { font-size: 16px; font-weight: 650; letter-spacing: 0.01em; line-height: 1.35; }
.dpp-switch { display: inline-flex; align-items: center; gap: 8px; flex: none; cursor: pointer; }
.dpp-switch-label { font-size: 12px; line-height: 1.4; color: var(--dsw-alias-label-secondary); }
.dpp-switch-track { position: relative; width: 38px; height: 22px; border-radius: 999px; border: 0; padding: 0;
  background: rgba(16,16,24,0.16); cursor: pointer; transition: background 0.16s ease; flex: none; }
.dpp-switch-track i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(16,16,24,0.28); transition: transform 0.16s ease; }
.dpp-switch-track.on { background: #4f6ef0; }
.dpp-switch-track.on i { transform: translateX(16px); }
.dpp-switch-track:focus-visible { outline: 2px solid rgba(79,110,240,0.5); outline-offset: 2px; }

.dpp-t2 { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.dpp-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); padding: 20px; }
.dpp-card + .dpp-card { margin-top: 16px; }
.dpp-h2 { font-size: 12.5px; font-weight: 600; line-height: 1.4; margin: 0 0 4px; display: flex; align-items: baseline; gap: 6px; }
.dpp-h2 .n { font-weight: 400; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dpp-h2row { justify-content: space-between; }
.dpp-desc { font-size: 11.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary); margin: 0 0 16px; }
.dpp-stripwrap { position: relative; }
.dpp-strip { display: flex; gap: 14px; overflow-x: auto; padding: 2px calc(50% - 63px) 2px;
  scrollbar-width: none; -ms-overflow-style: none; cursor: grab;
  overscroll-behavior-x: contain; touch-action: pan-y;
  perspective: 900px; perspective-origin: 50% 46%; transform-style: preserve-3d; }
.dpp-strip::-webkit-scrollbar { display: none; }
.dpp-strip { user-select: none; -webkit-user-select: none; }
.dpp-strip .dpp-pet { width: 126px; height: 118px; flex: none; padding: 6px 4px; user-select: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transform-style: preserve-3d; will-change: transform, opacity; backface-visibility: hidden; }
.dpp-strip .dpp-pet .thumb { height: 72px; font-size: 34px; }
.dpp-strip .dpp-pet .nm { font-size: 11px; line-height: 1.35; margin-top: 3px; }
.dpp-strip .dpp-pet .sub, .dpp-strip .dpp-pet .badge { font-size: 9.5px; line-height: 1.4; }
.dpp-strip.dragging { cursor: grabbing; }
.dpp-fade { position: absolute; top: 2px; bottom: 2px; width: 44px; pointer-events: none; z-index: 4;
  backdrop-filter: blur(0.5px); }
.dpp-fade.l { left: 0; background: linear-gradient(90deg, var(--dsw-alias-bg-layer-1) 10%, rgba(255,255,255,0) 100%); }
.dpp-fade.r { right: 0; background: linear-gradient(270deg, var(--dsw-alias-bg-layer-1) 10%, rgba(255,255,255,0) 100%); }
.dpp-pet { position: relative; text-align: center; padding: 10px 8px 8px; border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1); background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 55%, var(--dsw-alias-bg-layer-1)); cursor: pointer; }
.dpp-pet.active { border-color: #4f6ef0; box-shadow: 0 0 0 3px rgba(79,110,240,0.14); background: var(--dsw-alias-bg-layer-1); }
.dpp-pet.disabled { border-style: dashed; cursor: default; opacity: 0.75; }
.dpp-pet .thumb { height: 54px; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.dpp-pet .nm { font-size: 11.5px; line-height: 1.35; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dpp-pet .badge { font-size: 10px; color: #4f6ef0; margin-top: 2px; }
.dpp-pet .sub { font-size: 10px; line-height: 1.4; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
.dpp-pet .x { position: absolute; top: 9px; right: 9px; width: 16px; height: 16px; border: 0; border-radius: 0;
  background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1;
  text-align: center; padding: 0; cursor: pointer; opacity: 0; transition: opacity 0.12s ease, color 0.12s ease; }
.dpp-pet:hover .x { opacity: 0.65; }
.dpp-pet .x:hover { opacity: 1; color: var(--dsw-alias-label-primary); }
.dpp-ctl { display: flex; align-items: center; gap: 12px; padding: 0; }
.dpp-ctl + .dpp-ctl { margin-top: 12px; }
.dpp-ctl .lab { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-primary); width: 84px; flex: none; }
.dpp-seg { display: flex; gap: 2px; background: rgba(16,16,24,0.055); border-radius: 999px; padding: 3px; width: fit-content; }
.dpp-seg .s { font-size: 11px; line-height: 1.45; padding: 4px 12px; border-radius: 999px; color: var(--dsw-alias-label-secondary); cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease; }
.dpp-seg .s:hover { color: var(--dsw-alias-label-primary); }
.dpp-seg .s.on { background: #ffffff; color: #1c1c22; font-weight: 550; box-shadow: 0 1px 3px rgba(16,16,24,0.14), 0 0 0 0.5px rgba(16,16,24,0.05); }
@media (prefers-color-scheme: dark) {
  .dpp-seg { background: rgba(255,255,255,0.08); }
  .dpp-seg .s.on { background: rgba(255,255,255,0.16); color: var(--dsw-alias-label-primary); box-shadow: none; }
}
.dpp-ext { font-size: 11px; line-height: 1.4; color: #4f6ef0; text-decoration: none; white-space: nowrap; }
.dpp-ext:hover { text-decoration: underline; }
.dpp-split { display: grid; grid-template-columns: 1fr 236px; gap: 16px; align-items: start; margin-top: 12px; }
.dpp-split-full { grid-template-columns: 1fr; }
.dpp-search { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 60%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-secondary); font-size: 12.5px; margin: 0;
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease; }
.dpp-search:focus-within { border-color: #4f6ef0; background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 0 0 3px rgba(79,110,240,0.12); }
.dpp-search-row { margin-top: 16px; }
.dpp-search .ico { width: 14px; height: 14px; flex: none; opacity: 0.6; }
.dpp-result { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; cursor: pointer; }
.dpp-result.sel { background: color-mix(in srgb, #4f6ef0 8%, var(--dsw-alias-bg-layer-1)); }
.dpp-result .th { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dpp-result .nm { font-size: 12.5px; font-weight: 500; line-height: 1.35; }
.dpp-result .sl { font-size: 10.5px; line-height: 1.4; color: var(--dsw-alias-label-secondary); }
.dpp-btn { font: inherit; font-size: 11.5px; line-height: 1.45; border-radius: 999px; padding: 6px 16px; border: 1px solid transparent; cursor: pointer; white-space: nowrap; }
.dpp-btn.primary { background: #4f6ef0; color: #fff; }
.dpp-btn.ghost { background: transparent; color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l1); }
.dpp-btn.mini { padding: 4px 12px; font-size: 11px; }
.dpp-stage-empty { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dpp-preview-caption { font-size: 10.5px; line-height: 1.4; color: var(--dsw-alias-label-secondary); text-align: center; margin-top: 8px; }
.dpp-preview { display: flex; flex-direction: column; gap: 0; }
.dpp-stage { position: relative; height: 156px; border-radius: 12px; overflow: hidden;
  background: radial-gradient(circle at 50% 34%, var(--dsw-alias-bg-layer-1) 0%, var(--dsw-alias-bg-layer-2) 70%);
  border: 1px solid var(--dsw-alias-border-l1); display: flex; align-items: center; justify-content: center; }
.dpp-stage::after { content: ''; position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
  width: 64px; height: 8px; border-radius: 50%; background: rgba(16,16,24,0.10); filter: blur(3px); }
.dpp-acts { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.dpp-acts .act { font-size: 10.5px; line-height: 1.4; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dpp-acts .act.on { border-color: #4f6ef0; color: #4f6ef0; background: rgba(79,110,240,0.08); font-weight: 550; }
.dpp-kv { display: grid; grid-template-columns: 84px 1fr auto; align-items: center; gap: 12px; font-size: 12px; padding: 0; }
.dpp-kv + .dpp-kv { margin-top: 10px; }
.dpp-kv .k { color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
.dpp-kv > code { justify-self: start; }
.dpp-kv code { font: 11px/1 ui-monospace, monospace; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px; padding: 2px 6px; color: var(--dsw-alias-label-primary); }
.dpp-pill { display: inline-flex; align-items: center; gap: 6px; line-height: 1.5; font-size: 11px; font-weight: 400;
  border-radius: 999px; padding: 2px 10px; border: 1px solid transparent; }
.dpp-pill-ok { color: #16a34a; background: rgba(34,197,94,0.10); border-color: rgba(34,197,94,0.26); }
.dpp-pill-ok .d { background: #22c55e; }
.dpp-pill-busy { color: #2f52d0; background: rgba(79,110,240,0.10); border-color: rgba(79,110,240,0.28); }
.dpp-pill-busy .d { background: #4f6ef0; }
.dpp-pill-warn { color: #b45309; background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.30); }
.dpp-pill-warn .d { background: #f59e0b; }
.dpp-pill-bad { color: #be123c; background: rgba(244,63,94,0.10); border-color: rgba(244,63,94,0.28); }
.dpp-pill-bad .d { background: #f43f5e; }
.dpp-pill-idle { color: var(--dsw-alias-label-secondary); background: rgba(16,16,24,0.055); border-color: rgba(16,16,24,0.10); }
.dpp-pill-idle .d { background: #9aa0a8; }
.dpp-pill .d { width: 5px; height: 5px; border-radius: 50%; }
@keyframes desk-pet-fade-in { from { opacity: 0; } to { opacity: 1; } }
 to { opacity: 1; transform: none; } }
 50% { opacity: 1; } }
`;

    function spriteUrl(slug) {
      return `${API}pet/${slug}/sprite`;
    }
    function thumbUrl(remoteUrl) {
      return `${API}asset?url=${encodeURIComponent(remoteUrl)}`;
    }
    function loadJSON(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    }
    function saveJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota or privacy mode */ }
    }
    function preloadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
      });
    }

    // ---- petdex catalog cache: stale-while-revalidate, module scope ----
    // The catalog is a slow third-party network round-trip. Keeping it across
    // modal mounts (and warming it at shell mount) is what makes the settings
    // modal open instantly instead of showing a loading line every time.
    const MANIFEST_TTL = 10 * 60 * 1000;
    let manifestCache = null;
    let manifestAt = 0;
    let manifestPending = null;
    function fetchManifest() {
      if (manifestPending) return manifestPending;
      manifestPending = fetch(`${API}manifest`)
        .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
        .then((data) => {
          if (!data || data.ok !== true || !Array.isArray(data.pets)) throw new Error('bad manifest');
          manifestCache = data.pets;
          manifestAt = Date.now();
          return manifestCache;
        })
        .finally(() => { manifestPending = null; });
      return manifestPending;
    }
    function manifestIsFresh() {
      return Array.isArray(manifestCache) && Date.now() - manifestAt < MANIFEST_TTL;
    }

    const FRAME_RATIO = 208 / 192;

    // ---- static thumbnail (first idle frame), proxy-first with direct fallback ----
    const thumbCache = new Map();
    function PetThumb({ url, fallbackUrl, size }) {
      const ref = useRef(null);
      useEffect(() => {
        let cancelled = false;
        const draw = (img) => {
          if (cancelled || !ref.current) return;
          const fw = img.naturalWidth / 8;
          const c = ref.current;
          const dpr = window.devicePixelRatio || 1;
          // match the sheet's real cell ratio (cells are not always square)
          let rows = 5;
          let best = Infinity;
          for (let r = 1; r <= 16; r += 1) {
            if (img.naturalHeight % r !== 0) continue;
            const diff = Math.abs(img.naturalHeight / r - fw);
            if (diff < best) { best = diff; rows = r; }
          }
          const fh = img.naturalHeight / rows;
          const ratio = fh / fw;
          c.width = size * dpr;
          c.height = Math.round(size * ratio) * dpr;
          c.style.height = `${Math.round(size * ratio)}px`;
          const x = c.getContext('2d');
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, fw, fh, 0, 0, c.width, c.height);
        };
        const cached = thumbCache.get(url);
        if (cached) draw(cached);
        else {
          const attempt = fallbackUrl
            ? preloadImage(url).catch(() => preloadImage(fallbackUrl))
            : preloadImage(url);
          attempt.then((img) => { thumbCache.set(url, img); draw(img); }).catch(() => {});
        }
        return () => { cancelled = true; };
      }, [url, fallbackUrl, size]);
      return h('canvas', {
        ref,
        'aria-hidden': true,
        style: { width: size, height: Math.round(size * FRAME_RATIO), display: 'block', margin: '0 auto' },
      });
    }

    // ---- shared pet state -------------------------------------------------
    // The floating overlay and the settings page are two different slots; a
    // tiny external store keeps them in sync (installed pets, active slug,
    // opacity, size, runtime snapshot).
    const shared = (() => {
      let state = {
        installed: [],
        activeSlug: loadJSON(LS_ACTIVE, ''),
        opacity: clampOpacity(loadJSON(LS_OPACITY, DEFAULT_OPACITY)),
        size: clampSize(loadJSON(LS_SIZE, 1)),
        runtime: null,
      };
      const subs = new Set();
      return {
        get: () => state,
        set: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()); },
        subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
      };
    })();
    const useShared = () => React.useSyncExternalStore(shared.subscribe, shared.get, shared.get);

    // ---- petdex settings modal ----
    // ---- settings page ---------------------------------------------------
    const ACTIONS = [
      { row: 0, key: 'idle', zh: '待机', en: 'Idle' },
      { row: 1, key: 'run', zh: '跑动', en: 'Run' },
      { row: 3, key: 'wave', zh: '挥手', en: 'Wave' },
      { row: 4, key: 'jump', zh: '跳跃', en: 'Jump' },
    ];
    const PET_SIZES = [
      { value: 0.75, key: 'small', zh: '小', en: 'S' },
      { value: 1, key: 'medium', zh: '中', en: 'M' },
      { value: 1.3, key: 'large', zh: '大', en: 'L' },
    ];
    const PET_OPACITIES = [0.3, 0.6, 0.9, 1];

    /** Loops one sprite row of a petdex sheet. */
    function PetPreview({ slug, url, row, px, active }) {
      const ref = useRef(null);
      useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !slug) return undefined;
        let cancelled = false;
        let raf = 0;
        let frame = 0;
        let last = 0;
        const dpr = window.devicePixelRatio || 1;
        const ctx = canvas.getContext('2d');
        let sheet = null;
        const COLS = 8;
        let rows = 5;

        const paint = (index) => {
          if (!sheet || !sheet.naturalWidth) return;
          const fw = sheet.naturalWidth / COLS;
          const fh = sheet.naturalHeight / rows;
          const r = Math.min(row, rows - 1);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(sheet, index * fw, r * fh, fw, fh, 0, 0, canvas.width, canvas.height);
        };

        const loop = (ts) => {
          if (cancelled) return;
          if (!last || ts - last > 130) { last = ts; frame = (frame + 1) % COLS; }
          paint(frame);
          raf = requestAnimationFrame(loop);
        };

        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          sheet = img;
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const cellW = w / COLS;
          // cell height: the divisor of h whose cell is closest to the cell width
          let best = Infinity;
          rows = 1;
          for (let r = 1; r <= 16; r += 1) {
            if (h % r !== 0) continue;
            const diff = Math.abs(h / r - cellW);
            if (diff < best) { best = diff; rows = r; }
          }
          const cellH = h / rows;
          const ratio = cellH / cellW;
          canvas.width = Math.round(px * dpr);
          canvas.height = Math.round(px * ratio * dpr);
          canvas.style.height = `${Math.round(px * ratio)}px`;
          paint(0);
          raf = requestAnimationFrame(loop);
        };
        img.src = url || spriteUrl(slug);
        return () => { cancelled = true; if (raf) cancelAnimationFrame(raf); };
      }, [slug, url, row, px]);
      if (active) return h('div', { style: { fontSize: px * 0.62, lineHeight: 1 } }, '🐱');
      return h('canvas', { ref, 'aria-hidden': true, style: { width: px, height: Math.round(px * FRAME_RATIO), display: 'block' } });
    }

    function PetPage({ t, onBack }) {
      const state = useShared();
      const { installed, activeSlug, opacity, size } = state;
      const [query, setQuery] = useState('');
      const [manifest, setManifest] = useState(() => (Array.isArray(manifestCache) ? manifestCache : null));
      const [error, setError] = useState('');
      const [busySlug, setBusySlug] = useState('');
      const [previewSlug, setPreviewSlug] = useState('');
      const [actionRow, setActionRow] = useState(0);
      const [runtime, setRuntime] = useState(null);
      const [rechecking, setRechecking] = useState(false);
      const [recheckDone, setRecheckDone] = useState(false);
      const scrollRef = useRef(null);

      useEffect(() => {
        let cancelled = false;
        if (manifestIsFresh()) { setManifest(manifestCache); return undefined; }
        fetchManifest()
          .then((pets) => { if (!cancelled) setManifest(pets); })
          .catch(() => { if (!cancelled) setError('loadFailed'); });
        return () => { cancelled = true; };
      }, []);

      // Runtime snapshot for the bottom card. A missing/outdated runtime means:
      // the switch cannot stay on, and the user gets the download prompt.
      const promptedRef = useRef('');
      const handleRuntimePhase = (phase) => {
        if (!aliveRef.current) return;
        const needsInstall = phase === 'missing' || phase === 'outdated' || phase === 'failed';
        if (!needsInstall) return;
        // auto-off: never leave the switch on without a usable runtime
        try {
          if (shared.get().petOn !== false) {
            shared.set({ petOn: false });
            fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: false }) }).catch(() => {});
          }
          if (promptedRef.current !== phase) {
            promptedRef.current = phase;
            fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: 'open-runtime-card' }) }).catch(() => {});
          }
        } catch { /* ignore */ }
      };
      const aliveRef = useRef(true);
      useEffect(() => () => { aliveRef.current = false; }, []);

      useEffect(() => {
        aliveRef.current = true;
        let alive = true;
        const tick = async () => {
          try {
            const r = await fetch(`${API}runtime`);
            const d = await r.json();
            if (alive && d && d.ok) setRuntime(d);
          } catch { /* host unreachable */ }
        };
        fetch(`${API}runtime/check`, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => { if (alive) { setRuntime(d); handleRuntimePhase(d && d.phase); } })
          .catch(() => {});
        const id = setInterval(tick, 3000);
        return () => { alive = false; clearInterval(id); };
      }, []);

      const q = query.trim().toLowerCase();
      const installedSlugs = new Set(installed.map((p) => p.slug));
      const results = manifest && q
        ? manifest.filter((p) => (p.slug && p.slug.toLowerCase().includes(q))
          || (p.displayName && p.displayName.toLowerCase().includes(q))).slice(0, 10)
        : [];

      // Apply straight to the Host as well: the floating overlay's heartbeat is
      // not guaranteed to run while the page is open.
      const pushConfig = (patch) => {
        try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify(patch) }).catch(() => {}); } catch { /* ignore */ }
      };
      const setActive = (slug) => { shared.set({ activeSlug: slug }); saveJSON(LS_ACTIVE, slug); pushConfig({ slug }); };
      const setOpacity = (v) => {
        const next = clampOpacity(v);
        shared.set({ opacity: next }); saveJSON(LS_OPACITY, next); pushConfig({ opacity: next });
      };
      const setSize = (v) => {
        const next = clampSize(v);
        shared.set({ size: next }); saveJSON(LS_SIZE, next); pushConfig({ size: next });
      };

      const install = async (pet) => {
        setBusySlug(pet.slug);
        setError('');
        try {
          const res = await fetch(`${API}install?slug=${encodeURIComponent(pet.slug)}`);
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
        try { await fetch(`${API}remove?slug=${encodeURIComponent(slug)}`); } catch { /* ignore */ }
        if (activeSlug === slug) setActive('');
        try {
          const r = await fetch(`${API}installed`);
          const d = await r.json();
          if (d && d.ok === true && Array.isArray(d.pets)) shared.set({ installed: d.pets });
        } catch { /* keep list */ }
      };

      const activeName = activeSlug
        ? ((installed.find((p) => p.slug === activeSlug) || {}).displayName || activeSlug)
        : t('builtinCat');
      // results open the preview column; the stage stays empty until one is selected
      const previewPet = previewSlug ? (results.find((p) => p.slug === previewSlug) || null) : null;
      const showPreview = q !== '' && manifest !== null && results.length > 0;
      const previewName = previewPet ? (previewPet.displayName || previewPet.slug) : t('builtinCat');
      const previewIsBuiltin = !previewPet;
      const previewActive = previewPet ? previewPet.slug === activeSlug : activeSlug === '';

      const card = { border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 14, background: 'var(--dsw-alias-bg-layer-1)', padding: '16px 18px' };
      const h2 = { fontSize: 12.5, fontWeight: 600, margin: '0 0 2px', color: 'var(--dsw-alias-label-primary)' };
      const desc = { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 14px' };
      const segWrap = { className: 'desk-pet-seg' };
      const pill = { display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 10, fontSize: 10.5, fontWeight: 400,
        color: 'var(--dsw-alias-state-success-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 26%, transparent)', borderRadius: 999, padding: '2px 8px' };

      const runtimeOk = runtime && runtime.phase === 'ready';
      const statusWord = !runtime ? t('pgRuntimeChecking')
        : runtimeOk ? t('pgRuntimeReady')
          : runtime.phase === 'downloading' || runtime.phase === 'extracting' ? t('pgRuntimeInstalling')
            : runtime.phase === 'failed' ? t('pgRuntimeFailed')
              : t('pgRuntimeMissing');
      const statusDetail = runtimeOk
        ? (runtime.source === 'detected' || runtime.source === 'env'
          ? `（${t('pgRuntimeLocal')}）`
          : `（${t('pgRuntimeDownloaded')}）`)
        : '';

      const CAT_SVG = h('svg', { viewBox: '0 0 64 64', width: 52, height: 52, 'aria-hidden': true },
        h('rect', { width: 64, height: 64, rx: 14, fill: '#fff4d6' }),
        h('path', { d: 'M17 28 L11 7 L34 19 Z', fill: '#f2b950' }),
        h('path', { d: 'M47 28 L53 7 L30 19 Z', fill: '#f2b950' }),
        h('circle', { cx: 32, cy: 39, r: 20, fill: '#ffd166' }),
        h('ellipse', { cx: 22, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
        h('ellipse', { cx: 42, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
        h('circle', { cx: 25, cy: 36, r: 3, fill: '#3a2c1a' }),
        h('circle', { cx: 39, cy: 36, r: 3, fill: '#3a2c1a' }),
        h('path', { d: 'M28 44 Q32 47 36 44', stroke: '#3a2c1a', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }));

      // ---- sections (built separately so the tree cannot nest by accident) ----
      const topbar = h('div', { className: 'dpp-topbar' },
        h('div', { className: 'dpp-topbar-inner' },
          h('h1', null, t('menuPet'))));

      // optimistic: the switch flips instantly; the host applies the latest value
      const petOn = state.petOn !== false;
      const setPetOn = (next) => {
        if (next && runtime && runtime.phase !== 'ready') {
          // Activating needs the runtime: the switch stays off, the Host records
          // the intent and shows the download flow; once the runtime lands the
          // pet activates by itself.
          shared.set({ petOn: false });
          try {
            fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: true }) }).catch(() => {});
            fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ type: 'open-runtime-card' }) }).catch(() => {});
          } catch { /* ignore */ }
          return;
        }
        shared.set({ petOn: next });
        try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: next }) }).catch(() => {}); } catch { /* ignore */ }
      };

      const hero = h('div', { className: 'dpp-hero' },
        h('div', { className: 'dpp-pic' }, CAT_SVG),
        h('div', { style: { flex: 1 } },
          h('div', { className: 'dpp-t1' }, t('menuPet')),
          h('div', { className: 'dpp-t2' }, `${t('pgCurrent')}${activeName} · ${t('pgHeroSub')}`)),
        h('label', { className: 'dpp-switch' },
          h('span', { className: 'dpp-switch-label' }, t('pgActivate')),
          h('button', {
            type: 'button',
            role: 'switch',
            'aria-checked': petOn ? 'true' : 'false',
            'aria-label': t('pgActivate'),
            className: 'dpp-switch-track' + (petOn ? ' on' : ''),
            onClick: () => setPetOn(!petOn),
          }, h('i', null))));

      const petTile = (key, active, onClick, thumb, name, onRemove, sub, index) =>
        h('div', {
          key,
          ref: (el) => { cardEls.current[index] = el; },
          className: `dpp-pet${active ? ' active' : ''}`,
          role: 'button', tabIndex: 0,
          onClick: () => {
            onClick();
            if (nearestIndex() !== index) scrollToIndex(index, true);
          },
          onKeyDown: (e) => { if (e.key === 'Enter') onClick(); },
        },
          onRemove && h('button', {
            className: 'x', 'aria-label': t('remove'),
            onClick: (e) => { e.stopPropagation(); onRemove(); },
          }, '✕'),
          h('div', { className: 'thumb', style: thumb.style || null }, thumb.node),
          h('div', { className: 'nm', title: name }, name),
          h('div', { className: sub.active ? 'badge' : 'sub' }, sub.text));

      const resultRow = (pet) => h('div', {
        key: pet.slug,
        className: `dpp-result${previewSlug === pet.slug ? ' sel' : ''}`,
        onClick: () => { setPreviewSlug(pet.slug); setActionRow(0); },
      },
        h('div', { className: 'th' }, h(PetThumb, { url: thumbUrl(pet.spritesheetUrl), fallbackUrl: pet.spritesheetUrl, size: 34 })),
        h('div', null,
          h('div', { className: 'nm' }, pet.displayName || pet.slug),
          h('div', { className: 'sl' }, pet.slug)),
        installedSlugs.has(pet.slug)
          ? h('span', { className: 'sl' }, '✓ ' + t('installedMark'))
          : h('button', {
              className: 'dpp-btn ghost mini',
              disabled: busySlug !== '',
              onClick: (e) => { e.stopPropagation(); install(pet); },
            }, busySlug === pet.slug ? t('installing') : t('install')));

      // ---- 我的宠物（含内嵌的「从 petdex.dev 安装」）----
      const stripRef = useRef(null);
      const cardEls = useRef([]);
      const [edges, setEdges] = useState({ left: false, right: false });
      const slugsRef = useRef([]);

      const cardSlugs = ['', ...installed.map((p2) => p2.slug)];
      slugsRef.current = cardSlugs;

      // 3D placement: distance from the strip centre drives rotate / depth / scale
      const layout = useCallback(() => {
        const el = stripRef.current;
        if (!el) return;
        const mid = el.clientWidth / 2;
        const span = 146;
        for (const card of cardEls.current) {
          if (!card) continue;
          const centre = card.offsetLeft + card.offsetWidth / 2 - el.scrollLeft;
          const t = (centre - mid) / span;
          const a = Math.min(Math.abs(t), 2);
          card.style.transform = `rotateY(${(-t * 22).toFixed(2)}deg) translateZ(${(-a * 38).toFixed(1)}px) scale(${(1 - a * 0.07).toFixed(3)})`;
          card.style.opacity = String(Math.max(0.72, 1 - a * 0.12));
          card.style.zIndex = String(Math.max(1, 10 - Math.round(a * 3)));
        }
        const left = el.scrollLeft > 2;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
        setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
      }, []);

      const nearestIndex = () => {
        const el = stripRef.current;
        if (!el) return -1;
        const mid = el.clientWidth / 2;
        let best = -1;
        let bestD = Infinity;
        cardEls.current.forEach((card, i) => {
          if (!card) return;
          const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - el.scrollLeft - mid);
          if (d < bestD) { bestD = d; best = i; }
        });
        return best;
      };

      const scrollToIndex = (index, smooth) => {
        const el = stripRef.current;
        const card = cardEls.current[index];
        if (!el || !card) return;
        const left = card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2;
        if (smooth) el.scrollTo({ left, behavior: 'smooth' });
        else el.scrollLeft = left;
      };

      useEffect(() => {
        const el = stripRef.current;
        if (!el) return undefined;
        let raf = 0;
        const onScroll = () => {
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); });
        };
        layout();
        requestAnimationFrame(() => {
          const idx = slugsRef.current.indexOf(shared.get().activeSlug);
          if (idx >= 0) scrollToIndex(idx, false);
          layout();
        });
        el.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
          if (raf) cancelAnimationFrame(raf);
          el.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', onScroll);
        };
      }, [layout, installed.length]);

      // centre the current pet when it changes from outside the carousel
      useEffect(() => {
        const idx = slugsRef.current.indexOf(activeSlug);
        if (idx >= 0) { scrollToIndex(idx, true); requestAnimationFrame(layout); }
      }, [activeSlug, installed.length, layout]);

      const drag = useRef({ down: false, startX: 0, startLeft: 0, lastX: 0, lastT: 0, vel: 0, moved: false, id: -1 });
      const inertia = useRef(0);

      const stopInertia = () => {
        if (inertia.current) { cancelAnimationFrame(inertia.current); inertia.current = 0; }
      };

      const onStripClickCapture = (e) => {
        if (!drag.current.moved) return;
        drag.current.moved = false;
        e.stopPropagation();
        e.preventDefault();
      };

      const onStripDown = (e) => {
        if (e.button !== 0) return;
        const el = stripRef.current;
        if (!el) return;
        stopInertia();
        const st = { down: true, startX: e.clientX, startLeft: el.scrollLeft, lastX: e.clientX, lastT: performance.now(), vel: 0, moved: false };
        drag.current = st;
        el.classList.add('dragging');

        const onMove = (ev) => {
          if (!st.down) return;
          const now = performance.now();
          const dx = ev.clientX - st.startX;
          if (Math.abs(dx) > 6) st.moved = true;
          if (!st.moved) return;
          el.scrollLeft = st.startLeft - dx;
          const dt = Math.max(8, now - st.lastT);
          st.vel = (ev.clientX - st.lastX) / dt;
          st.lastX = ev.clientX;
          st.lastT = now;
        };

        const onUp = () => {
          st.down = false;
          el.classList.remove('dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          const v = st.vel;
          if (st.moved && Math.abs(v) > 0.15) {
            let speed = v * 14;
            const step = () => {
              el.scrollLeft -= speed;
              speed *= 0.93;
              if (Math.abs(speed) > 0.4) inertia.current = requestAnimationFrame(step);
              else inertia.current = 0;
            };
            inertia.current = requestAnimationFrame(step);
          }
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        window.addEventListener('pointercancel', onUp, { once: true });
      };

      // vertical wheel over the strip scrolls it horizontally first;
      // once it hits an edge the page takes over again.
      useEffect(() => {
        const el = stripRef.current;
        if (!el) return undefined;
        let pending = 0;
        let rafId = 0;
        const flush = () => {
          rafId = 0;
          if (!pending) return;
          el.scrollLeft += pending;
          pending = 0;
        };
        const onWheel = (e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          const canRight = el.scrollLeft + pending + el.clientWidth < el.scrollWidth - 1;
          const canLeft = el.scrollLeft + pending > 1;
          if ((e.deltaY > 0 && !canRight) || (e.deltaY < 0 && !canLeft)) return;
          e.preventDefault();
          stopInertia();
          pending += e.deltaY;
          if (!rafId) rafId = requestAnimationFrame(flush);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => { el.removeEventListener('wheel', onWheel); if (rafId) cancelAnimationFrame(rafId); };
      }, []);

      const searchRow = h('div', { className: 'dpp-search' },
        h('svg', { className: 'ico', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
          h('circle', { cx: 7, cy: 7, r: 4.6, stroke: 'currentColor', strokeWidth: 1.4 }),
          h('path', { d: 'M10.6 10.6 L13.6 13.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })),
        h('input', {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: t('searchPlaceholder'),
          style: { width: '100%', boxSizing: 'border-box', border: 0, outline: 'none', background: 'transparent',
            color: 'var(--dsw-alias-label-primary)', fontSize: 12 },
        }));

      const resultsBlock = h('div', null,
        error === 'loadFailed' && h('div', { className: 'dpp-desc', style: { margin: '8px 0 0' } }, t('loadFailed')),
        error === 'installFailed' && h('div', { className: 'dpp-desc', style: { margin: '8px 0 0', color: 'var(--dsw-alias-state-error-primary)' } }, t('installFailed')),
        !manifest && h('div', { className: 'dpp-desc', style: { textAlign: 'center', padding: '10px 0' } }, t('loading')),
        q && manifest && results.length === 0 && h('div', { className: 'dpp-desc', style: { textAlign: 'center', padding: '10px 0' } }, t('noResults')),
        results.map(resultRow));

      const previewBlock = showPreview && h('div', { className: 'dpp-preview' },
        h('div', { className: 'dpp-stage' },
          previewPet
            ? h(PetPreview, {
                slug: previewPet.slug,
                url: previewPet.spritesheetUrl ? thumbUrl(previewPet.spritesheetUrl) : undefined,
                row: actionRow, px: 96, active: false,
              })
            : h('div', { className: 'dpp-stage-empty' }, t('pgPickPet'))),
        h('div', { className: 'dpp-preview-caption' },
          previewPet ? `${t('pgPreview')} · ${previewName} · ${previewPet.slug}` : t('pgPreview')),
        previewPet && h('div', { className: 'dpp-acts' },
          ACTIONS.map((a) => h('span', {
            key: a.key,
            className: actionRow === a.row ? 'act on' : 'act',
            onClick: () => setActionRow(a.row),
          }, t('pgAct_' + a.key)))));

      const petsCard = h('div', { className: 'dpp-card' },
        h('h2', { className: 'dpp-h2' },
          t('currentPet'), h('span', { className: 'n' }, `${installed.length + 1} ${t('pgPetsUnit')}`)),
        h('p', { className: 'dpp-desc' }, t('pgPetsHint')),
        h('div', {
          className: 'dpp-stripwrap',
          onPointerDown: onStripDown,
          onClickCapture: onStripClickCapture,
        },
          edges.left && h('div', { className: 'dpp-fade l' }),
          edges.right && h('div', { className: 'dpp-fade r' }),
          h('div', { className: 'dpp-strip', ref: stripRef },
          petTile('builtin', activeSlug === '', () => setActive(''), { node: '🐱' }, t('builtinCat'), null,
            { active: activeSlug === '', text: activeSlug === '' ? '● ' + t('active') : t('use') }, 0),
          installed.map((pet, i) => petTile(pet.slug, activeSlug === pet.slug, () => setActive(pet.slug),
            { node: h(PetThumb, { url: spriteUrl(pet.slug), size: 66 }) }, pet.displayName || pet.slug,
            () => remove(pet.slug),
            { active: activeSlug === pet.slug, text: activeSlug === pet.slug ? '● ' + t('active') : t('use') },
            i + 1)),
          )));


      const installCard = h('div', { className: 'dpp-card' },
        h('h2', { className: 'dpp-h2 dpp-h2row' },
          h('span', null, t('onlineHeading')),
          h('a', { className: 'dpp-ext', href: 'https://petdex.dev', target: '_blank', rel: 'noreferrer' }, t('pgOpenSite'))),
        h('p', { className: 'dpp-desc' },
          `${manifest ? manifest.length.toLocaleString() : '—'} ${t('petsAvailable')} · ${t('pgInstallHint')}`),
        h('div', { className: 'dpp-search-row' }, searchRow),
        (previewBlock || q) && h('div', { className: previewBlock ? 'dpp-split' : 'dpp-split dpp-split-full' },
          resultsBlock,
          previewBlock));

      const seg = (items, current, onPick) =>
        h('div', { className: 'dpp-seg' }, items.map((item) => h('span', {
          key: String(item.value),
          className: Math.abs(current - item.value) < 0.01 ? 's on' : 's',
          onClick: () => onPick(item.value),
        }, item.label)));

      const appearanceCard = h('div', { className: 'dpp-card' },
        h('h2', { className: 'dpp-h2' }, t('appearance')),
        h('p', { className: 'dpp-desc' }, t('pgAppearanceHint')),
        h('div', { className: 'dpp-ctl' },
          h('span', { className: 'lab' }, t('pgOpacity')),
          seg(PET_OPACITIES.map((v) => ({ value: v, label: `${Math.round(v * 100)}%` })), opacity, setOpacity)),
        h('div', { className: 'dpp-ctl' },
          h('span', { className: 'lab' }, t('pgSize')),
          seg(PET_SIZES.map((s2) => ({ value: s2.value, label: t('pgSize' + s2.key.charAt(0).toUpperCase() + s2.key.slice(1)) })), size, setSize)));

      const kv = (label, value, action) => h('div', { className: 'dpp-kv' },
        h('span', { className: 'k' }, label),
        value,
        action || h('span', null));

      // the title's pill moved into the status row, styled by phase
      const statusTone = !runtime ? 'idle'
        : runtimeOk ? 'ok'
          : (runtime.phase === 'downloading' || runtime.phase === 'extracting') ? 'busy'
            : runtime.phase === 'failed' ? 'bad'
              : 'warn';
      const runtimeCard = h('div', { className: 'dpp-card' },
        h('h2', { className: 'dpp-h2' }, t('pgRuntime')),
        h('p', { className: 'dpp-desc' }, t('pgRuntimeHint')),
        kv(t('pgStatus'),
          h('span', { style: { display: 'inline-flex', alignItems: 'center' } },
            h('span', { className: `dpp-pill dpp-pill-${statusTone}` },
              h('span', { className: 'd' }),
              statusWord),
            statusDetail && h('span', { style: { marginLeft: 8, color: 'var(--dsw-alias-label-secondary)' } }, statusDetail),
            // the status hint lives here (the button below never changes shape)
            h('span', {
              style: {
                display: 'inline-block', marginLeft: 8, fontSize: 11, minWidth: 56,
                visibility: rechecking || recheckDone ? 'visible' : 'hidden',
                color: recheckDone ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
                transition: 'color 0.12s ease',
              },
            }, recheckDone ? t('pgRechecked') : t('pgRechecking'))),
          h('button', {
            className: 'dpp-btn ghost mini',
            disabled: rechecking,
            style: { opacity: rechecking ? 0.6 : 1, transition: 'opacity 0.12s ease' },
            onClick: async () => {
              if (rechecking) return;
              setRechecking(true);
              setRecheckDone(false);
              try {
                const r = await fetch(`${API}runtime/check`, { method: 'POST' });
                const d2 = await r.json();
                setRuntime(d2);
                handleRuntimePhase(d2 && d2.phase);
                setRecheckDone(true);
                setTimeout(() => setRecheckDone(false), 1800);
              } catch { /* ignore */ }
              setRechecking(false);
            },
          }, t('pgRecheck'))),
        kv(t('pgVersion'), h('code', null, runtime && runtime.version ? `Electron ${runtime.version}` : '—')),
        kv(t('pgLocation'), h('code', null,
          runtime && runtime.source && runtime.source !== 'detected' && runtime.source !== 'env'
            ? '~/.petdex/dsh-float/runtime'
            : (runtime && runtime.bin ? runtime.bin : '~/.petdex/dsh-float/runtime'))));

      return h('div', { className: 'desk-pet-page' },
        topbar,
        h('div', { className: 'dpp-scroll', ref: scrollRef },
          h('div', { className: 'dpp-wrap' }, hero, petsCard, installCard, appearanceCard, runtimeCard)));
    }

    function truncateTask(text) {
      return text.length > 40 ? `${text.slice(0, 39)}…` : text;
    }

    function taskTextOf(row) {
      const todos = row && row.projectionValues && row.projectionValues.todos;
      if (Array.isArray(todos)) {
        const current = todos.find((todo) => todo && todo.status === 'in_progress');
        if (current && current.content) return truncateTask(current.content);
      }
      return row && typeof row.displayTitle === 'string' ? truncateTask(row.displayTitle) : '';
    }

    function readStatus(statusMap, sessionsList) {
      const idle = { mode: 'idle', task: '', extra: 0, sessionId: '', kind: '' };
      if (!sessionsList || !sessionsList.byId) return idle;
      const rows = Object.values(sessionsList.byId).filter((r) => r && !r.blank);
      // Composite subagent rows carry a synthetic id retain() cannot resolve;
      // jump to their parent session instead.
      const jumpIdOf = (row) => (row.origin === 'subagent' && row.parentId ? row.parentId : row.id) || '';
      const waitingRows = [];
      const workingRows = [];
      const doneRows = [];
      for (const row of rows) {
        const st = statusMap && typeof statusMap.get === 'function' ? statusMap.get(row.id) : undefined;
        if (st && st.pendingInteraction) { waitingRows.push({ row, kind: (st.pendingInteraction && st.pendingInteraction.kind) || '' }); continue; }
        if ((st && st.running) || row.running) { workingRows.push(row); continue; }
        // Match the sidebar exactly: completionUnread only counts while the
        // session is NOT in the main view.
        if (st && st.completionUnread && !(row.retainedBy && row.retainedBy.mainView > 0)) doneRows.push(row);
      }
      const isMain = (r) => (r.retainedBy && r.retainedBy.mainView > 0 ? 1 : 0);
      const mainFirst = (a, b) => isMain(b) - isMain(a);
      waitingRows.sort((a, b) => mainFirst(a.row, b.row));
      workingRows.sort(mainFirst);
      doneRows.sort(mainFirst);
      if (waitingRows.length > 0) {
        const first = waitingRows[0];
        return { mode: 'waiting', kind: first.kind, task: taskTextOf(first.row), extra: waitingRows.length - 1, sessionId: jumpIdOf(first.row) };
      }
      if (workingRows.length > 0) {
        return { mode: 'working', kind: '', task: taskTextOf(workingRows[0]), extra: workingRows.length - 1, sessionId: jumpIdOf(workingRows[0]) };
      }
      if (doneRows.length > 0) {
        return { mode: 'done', kind: '', task: taskTextOf(doneRows[0]), extra: doneRows.length - 1, sessionId: jumpIdOf(doneRows[0]) };
      }
      return idle;
    }

    function StatusBridge({ useSessionStatus, useSessions, onStatus }) {
      const statusMap = useSessionStatus ? useSessionStatus((s) => s) : null;
      const sessionsList = useSessions ? useSessions((s) => s) : null;
      const status = React.useMemo(() => readStatus(statusMap, sessionsList), [statusMap, sessionsList]);
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

    // ---- thin client: modal host + status source + screen-pet lifecycle ----
    function DeskPet(props) {
      const { t, subscribeLocale, getLocaleSnapshot, useSessionStatus, useSessions, openSession, openPage } = props;
      const [status, setStatus] = useState({ mode: 'idle', task: '', extra: 0, sessionId: '', kind: '' });
      const sharedState = useShared();
      const installed = sharedState.installed;
      const activeSlug = sharedState.activeSlug;
      const bubbleOpacity = sharedState.opacity;
      const floatSize = sharedState.size;
      const [floatOk, setFloatOk] = useState(null); // null=pending, true, false
      const [runtime, setRuntime] = useState(null);
      const [rechecking, setRechecking] = useState(false);
      const [recheckDone, setRecheckDone] = useState(false);
      const [cardOpen, setCardOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      const busyRef = useRef(false);
      useEffect(() => { busyRef.current = busy; }, [busy]);
      const [claimError, setClaimError] = useState('');
      const [wantPet, setWantPet] = useState(true);

      // expose the on/off state to the settings page (same store instance)
      useEffect(() => { shared.set({ petOn: wantPet }); }, [wantPet]);
      const openingRef = useRef(false);
      const lastUiEventRef = useRef('');
      const statusRef = useRef({ mode: 'idle', slug: '', task: '', kind: '', opacity: DEFAULT_OPACITY, size: 1 });

      React.useSyncExternalStore(subscribeLocale, getLocaleSnapshot);

      const persistActive = (slug) => { shared.set({ activeSlug: slug }); saveJSON(LS_ACTIVE, slug); };
      // Live preview: state (for the label) + Host POST (for the floating window).
      const persistOpacity = (v) => {
        const next = clampOpacity(v);
        shared.set({ opacity: next });
        saveJSON(LS_OPACITY, next);
        statusRef.current = { ...statusRef.current, opacity: next };
        postStatus();
      };
      const persistSize = (v) => {
        const next = clampSize(v);
        shared.set({ size: next });
        saveJSON(LS_SIZE, next);
        statusRef.current = { ...statusRef.current, size: next };
        postStatus();
      };

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

      const petOnRef = useRef(true);
      useEffect(() => { petOnRef.current = wantPet; }, [wantPet]);

      const applyPetOn = (on) => {
        if (on === petOnRef.current) return;
        if (on && busyRef.current) return; // a spawn is in flight; the next heartbeat re-applies
        if (on) {
          setWantPet(true);
          setFloatOk(null);
          setClaimError('');
          checkRuntime(false);
        } else {
          setWantPet(false);
          setFloatOk(false);
          fetch(`${API}float-close`, { method: 'POST' }).catch(() => {});
        }
        shared.set({ petOn: on });
      };

      const postStatus = () => {
        const s = statusRef.current;
        fetch(`${API}status`, {
          method: 'POST',
          body: JSON.stringify({
            ...s,
            wx: Math.round(window.screenX),
            wy: Math.round(window.screenY),
            ww: Math.round(window.outerWidth),
            wh: Math.round(window.outerHeight),
          }),
        }).then((r) => r.json()).then((d) => {
          if (d && typeof d.petOn === 'boolean') applyPetOn(d.petOn);
        }).catch(() => {});
      };
      useEffect(() => {
        statusRef.current = { mode: status.mode, slug: activeSlug, task: status.task, kind: status.kind, sessionId: status.sessionId, opacity: bubbleOpacity, size: floatSize };
        postStatus();
      }, [status.mode, status.task, status.kind, status.sessionId, activeSlug, bubbleOpacity, floatSize]);
      useEffect(() => {
        window.addEventListener('resize', postStatus);
        return () => window.removeEventListener('resize', postStatus);
      }, []);
      // Heartbeat: the Host holds the pet state in memory only, so after a
      // Host/plugin reload (or a respawned floating window) the pet would sit
      // on "idle" until the session happened to change. A cheap same-origin
      // POST every 10s keeps it converged no matter what restarted.
      useEffect(() => {
        const id = setInterval(postStatus, 10000);
        return () => clearInterval(id);
      }, []);

      const openFloat = async () => {
        // Guard against concurrent opens: the claim button and a re-check can
        // otherwise both pass the liveness check and spawn two pet windows.
        if (openingRef.current) return false;
        openingRef.current = true;
        try {
          const res = await fetch(`${API}float-open`);
          const data = await res.json();
          if (data && data.ok) {
            setFloatOk(true);
            return true;
          }
          throw new Error((data && data.error) || 'float-open failed');
        } catch {
          setFloatOk(false);
          return false;
        } finally {
          openingRef.current = false;
        }
      };

      // ---- runtime resolution: check → ask → install → claim ----------------
      const applyRuntime = (data) => {
        if (!data || data.ok !== true) return;
        setRuntime(data);
      };

      // Ask the Host what is available. `auto` (mount) only pops the card when
      // something is actually missing, so a ready machine just shows the chip.
      // The first call can race the Host's route registration, so retry a few
      // times before giving up silently.
      const checkRuntime = async (auto, attempt = 0) => {
        try {
          const res = await fetch(`${API}runtime/check`, { method: 'POST' });
          const data = await res.json();
          applyRuntime(data);
          const phase = data && data.phase;
          if (!auto || phase === 'missing' || phase === 'outdated' || phase === 'failed') setCardOpen(true);
        } catch {
          if (attempt < 2) setTimeout(() => checkRuntime(auto, attempt + 1), 700);
        }
      };

      const startInstall = async () => {
        setBusy(true);
        setClaimError('');
        // Switch to the progress state immediately; the Host confirms the rest.
        setRuntime((prev) => ({ ...(prev || {}), ok: true, phase: 'downloading', received: 0, total: 0, error: '' }));
        try {
          const res = await fetch(`${API}runtime/install`, { method: 'POST' });
          const data = await res.json();
          // The route answers with its pre-install snapshot; keep the optimistic
          // state (a stale phase here would bounce the card back to the button).
          if (!data || data.ok !== true) checkRuntime(false);
        } catch {
          checkRuntime(false);
        }
        setBusy(false);
      };

      const cancelDownload = async () => {
        try {
          const res = await fetch(`${API}runtime/cancel`, { method: 'POST' });
          applyRuntime(await res.json());
        } catch { /* host unreachable */ }
      };

      const claimPet = async (auto) => {
        setBusy(true);
        setClaimError('');
        const ok = await openFloat();
        setBusy(false);
        if (ok) { setCardOpen(false); return; }
        // Keep a reason visible instead of failing silently, and stop the
        // automatic retry so it cannot loop.
        setClaimError(t('rtClaimFailed'));
        if (auto) setWantPet(false);
        setCardOpen(true);
      };

      const dismissCard = () => { setCardOpen(false); setFloatOk(false); };

      // Check once on mount; nothing opens by itself.
      useEffect(() => {
        const id = setTimeout(() => checkRuntime(true), 250);
        return () => clearTimeout(id);
      }, []);

      // Once the environment is ready the pet appears directly — no claim step.
      // Hiding the pet clears the intent; the 🐾 chip sets it again.
      useEffect(() => {
        if (!wantPet || floatOk === true || busy) return;
        if (!runtime || runtime.phase !== 'ready') return;
        claimPet(true);
      }, [wantPet, floatOk, busy, runtime && runtime.phase]);

      // Poll the Host while the card is doing something.
      useEffect(() => {
        if (!cardOpen) return undefined;
        const phase = runtime && runtime.phase;
        if (phase !== 'downloading' && phase !== 'extracting') return undefined;
        const tick = async () => {
          try {
            const r = await fetch(`${API}runtime`);
            const d = await r.json();
            if (d && d.ok) setRuntime(d);
          } catch { /* host unreachable */ }
        };
        const id = setInterval(tick, 700);
        return () => clearInterval(id);
      }, [cardOpen, runtime && runtime.phase]);

      // Watch child liveness: a dead overlay drops the pet back to the chip.
      useEffect(() => {
        if (floatOk !== true) return undefined;
        const id = setInterval(() => {
          fetch(`${API}float-state`).then((r) => r.json()).then((d) => {
            if (d && d.open === false) setFloatOk(false);
          }).catch(() => {});
        }, 5000);
        return () => clearInterval(id);
      }, [floatOk]);

      // Right-click menu events from the screen pet. Polled fast (350ms):
      // this queue is the only latency between "设置宠物" in the menu and the
      // modal actually appearing, and it is a same-origin no-op request.
      useEffect(() => {
        const id = setInterval(async () => {
          try {
            const r = await fetch(`${API}ui-event`);
            const d = await r.json();
            if (d && d.event && d.event.id !== lastUiEventRef.current) {
              lastUiEventRef.current = d.event.id;
              if (d.event.type === 'open-settings') openPage();
              if (d.event.type === 'open-runtime-card') checkRuntime(false);
              if (d.event.type === 'activate-pet') {
                setWantPet(true);
                setClaimError('');
                checkRuntime(false);
              }
              if (d.event.type === 'set-pet-on') {
                const on = d.event.on !== false;
                if (on) {
                  // floatOk=false would block openFloat; reset it so the pet can come back
                  setWantPet(true);
                  setFloatOk(null);
                  setClaimError('');
                  checkRuntime(false);
                } else {
                  setWantPet(false);
                  setFloatOk(false);
                  // kill the float window right away instead of waiting for the child to notice
                  fetch(`${API}float-close`, { method: 'POST' }).catch(() => {});
                }
              }
              if (d.event.type === 'set-pet') {
                const slug = typeof d.event.slug === 'string' ? d.event.slug : '';
                shared.set({ activeSlug: slug });
                saveJSON(LS_ACTIVE, slug);
                try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ slug }) }).catch(() => {}); } catch { /* ignore */ }
              }
              if (d.event.type === 'open-session' && d.event.sessionId && openSession) {
                try { openSession(d.event.sessionId); } catch (error) { console.error('[desk-pet] openSession failed:', error); }
              }
              if (d.event.type === 'quit-pet') {
                setWantPet(false);
                setFloatOk(false);
                shared.set({ petOn: false });
                try { fetch(`${API}config`, { method: 'POST', body: JSON.stringify({ petOn: false }) }).catch(() => {}); } catch { /* ignore */ }
                setCardOpen(false);
                fetch(`${API}float-close`).catch(() => {});
              }
              fetch(`${API}ui-event`, { method: 'POST', body: JSON.stringify({ ack: d.event.id }) }).catch(() => {});
            }
          } catch { /* host unreachable */ }
        }, 350);
        return () => clearInterval(id);
      }, []);

      const onRemove = async (slug) => {
        try { await fetch(`${API}remove?slug=${encodeURIComponent(slug)}`); } catch { /* keep list as-is */ }
        if (activeSlug === slug) persistActive('');
        await refreshInstalled();
      };

      const showWakeChip = !floatOk && !cardOpen;

      const phase = runtime && runtime.phase;
      const pkgVersion = (runtime && runtime.required) || '';
      const pkg = pkgVersion ? `Electron ${pkgVersion}` : '';
      const totalBytes = (runtime && runtime.total) || 0;
      const gotBytes = (runtime && runtime.received) || 0;
      const pct = totalBytes > 1 ? Math.min(100, Math.round((gotBytes / totalBytes) * 100)) : 0;
      const usedVersion = (runtime && runtime.version) || '';
      const foundVersion = (runtime && runtime.found) || '';

      const cardTitle = {
        checking: t('rtCheckingTitle'),
        missing: t('rtMissingTitle'),
        outdated: t('rtOutdatedTitle'),
        downloading: t('rtDownloadingTitle'),
        extracting: t('rtExtractingTitle'),
        ready: t('rtReadyTitle'),
        failed: t('rtFailedTitle'),
      }[phase] || '';

      // The locale helper returns plain strings, so placeholders are filled here.
      const mbOf = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
      const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] != null ? String(vars[key]) : m));
      const cardBody = (() => {
        if (phase === 'checking') return t('rtCheckingBody');
        if (phase === 'missing') return fill(t('rtMissingBody'), { pkg });
        if (phase === 'outdated') return fill(t('rtOutdatedBody'), { found: foundVersion, required: pkgVersion });
        if (phase === 'downloading') return fill(t('rtDownloadBody'), { pkg });
        if (phase === 'extracting') return t('rtExtractingBody');
        if (phase === 'ready') {
          if (!usedVersion) return t('rtReadyBodyUnknown');
          const local = runtime.source === 'detected' || runtime.source === 'env';
          return fill(t(local ? 'rtReadyBodyLocal' : 'rtReadyBody'), { version: usedVersion });
        }
        if (phase === 'failed') return String((runtime && runtime.error) || '');
        return '';
      })();

      const showBar = phase === 'downloading' || phase === 'extracting' || phase === 'ready';
      const metaText = phase === 'downloading'
        ? `${pct}% · ${mbOf(gotBytes)} / ${mbOf(totalBytes)} MB`
        : '';

      const cardActions = (() => {
        if (phase === 'missing') {
          return [
            h('button', { key: 'dl', className: 'desk-pet-runtime-primary', disabled: busy, onClick: startInstall }, t('rtDownload')),
            h('button', { key: 'x', className: 'desk-pet-runtime-ghost', onClick: dismissCard }, t('rtCancel')),
          ];
        }
        if (phase === 'outdated') {
          return [
            h('button', { key: 'up', className: 'desk-pet-runtime-warn', disabled: busy, onClick: startInstall }, t('rtUpdate')),
            h('button', { key: 'x', className: 'desk-pet-runtime-ghost', onClick: dismissCard }, t('rtCancel')),
          ];
        }
        if (phase === 'downloading' || phase === 'extracting') {
          return [h('button', { key: 'c', className: 'desk-pet-runtime-link', onClick: cancelDownload }, t('rtCancelDownload'))];
        }
        if (phase === 'ready') {
          return [h('button', { key: 'ok', className: 'desk-pet-runtime-primary', disabled: busy, onClick: () => { setWantPet(true); claimPet(false); } }, t('rtRetry'))];
        }
        if (phase === 'failed') {
          return [
            h('button', { key: 'r', className: 'desk-pet-runtime-primary', disabled: busy, onClick: startInstall }, t('rtRetry')),
            h('button', { key: 'x', className: 'desk-pet-runtime-ghost', onClick: dismissCard }, t('rtCancel')),
          ];
        }
        return null;
      })();

      const showCard = cardOpen && !floatOk && phase && (phase !== 'ready' || claimError);

      // The overlay slot lives under a transformed ancestor, so a fixed box is
      // laid out against that ancestor instead of the window. Measure it and
      // place the card at the real window center (same visual as the settings
      // dialog).
      const layerRef = useRef(null);
      const cardRef = useRef(null);
      const placeCard = () => {
        const layer = layerRef.current;
        const card = cardRef.current;
        if (!layer || !card) return;
        const box = layer.getBoundingClientRect();
        const w = card.offsetWidth;
        const h = card.offsetHeight;
        card.style.left = `${(window.innerWidth - w) / 2 - box.left}px`;
        card.style.top = `${(window.innerHeight - h) / 2 - box.top}px`;
      };
      const useIsoLayout = React.useLayoutEffect || React.useEffect;
      useIsoLayout(() => {
        if (!showCard) return undefined;
        placeCard();
        const onChange = () => placeCard();
        window.addEventListener('resize', onChange);
        return () => window.removeEventListener('resize', onChange);
      }, [showCard, phase, claimError, metaText]);

      const runtimeCard = showCard && h('div', { ref: layerRef, className: 'desk-pet-runtime-layer', role: 'presentation' },
        h('div', { ref: cardRef, className: 'desk-pet-runtime', role: 'dialog', 'aria-label': cardTitle },
        h('div', { className: 'desk-pet-runtime-icon' },
          h('svg', { viewBox: '0 0 64 64', 'aria-hidden': true },
            h('rect', { width: 64, height: 64, rx: 14, fill: '#fff4d6' }),
            h('path', { d: 'M17 28 L11 7 L34 19 Z', fill: '#f2b950' }),
            h('path', { d: 'M47 28 L53 7 L30 19 Z', fill: '#f2b950' }),
            h('circle', { cx: 32, cy: 39, r: 20, fill: '#ffd166' }),
            h('ellipse', { cx: 22, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
            h('ellipse', { cx: 42, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
            h('circle', { cx: 25, cy: 36, r: 3, fill: '#3a2c1a' }),
            h('circle', { cx: 39, cy: 36, r: 3, fill: '#3a2c1a' }),
            h('path', { d: 'M28 44 Q32 47 36 44', stroke: '#3a2c1a', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }))),
        h('div', { className: `desk-pet-runtime-title${phase === 'ready' ? ' ok' : ''}${phase === 'failed' ? ' err' : ''}${phase === 'outdated' ? ' warn' : ''}` },
          cardTitle, phase === 'ready' ? ' ✓' : ''),
        cardBody && h('div', { className: 'desk-pet-runtime-body' }, cardBody),
        claimError && h('div', { className: 'desk-pet-runtime-body', style: { color: 'var(--dp-err)' } }, claimError),
        showBar && h('div', { className: `desk-pet-runtime-bar${phase === 'ready' ? ' ok' : ''}` },
          h('i', { style: { width: `${phase === 'ready' ? 100 : pct}%` } })),
        metaText && h('div', { className: 'desk-pet-runtime-meta' }, metaText),
        cardActions && h('div', { className: 'desk-pet-runtime-actions' }, cardActions)));

      return h(React.Fragment, null,
        h('style', null, CSS),
        h(ErrorBoundary, null, h(StatusBridge, { useSessionStatus, useSessions, onStatus: setStatus })),
        runtimeCard);
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'layout'],
      apply(ctx) {
        // During HMR the previous generation's disposers may run after the new
        // apply: a duplicate (ns, locale) registration throws. Tolerate it —
        // the surviving dictionary has the same keys.
        let disposeEn = () => {};
        let disposeZh = () => {};
        try {
          disposeEn = ctx.locale.register('desk-pet', 'en', {
            ariaLabel: 'Pet',
            rtCheckingTitle: 'Checking the environment…',
            rtCheckingBody: 'Usually takes less than a second',
            rtMissingTitle: 'The runtime is needed first',
            rtMissingBody: 'I need the {pkg} runtime before I can come out',
            rtOutdatedTitle: 'The runtime needs an update',
            rtOutdatedBody: 'This machine has Electron {found}, but I need the {required} runtime',
            rtDownloadingTitle: 'Preparing the pet',
            rtDownloadBody: 'Downloading the {pkg} runtime',
            rtExtractingTitle: 'Extracting the runtime',
            rtExtractingBody: 'Almost there…',
            rtReadyTitle: 'Environment ready',
            rtReadyBody: 'Electron {version} is installed',
            rtReadyBodyLocal: 'Using the local Electron {version} — download skipped',
            rtReadyBodyUnknown: 'Environment is in place',
            rtFailedTitle: 'Install failed',
            rtDownload: 'Download',
            rtUpdate: 'Update',
            rtCancel: 'Cancel',
            rtCancelDownload: 'Cancel download',
            rtRetry: 'Retry',
            rtClaimFailed: 'Could not start the pet, please retry',
            menuPet: 'My pets',
            pgPickPet: 'Click a pet to preview',
            pgHeroSub: 'floats above every window and mirrors the session state',
            pgActivate: 'Activate pet',
            petsAvailable: 'pets to adopt',
            currentPet: 'Pet pool',
            appearance: 'Appearance',
            bubbleOpacity: 'Bubble opacity',
            builtinCat: 'Built-in cat',
            active: 'Active',
            use: 'Click to use',
            remove: 'Remove',
            onlineHeading: 'Install from petdex.dev',
            searchPlaceholder: 'Search by name or slug…',
            install: 'Install',
            pgAct_idle: 'Idle',
            pgAct_run: 'Run',
            pgAct_wave: 'Wave',
            pgAct_jump: 'Jump',
            pgCurrent: 'Now: ',
            pgPetsUnit: 'pets',
            pgPetsHint: 'Click to switch; the pet on screen changes immediately',
            pgOpacity: 'Opacity',
            pgSize: 'Size',
            pgSizeSmall: 'S',
            pgSizeMedium: 'M',
            pgSizeLarge: 'L',
            pgPreview: 'Preview',
            pgInstallHint: 'click install, preview it on the right first',
            pgOpenSite: 'Open petdex.dev ↗',
            pgRuntime: 'Runtime',
            pgRuntimeHint: 'The pet runs in its own Electron process; this state comes from the Host',
            pgRuntimeReady: 'Ready',
            pgRuntimeLocal: 'local Electron',
            pgRuntimeDownloaded: 'downloaded runtime',
            pgRuntimeChecking: 'Checking',
            pgRuntimeInstalling: 'Installing',
            pgRuntimeMissing: 'Not ready',
            pgRuntimeFailed: 'Failed',
            pgStatus: 'Status',
            pgVersion: 'Version',
            pgLocation: 'Location',
            pgRecheck: 'Recheck',
            pgRechecking: 'Checking…',
            pgRechecked: 'updated',
            pgAppearanceHint: 'Opacity fades the whole layer (pet + bubble); size scales it',
            installing: 'Installing…',
            installedMark: 'Installed',
            loading: 'Loading gallery…',
            loadFailed: 'Could not reach petdex.dev',
            installFailed: 'Install failed, please retry',
            noResults: 'No pets match',
          });
        } catch { /* duplicate registration during HMR */ }
        try {
          disposeZh = ctx.locale.register('desk-pet', 'zh', {
            ariaLabel: '宠物',
            rtCheckingTitle: '正在检查运行环境…',
            rtCheckingBody: '通常少于 1 秒',
            rtMissingTitle: '需要先准备运行环境',
            rtMissingBody: '我需要先装好 {pkg} 运行时，才能出来陪你',
            rtOutdatedTitle: '运行环境需要更新',
            rtOutdatedBody: '本机的 Electron {found} 太旧了，我需要 {required} 运行时才能正常工作',
            rtDownloadingTitle: '正在准备宠物',
            rtDownloadBody: '正在下载 {pkg} 运行时',
            rtExtractingTitle: '正在解压运行时',
            rtExtractingBody: '马上就好…',
            rtReadyTitle: '环境已就绪',
            rtReadyBody: '已安装 Electron {version}',
            rtReadyBodyLocal: '使用本机 Electron {version}，无需下载',
            rtReadyBodyUnknown: '运行环境已就绪',
            rtFailedTitle: '安装失败',
            rtDownload: '下载',
            rtUpdate: '更新',
            rtCancel: '取消',
            rtCancelDownload: '取消下载',
            rtRetry: '重试',
            rtClaimFailed: '宠物启动失败，请重试',
            menuPet: '我的宠物',
            pgPickPet: '点击左侧宠物预览',
            pgHeroSub: '悬浮在屏幕上，气泡实时显示会话状态',
            pgActivate: '激活宠物',
            petsAvailable: '只宠物等你领养',
            currentPet: '宠物池',
            appearance: '外观',
            bubbleOpacity: '气泡透明度',
            builtinCat: '内置小猫',
            active: '使用中',
            use: '点击使用',
            remove: '移除',
            onlineHeading: '从 petdex.dev 安装',
            searchPlaceholder: '按名称或 slug 搜索…',
            install: '安装',
            pgAct_idle: '待机',
            pgAct_run: '跑动',
            pgAct_wave: '挥手',
            pgAct_jump: '跳跃',
            pgCurrent: '当前：',
            pgPetsUnit: '只',
            pgPetsHint: '点一下切换，切换后屏幕上的宠物会立即换装',
            pgOpacity: '透明度',
            pgSize: '大小',
            pgSizeSmall: '小',
            pgSizeMedium: '中',
            pgSizeLarge: '大',
            pgPreview: '预览',
            pgInstallHint: '搜索后点「安装」，右侧先试看动作',
            pgOpenSite: '打开 petdex.dev ↗',
            pgRuntime: '运行环境',
            pgRuntimeHint: '宠物跑在独立的 Electron 进程里，以下状态来自宿主实时检测',
            pgRuntimeReady: '已就绪',
            pgRuntimeLocal: '使用本机 Electron',
            pgRuntimeDownloaded: '使用已下载的运行时',
            pgRuntimeChecking: '检测中',
            pgRuntimeInstalling: '安装中',
            pgRuntimeMissing: '未就绪',
            pgRuntimeFailed: '安装失败',
            pgStatus: '状态',
            pgVersion: '版本',
            pgLocation: '位置',
            pgRecheck: '重新检测',
            pgRechecking: '检测中…',
            pgRechecked: '已更新',
            pgAppearanceHint: '透明度作用于整个悬浮层（宠物 + 气泡），大小控制整体缩放',
            installing: '安装中…',
            installedMark: '已安装',
            loading: '正在加载图鉴…',
            loadFailed: '无法连接 petdex.dev',
            installFailed: '安装失败，请重试',
            noResults: '没有匹配的宠物',
          });
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

        /** Sidebar icon for the settings page. */
        function PetSidebarIcon({ size, active }) {
          return h('span', {
            style: { fontSize: Math.round((size || 18) * 0.68), lineHeight: 1, opacity: active ? 1 : 0.72 },
            'aria-hidden': true,
          }, '🐾');
        }

        function PetPageEntry() {
          return h(PetPage, { t, onBack: () => { try { ctx.layout.selectPanel(null); } catch { /* ignore */ } } });
        }

        const reportError = (where, error) => {
          try {
            fetch(`${API}ui-event`, {
              method: 'POST',
              body: JSON.stringify({ type: `err:${where}:${String((error && error.message) || error).slice(0, 300)}` }),
            }).catch(() => {});
          } catch { /* ignore */ }
        };
        // Every injection is an effect: disabling/uninstalling the plugin
        // must remove the sidebar entry, the page and the overlay with it.
        ctx.effect(() => {
          try {
            return ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
              name: 'sidebar.panellist',
              id: 'desk-pet',
              order: 20,
              label: () => t('menuPet'),
            }, PetSidebarIcon));
          } catch (error) { reportError('sidebar', error); return undefined; }
        });
        ctx.effect(() => {
          try {
            return ctx.slots.inject('main', () => ctx.slots.register({
              name: 'main',
              key: 'desk-pet',
            }, PetPageEntry));
          } catch (error) { reportError('main', error); return undefined; }
        });
        ctx.effect(() => {
          try {
            return ctx.slots.inject('shell.overlay', () => ctx.slots.register({
              name: 'shell.overlay',
              id: 'desk-pet',
              order: 0,
              label: () => t('ariaLabel'),
            }, DeskPetEntry));
          } catch (error) { reportError('overlay', error); return undefined; }
        });
      },
    };
  },
});
