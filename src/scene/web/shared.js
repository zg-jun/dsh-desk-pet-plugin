import React from 'react';
import * as core from '../../core/browser';
import { catIcon } from '../../assets/cat';

export const h = React.createElement;
const { useEffect, useRef, useState } = React;


export const API = `${core.API_BASE}/`;
export const LS_ACTIVE = 'desk-pet:active';
export const LS_OPACITY = 'desk-pet:opacity-v2';
export const LS_SIZE = 'desk-pet:size-v2';
export const DEFAULT_OPACITY = 1;
export const clampOpacity = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1, Math.max(0.3, n)) : DEFAULT_OPACITY;
    };
export const clampSize = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(1.3, Math.max(0.75, n)) : 1;
    };

    // The pet itself lives ONLY on the screen (fullscreen transparent overlay
    // spawned by the Host). This client is deliberately thin: it hosts the
    // Petdex settings modal, pushes live session status to the Host, and
    // consumes right-click-menu events from the screen pet.


export function spriteUrl(slug) {
      return `${API}pet/${slug}/sprite`;
    }
export function thumbUrl(remoteUrl) {
      return `${API}asset?url=${encodeURIComponent(remoteUrl)}`;
    }
export function loadJSON(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    }
export function saveJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota or privacy mode */ }
    }
export function preloadImage(src) {
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
export let manifestCache = null;
    let manifestAt = 0;
    let manifestPending = null;
export function fetchManifest() {
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
export function manifestIsFresh() {
      return Array.isArray(manifestCache) && Date.now() - manifestAt < MANIFEST_TTL;
    }

const FRAME_RATIO = 208 / 192;

    // ---- static thumbnail (first idle frame), proxy-first with direct fallback ----
    // Cache the RENDERED first frame, not the decoded sheet: 20 full sheets at
    // 1536×1872 are ~11 MiB each (≈219 MiB); a 2× thumbnail is ≈20 KiB.
const thumbCache = new core.LruCache(40);
export function PetThumb({ url, fallbackUrl, size }) {
      const ref = useRef(null);
      useEffect(() => {
        let cancelled = false;
        const key = `${url}|${size}|${window.devicePixelRatio || 1}`;
        const paint = (frame) => {
          if (cancelled || !ref.current) return;
          const c = ref.current;
          c.width = frame.width;
          c.height = frame.height;
          c.style.height = `${frame.cssHeight}px`;
          const x = c.getContext('2d');
          x.clearRect(0, 0, c.width, c.height);
          x.drawImage(frame.source, 0, 0);
        };
        const cached = thumbCache.get(key);
        if (cached) {
          paint(cached);
          return () => { cancelled = true; };
        }
        const attempt = fallbackUrl
          ? preloadImage(url).catch(() => preloadImage(fallbackUrl))
          : preloadImage(url);
        attempt.then((img) => {
          if (cancelled || !ref.current || !img.naturalWidth) return;
          const atlas = core.createAtlas(img.naturalWidth, img.naturalHeight);
          const rect = core.frameRect(atlas, 'idle', 0);
          const dpr = window.devicePixelRatio || 1;
          const height = Math.round(size * atlas.ratio);
          const off = document.createElement('canvas');
          off.width = Math.round(size * dpr);
          off.height = Math.round(height * dpr);
          off.getContext('2d').drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, off.width, off.height);
          const frame = { source: off, width: off.width, height: off.height, cssHeight: height };
          thumbCache.set(key, frame);
          paint(frame);
        }).catch(() => {});
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
export const shared = (() => {
      let state = {
        installed: [],
        activeSlug: loadJSON(LS_ACTIVE, ''),
        opacity: clampOpacity(loadJSON(LS_OPACITY, DEFAULT_OPACITY)),
        size: clampSize(loadJSON(LS_SIZE, 1)),
        runtime: null,
        petOn: null,
      };
      const subs = new Set();
      return {
        get: () => state,
        set: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn()); },
        subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
      };
    })();
export const useShared = () => React.useSyncExternalStore(shared.subscribe, shared.get, shared.get);

    // ---- petdex settings modal ----
    // ---- settings page ---------------------------------------------------
export const ACTIONS = [
      { anim: 'idle', key: 'idle' },
      { anim: 'running-right', key: 'run' },
      { anim: 'waving', key: 'wave' },
      { anim: 'jumping', key: 'jump' },
    ];
export const PET_SIZES = [
      { value: 0.75, key: 'small', zh: '小', en: 'S' },
      { value: 1, key: 'medium', zh: '中', en: 'M' },
      { value: 1.3, key: 'large', zh: '大', en: 'L' },
    ];
export const PET_OPACITIES = [0.3, 0.6, 0.9, 1];

    /** Loops one animation of a petdex sheet using the shared player timeline. */
export function PetPreview({ slug, url, anim, px, active, onReady, onError }) {
      const ref = useRef(null);
      const callbacks = useRef({});
      callbacks.current = { onReady, onError };
      useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !slug) return undefined;
        // 切换宠物时先清空上一张，避免加载期间还看到旧画面。
        try { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); } catch { /* ignore */ }
        let cancelled = false;
        let raf = 0;
        let sheet = null;
        let player = null;
        let last = 0;
        let lastKey = '';
        const dpr = window.devicePixelRatio || 1;
        const ctx = canvas.getContext('2d');

        const paint = () => {
          if (!sheet || !player) return;
          const key = player.animation + ':' + player.frameIndex;
          if (key === lastKey) return;
          lastKey = key;
          const rect = player.rect();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(sheet, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
        };

        const loop = (ts) => {
          if (cancelled || !player) return;
          if (!last) last = ts;
          player.advance(ts - last);
          last = ts;
          paint();
          raf = requestAnimationFrame(loop);
        };

        const img = new Image();
        // 上游 CDN 可能一直不返回：超时后回落到失败态，避免无限转圈；晚到仍会正常绘制。
        const timeout = setTimeout(() => {
          if (!cancelled && !sheet && callbacks.current.onError) callbacks.current.onError();
        }, 8000);
        img.onload = () => {
          clearTimeout(timeout);
          if (cancelled) return;
          sheet = img;
          const atlas = core.createAtlas(img.naturalWidth, img.naturalHeight);
          player = new core.PetPlayer(atlas);
          player.setAnimation(anim);
          canvas.width = Math.round(px * dpr);
          canvas.height = Math.round(px * atlas.ratio * dpr);
          canvas.style.height = `${Math.round(px * atlas.ratio)}px`;
          paint();
          if (callbacks.current.onReady) callbacks.current.onReady();
          raf = requestAnimationFrame(loop);
        };
        img.onerror = () => { clearTimeout(timeout); if (callbacks.current.onError) callbacks.current.onError(); };
        img.src = url || spriteUrl(slug);
        return () => { cancelled = true; clearTimeout(timeout); if (raf) cancelAnimationFrame(raf); };
      }, [slug, url, anim, px]);
      if (active) return h('div', { style: { fontSize: px * 0.62, lineHeight: 1 } }, '🐱');
      return h('canvas', { ref, 'aria-hidden': true, style: { width: px, height: Math.round(px * FRAME_RATIO), display: 'block' } });
    }

export const CAT_SVG = catIcon(h, 52);
