import React from 'react';
import { h, PetThumb, PetPreview, spriteUrl, CAT_SVG } from './shared';

const { useCallback, useEffect, useRef, useState } = React;

// 3D 环绕场景参数：与设计稿 C6 对齐（步距 190 / 旋转 14° / 纵深 70 / 抬升 6）
const ITEM_H = 134;
const MEDIA_H = 108;

const CFG = {
  step: 160,
  rotate: 14,
  depth: 70,
  lift: 6,
  scale: 0.55,
  fade: 0.26,
  minOpacity: 0.12,
  hideAfter: 2.45,
};

function rel(k, n) {
  let value = ((k % n) + n) % n;
  if (value > n / 2) value -= n;
  return value;
}

function paint(el, k) {
  const a = Math.abs(k);
  const scale = 1 / (1 + CFG.scale * a);
  // 外层只做 2D 位移/缩放：命中区域是平的，不受 3D 透视/rotateY 影响。
  el.style.transform = `translateX(${(k * CFG.step).toFixed(1)}px) translateY(${(-a * CFG.lift).toFixed(1)}px) scale(${scale.toFixed(3)})`;
  el.style.opacity = String(a > CFG.hideAfter ? 0 : Math.max(CFG.minOpacity, 1 - a * CFG.fade));
  el.style.pointerEvents = a > CFG.hideAfter ? 'none' : '';
  el.style.zIndex = String(100 - Math.round(a * 10));
  // 内层负责 3D 观感（rotateY / 纵深），不参与命中。
  const media = el.firstElementChild;
  if (media) {
    const rot = -Math.max(-1.6, Math.min(1.6, k)) * CFG.rotate;
    media.style.transform = `rotateY(${rot.toFixed(2)}deg) translateZ(${(-a * CFG.depth).toFixed(1)}px)`;
  }
  // 名字/状态不跟着 3D 缩放走，保持旧版卡片的字号一致
  const label = el.querySelector('.dpp-pet-label');
  if (label) label.style.transform = `scale(${(1 / scale).toFixed(3)})`;
  // 名字行固定 20px、间距固定 10px：脚底在屏幕坐标里对齐，间距不随缩放变化。
  const floor = 30;
  const mediaEl = el.querySelector('.dpp-pet-media');
  const mediaBottom = floor / scale;
  if (mediaEl) mediaEl.style.bottom = `${mediaBottom.toFixed(2)}px`;
  const shadowEl = el.querySelector('.dpp-pet-shadow');
  if (shadowEl) shadowEl.style.bottom = `${((floor - 2) / scale).toFixed(2)}px`;
  // 移除按钮钉在宠物画框右上角（跟随画框位置），并反向缩放保持屏幕大小一致。
  const removeBtn = el.querySelector('.x');
  if (removeBtn) {
    // 贴着宠物画框右上角（外侧 2px），距离随宠物等比缩放，视觉间隔一致。
    const mediaTop = ITEM_H - mediaBottom - MEDIA_H;
    const off = 2 / scale;
    removeBtn.style.top = `${(mediaTop - off).toFixed(2)}px`;
    removeBtn.style.right = `${(13.5 - off).toFixed(2)}px`;
    removeBtn.style.transform = `scale(${(1 / scale).toFixed(3)})`;
  }
}

/**
 * 宠物显示区：中央大宠物 + 两侧缩小的宠物，环绕排列。
 * 点击选宠物、左右键切换、拖拽/滚轮旋转，松手吸附到最近一只并把舞台切过去。
 */
export function PetScene(props) {
  const { pets, activeSlug, anim, removeLabel, activeLabel, onPick, onRemove } = props;
  const sceneRef = useRef(null);
  const itemRefs = useRef([]);
  const offsetRef = useRef(0);
  const dragRef = useRef(null);
  const wheelRef = useRef(0);
  const suppressRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const layout = useCallback(() => {
    const els = itemRefs.current.filter(Boolean);
    const n = els.length;
    if (!n) return;
    els.forEach((el, i) => paint(el, rel(i - offsetRef.current, n)));
  }, []);

  // 首帧不播放入场动画，避免所有宠物从中间飞散
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    scene.classList.add('no-anim');
    const id = requestAnimationFrame(() => requestAnimationFrame(() => scene.classList.remove('no-anim')));
    return () => cancelAnimationFrame(id);
  }, []);

  // 选中的宠物始终居中
  useEffect(() => {
    const index = pets.findIndex((pet) => pet.slug === activeSlug);
    if (index < 0) return;
    offsetRef.current += rel(index - offsetRef.current, pets.length);
    layout();
  }, [activeSlug, pets.length, layout]);

  useEffect(() => {
    layout();
  }, [pets, layout]);

  const pick = (slug) => {
    onPick(slug);
  };

  const settle = () => {
    const n = pets.length;
    if (!n) return;
    const target = Math.round(offsetRef.current);
    offsetRef.current = target;
    layout();
    const index = ((target % n) + n) % n;
    if (pets[index].slug !== activeSlug) pick(pets[index].slug);
  };

  const onPointerDown = (event) => {
    if ((event.button === undefined ? 0 : event.button) !== 0) return;
    // 移除按钮自己处理点击，不进入拖拽流程
    if (event.target && event.target.closest && event.target.closest('.x')) return;
    suppressRef.current = false;
    const item = event.target && event.target.closest ? event.target.closest('.dpp-pet') : null;
    dragRef.current = {
      x: event.clientX,
      start: offsetRef.current,
      id: event.pointerId,
      moved: false,
      slug: item ? item.getAttribute('data-slug') || '' : null,
    };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) <= 4) return;
      drag.moved = true;
      setDragging(true);
      // 只有确认在拖拽时才捕获指针，否则 pointerup 会被重定向到场景，
      // 导致宠物自身的 click 不触发（点击无法切换）。
      const scene = sceneRef.current;
      if (scene && scene.setPointerCapture) scene.setPointerCapture(drag.id);
    }
    offsetRef.current = drag.start - dx / CFG.step;
    layout();
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      suppressRef.current = true;
      window.setTimeout(() => { suppressRef.current = false; }, 0);
      setDragging(false);
      settle();
      return;
    }
    // 没有发生拖动：按“点击”处理，直接看 pointerup 落在哪只宠物上。
    // 不依赖 click（3D 变换 + 指针捕获下 click 的目标可能被改写）。
    const el = event && event.target && event.target.closest ? event.target.closest('.dpp-pet') : null;
    const slug = el ? el.getAttribute('data-slug') || '' : drag.slug;
    if (slug === null || slug === undefined) return;
    suppressRef.current = true;
    window.setTimeout(() => { suppressRef.current = false; }, 0);
    pick(slug);
  };

  const onWheel = (event) => {
    if (Math.abs(event.deltaY) < 2 && Math.abs(event.deltaX) < 2) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    offsetRef.current += delta > 0 ? 0.5 : -0.5;
    layout();
    window.clearTimeout(wheelRef.current);
    wheelRef.current = window.setTimeout(settle, 120);
  };

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const n = pets.length;
    if (!n) return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const index = ((Math.round(offsetRef.current) + step) % n + n) % n;
    pick(pets[index].slug);
  };

  const onItemClick = (event, slug) => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    if (event.target.closest && event.target.closest('.x')) return;
    pick(slug);
  };

  const onRemoveClick = (event, slug) => {
    event.stopPropagation();
    onRemove(slug);
  };

  const onSceneClick = (event) => {
    // 兜底：无论事件落在哪一层，只要冒泡到场景，就按最近的宠物切换。
    const el = event.target && event.target.closest ? event.target.closest('.dpp-pet') : null;
    if (!el) return;
    if (event.target.closest && event.target.closest('.x')) return;
    pick(el.getAttribute('data-slug') || '');
  };

  return h('div', {
    ref: sceneRef,
    className: `dpp-scene${dragging ? ' dragging' : ''}`,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onClick: onSceneClick,
    onWheel,
    onKeyDown,
  }, pets.map((pet, index) => {
    const active = pet.slug === activeSlug;
    return h('div', {
      key: pet.slug || 'builtin',
      ref: (el) => { itemRefs.current[index] = el; },
      className: `dpp-pet${active ? ' active' : ''}`,
      role: 'button',
      tabIndex: active ? 0 : -1,
      'aria-label': pet.name,
      'aria-pressed': active ? 'true' : 'false',
      'data-slug': pet.slug,
      onClick: (event) => onItemClick(event, pet.slug),
    },
    h('span', { className: 'dpp-pet-shadow' }),
    h('span', { className: 'dpp-pet-media' },
      !pet.slug
        ? h('span', { className: 'dpp-builtin' }, CAT_SVG)
        : active
          ? h(PetPreview, { slug: pet.slug, anim, px: 99 })
          : h(PetThumb, { url: spriteUrl(pet.slug), size: 99 })),
    h('span', { className: 'dpp-pet-label', 'aria-hidden': 'true' },
      h('span', { className: 'dpp-pet-name' },
        active ? h('span', { className: 'dpp-pet-dot' }) : null,
        pet.name)),
    pet.slug
      ? h('button', {
        type: 'button',
        className: 'x',
        style: { borderRadius: 0 },
        'aria-label': removeLabel,
        onClick: (event) => onRemoveClick(event, pet.slug),
      }, '✕')
      : null);
  }));
}
