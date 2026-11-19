'use strict';
// Screen-pet renderer v3: the pet IS the small floating window (petdex
// Dragging is main-process cursor-follow; position lives in the window itself and persists via the Host/child. No per-display handoff.
var qs = new URLSearchParams(location.search);
// Dev-only counters for scripts/bench.mjs; inactive unless ?bench=1.
var BENCH = qs.get('bench') === '1' ? { renders: 0, draws: 0, frameMs: [] } : null;
if (BENCH) window.__petStats = BENCH;
var SIZE = 96, RATIO = 208 / 192, H = Math.round(SIZE * RATIO);
var core = window.PetCore;
if (!core) throw new Error('PetCore bundle missing');

// ---- DOM ----
var pet = document.getElementById('pet');
var bob = document.getElementById('bob');
var halo = document.getElementById('halo');
var canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
var cat = /** @type {HTMLElement} */ (document.getElementById('cat'));
var eyesOpen = document.getElementById('eyesOpen');
var eyesHappy = document.getElementById('eyesHappy');
var jumpSEl = document.getElementById('jumpS');
var jumpAEl = document.getElementById('jumpA');
var actBubble = document.getElementById('actBubble');
var btxtAEl = document.getElementById('btxtA');
var locateAEl = document.getElementById('locateA');
var dotAEl = document.getElementById('dotA');
var sumAEl = document.getElementById('sumA');
var sumMoreEl = document.getElementById('sumMore');
var qWrapEl = /** @type {HTMLElement} */ (sumAEl.parentElement);
var chipsAEl = document.getElementById('chipsA');
var descAEl = document.getElementById('descA');
var sumPlainEl = document.getElementById('sumPlain');
var footAEl = document.getElementById('footA');
var sumExpanded = false;
var statusBubble = /** @type {HTMLElement} */ (document.querySelector('.bubble.status'));
var alertBubble = /** @type {HTMLElement} */ (document.querySelector('.bubble.alert'));
var greetBubble = /** @type {HTMLElement} */ (document.querySelector('.bubble.greet'));
var btxtEl = document.getElementById('btxt');
var btxt2El = document.getElementById('btxt2');
var btxt3El = document.getElementById('btxt3');
var ctx2d = canvas.getContext('2d', { willReadFrequently: true });
ctx2d.imageSmoothingEnabled = true;
ctx2d.imageSmoothingQuality = 'high';
// 悬浮宠物会被 --pet-scale 放大到 1.3；位图按最大倍率超采样，
// 这样任何缩放下 CSS 都不会把位图再放大一次（那会造成两次模糊）。
var MAX_PET_SCALE = 1.3;
var dpr = window.devicePixelRatio || 1;
function syncCanvasScale() {
  var next = window.devicePixelRatio || 1;
  var w = Math.round(SIZE * MAX_PET_SCALE * next);
  var h = Math.round(H * MAX_PET_SCALE * next);
  if (next === dpr && canvas.width === w && canvas.height === h) return;
  dpr = next;
  canvas.width = w; canvas.height = h;
  canvas.style.width = SIZE + 'px'; canvas.style.height = H + 'px';
  lastDrawKey = '';  // 强制重绘一次
}
syncCanvasScale();

// ---- click-through: only the sprite and visible bubbles are interactive ----
var interactive = false;
function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  if (window.deskPet && window.deskPet.setInteractive) window.deskPet.setInteractive(on);
}
function spriteHit(x, y) {
  // 内置小猫用 SVG（canvas 此时是 display:none，rect 为空），必须换元素取框。
  var box = img ? canvas : cat;
  var r = box.getBoundingClientRect();
  if (!r.width || !r.height) r = pet.getBoundingClientRect();
  if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return false;
  if (!img) return true; // the built-in SVG cat fills its box
  try {
    var px = Math.floor((x - r.left) * canvas.width / r.width);
    var py = Math.floor((y - r.top) * canvas.height / r.height);
    return ctx2d.getImageData(px, py, 1, 1).data[3] > 16;
  } catch (e) { return false; }
}
// Bubbles are rounded rects (18px radius): their transparent corners must
// still pass clicks through, the filled area must not.
var BUBBLE_RADIUS = 18;
function roundRectHit(el, x, y) {
  var r = el.getBoundingClientRect();
  if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return false;
  var rr = Math.min(BUBBLE_RADIUS, r.width / 2, r.height / 2);
  var cx = x - r.left;
  var cy = y - r.top;
  if (cx >= rr && cx <= r.width - rr) return true;
  if (cy >= rr && cy <= r.height - rr) return true;
  var kx = cx < rr ? rr : r.width - rr;
  var ky = cy < rr ? rr : r.height - rr;
  var dx = cx - kx;
  var dy = cy - ky;
  return dx * dx + dy * dy <= rr * rr;
}
function anyBubbleHit(x, y) {
  var bubbles = [statusBubble, alertBubble, greetBubble, actBubble];
  for (var i = 0; i < bubbles.length; i += 1) {
    var b = bubbles[i];
    if (b.style.display === 'none') continue;
    if (roundRectHit(b, x, y)) return true;
  }
  return false;
}
document.addEventListener('mousemove', function (e) {
  if (dragging) { setInteractive(true); return; }
  setInteractive(anyBubbleHit(e.clientX, e.clientY) || spriteHit(e.clientX, e.clientY));
});
// leaving the window must release interaction or it would stay stuck
document.addEventListener('mouseleave', function () {
  if (dragging) return;
  setInteractive(false);
});
window.addEventListener('blur', function () {
  if (dragging) return;
  setInteractive(false);
});

// ---- i18n ----
var zh = (navigator.language || '').toLowerCase().indexOf('zh') === 0;
var GREETS = zh ? ['你好呀！👋', '需要帮忙吗？', '再摸摸我！', '我在装睡呢~']
                : ['Hi there! 👋', 'Need a hand?', 'Pet me again!', 'Zzz... just kidding!'];
var STATUS_TEXT = {
  working: zh ? '正在工作…' : 'Working…',
  waiting: zh ? '等你操作' : 'Waiting for you',
  done: zh ? '已完成' : 'Finished'
};
// 工作中计时：与 DSH 会话底部 RunningStatus 同一套规则
// （1s 刷新、至少 1 秒、小时/分/秒中文单位）。
var runClock = core.idleClock();
var runSessionId = '';
function runLabel() {
  var elapsed = core.runElapsed(runClock, Date.now());
  if (!elapsed) return '';
  return core.formatRunDuration(Math.max(1000, elapsed), zh ? 'zh' : 'en');
}
var KIND_TEXT = {
  approval: zh ? '有审批等你处理' : 'Approval needed',
  question: zh ? '有问题等你回答' : 'Question for you',
  'plan-review': zh ? '有计划等你评审' : 'Plan to review'
};

// Geometry, frame timings and mode→presentation live in the shared core.

// ---- sprite cache + seamless swap ----
var img = null, slug = '';
var imgCache = new core.LruCache(3);
var player = null;
// True while a newly selected pet's sheet is downloading: the previous pet
// stays on screen (no flash of the built-in cat) and the bubble spins.
var switching = false, switchTimer = null;
function endSwitching() {
  if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; }
  if (!switching) return;
  switching = false;
  render();
}
function applySprite(image) {
  img = image;
  player = new core.PetPlayer(core.createAtlas(image.naturalWidth, image.naturalHeight));
  player.setAnimation(currentAnim);
  syncPetView();
  last = 0;
  lastDrawKey = '';
  scheduleDraw(0);
  render();
}
function loadPet(s) {
  slug = s;
  if (!s) { img = null; player = null; switching = false; syncPetView(); render(); return; }
  var cached = imgCache.get(s);
  if (cached) { switching = false; applySprite(cached); return; }
  switching = true;
  if (switchTimer) clearTimeout(switchTimer);
  // A hung download must not leave a permanent spinner.
  switchTimer = setTimeout(endSwitching, 12000);
  render();
  var next = new Image();
  next.onload = function () {
    imgCache.set(s, next);
    if (slug === s) {
      switching = false;
      if (switchTimer) { clearTimeout(switchTimer); switchTimer = null; }
      applySprite(next);
    }
  };
  next.onerror = function () {
    // Keep whatever was on screen (previous pet or built-in cat) rather than
    // flashing an empty window for a broken sprite.
    if (slug === s) endSwitching();
  };
  next.src = core.API_BASE + '/pet/' + encodeURIComponent(s) + '/sprite';
}
function syncPetView() {
  canvas.style.display = img ? 'block' : 'none';
  cat.style.display = img ? 'none' : 'block';
}

// ---- view state ----
var mode = 'idle', kind = '', taskText = '', currentSessionId = '';
// Bubble alpha, driven live by the settings slider (Host round-trips it).
var petScale = 1;
// Whole-layer alpha and scale (settings page sliders): the bubble keeps its
// own alpha var so older hosts still work.
function applyLayerAlpha(a) {
  // One layer owns the fade: #pet's opacity covers the pet and every bubble,
  // so a second opacity on .bubble would square the slider value.
  document.documentElement.style.setProperty('--pet-alpha', String(a));
}
function applyLayerScale(k) {
  var clamped = Math.min(1.3, Math.max(0.75, k));
  if (clamped === petScale) return;
  petScale = clamped;
  document.documentElement.style.setProperty('--pet-scale', String(clamped));
  // The window grows/shrinks through the same fit path, scaled exactly once.
  fitWindowToContent();
}
var greetUntil = 0, dragging = false, dragMoved = false, lastDir = 1, pending = null;
// 会话入口文案单一来源：状态气泡、警报气泡、动作卡共用。
function jumpLabel() { return zh ? '打开会话 ›' : 'Open session ›'; }

// 状态词弱化、任务标题加强：同一个气泡里标题必须是视觉重点。
function setBubbleText(el, statusText, task) {
  var parts = [['st', statusText]];
  if (task) parts.push(['sp', ' · '], ['tt', task]);
  el.textContent = '';
  parts.forEach(function (part) {
    var span = document.createElement('span');
    span.className = part[0];
    span.textContent = part[1];
    el.appendChild(span);
  });
}

function hexA(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// signature-diffed render: only touch the DOM when the presentation changes
var lastSig = '';
function paintDot(el, color) {
  var dot = el.classList && el.classList.contains('dot') ? el : el.querySelector('.dot');
  if (dot) dot.style.setProperty('--dot-c', color);
}
// A hidden bubble must not keep the previous state's text or classes: the next
// snapshot (and the window fit) should see an empty shell, not stale content.
function clearBubble(el) {
  if (el === statusBubble) {
    btxtEl.textContent = '';
    jumpSEl.textContent = '';
    el.classList.remove('loading', 'clickable', 'mode-done');
  } else if (el === alertBubble) {
    btxt2El.textContent = '';
    jumpAEl.textContent = '';
    el.classList.remove('clickable');
  } else if (el === actBubble) {
    btxtAEl.textContent = '';
    locateAEl.textContent = '';
    sumAEl.textContent = '';
    chipsAEl.textContent = '';
    descAEl.textContent = '';
    descAEl.classList.remove('on');
    sumPlainEl.textContent = '';
    sumPlainEl.classList.remove('on');
    footAEl.textContent = '';
    footAEl.classList.remove('on');
    qWrapEl.classList.remove('expanded', 'long');
    sumMoreEl.hidden = true;
    el.classList.remove('clickable', 'expanded');
  } else if (el === greetBubble) {
    btxt3El.textContent = '';
  }
}
/** Show/hide a bubble, clearing on the visible -> hidden edge only. */
function setBubbleVisible(el, visible) {
  var was = el.style.display !== 'none';
  el.style.display = visible ? 'flex' : 'none';
  if (!visible) {
    // clickable may have been toggled earlier this frame; a hidden bubble must
    // not keep it even when it was already hidden before the render.
    el.classList.remove('clickable');
    if (was) clearBubble(el);
  }
}
function ensureBubbleMore(bubble) {
  var more = bubble.querySelector('.bubble-more');
  if (!more) {
    more = document.createElement('button');
    more.type = 'button';
    more.className = 'bubble-more';
    more.hidden = true;
    (bubble.querySelector('.bubble-main') || bubble).appendChild(more);
  }
  more.onclick = function (e) {
    e.preventDefault();
    e.stopPropagation();
    var expanded = bubble.classList.toggle('expanded');
    more.textContent = expanded ? (zh ? '收起' : 'Show less') : (zh ? '展开全文' : 'Show more');
    fitWindowToContent();
  };
  return more;
}
function syncBubbleMore(bubble, textEl) {
  var more = ensureBubbleMore(bubble);
  var long = textEl.scrollHeight > textEl.clientHeight + 1 || (textEl.textContent || '').length > 60;
  bubble.classList.toggle('has-more', long);
  if (!long) {
    bubble.classList.remove('expanded');
    more.hidden = true;
    more.textContent = zh ? '展开全文' : 'Show more';
    return;
  }
  more.hidden = false;
  more.textContent = bubble.classList.contains('expanded')
    ? (zh ? '收起' : 'Show less')
    : (zh ? '展开全文' : 'Show more');
}
sumMoreEl.addEventListener('click', function (e) {
  e.preventDefault();
  e.stopPropagation();
  sumExpanded = !sumExpanded;
  qWrapEl.classList.toggle('expanded', sumExpanded);
  sumMoreEl.textContent = sumExpanded ? (zh ? '收起' : 'Show less') : (zh ? '展开全文' : 'Show more');
  fitWindowToContent();
});
function syncActSummaryMore() {
  var len = (sumAEl.textContent || '').length;
  var long = len > 48 || (len > 24 && sumAEl.scrollWidth > sumAEl.clientWidth + 1);
  qWrapEl.classList.toggle('long', long);
  sumMoreEl.hidden = !long;
  sumMoreEl.textContent = sumExpanded ? (zh ? '收起' : 'Show less') : (zh ? '展开全文' : 'Show more');
}

function syncBubbleChrome(now, bubbleKind, dotColor) {
  var showingHint = hintUntil > now;
  var showStatus = !showingHint && (bubbleKind === 'status' || bubbleKind === 'switch');
  // Only a bubble that can actually reach a session is interactive: it then
  // takes pointer events (hand cursor + click), otherwise it stays click-through.
  var clickable = !!currentSessionId;
  statusBubble.classList.toggle('clickable', clickable);
  alertBubble.classList.toggle('clickable', clickable);
  setBubbleVisible(greetBubble, bubbleKind === 'greet');
  var hasPending = pending && pending.sessionId && bubbleKind === 'alert';
  setBubbleVisible(alertBubble, false);
  setBubbleVisible(statusBubble, !showingHint && !hasPending && showStatus);
  var actVisible = !showingHint && hasPending;
  setBubbleVisible(actBubble, actVisible);
  // the actionable bubble must receive clicks; without this class every
  // button and the locate link are dead (pointer-events: none by default)
  actBubble.classList.toggle('clickable', actVisible);
  fitWindowToContent();
  if (bubbleKind === 'alert' && !hasPending) {
    setBubbleText(btxt2El, KIND_TEXT[kind] || STATUS_TEXT.waiting, taskText);
    jumpAEl.textContent = jumpLabel();
    paintDot(alertBubble, dotColor);
    setBubbleVisible(alertBubble, true);
    syncBubbleMore(alertBubble, btxt2El);
  }
  if (hasPending) renderActBubble();
  if (bubbleKind === 'switch') {
    btxtEl.textContent = zh ? '换装中…' : 'Switching…';
    statusBubble.classList.add('loading');
  } else if (bubbleKind === 'status') {
    var label = STATUS_TEXT[mode];
    var run = runLabel();
    if (run) {
      // 计时与 DSH 底部同源同格式，但保留会话标题。
      label = zh
        ? (runClock.phase === 'done' ? '已完成，用时 ' + run : '正在工作，用时 ' + run)
        : (runClock.phase === 'done' ? 'Finished in ' + run : 'Working for ' + run);
    }
    setBubbleText(btxtEl, label, taskText);
    jumpSEl.textContent = jumpLabel();
    syncBubbleMore(statusBubble, btxtEl);
    statusBubble.classList.toggle('mode-done', mode === 'done');
    paintDot(statusBubble, dotColor);
    statusBubble.classList.remove('loading');
  } else {
    statusBubble.classList.remove('loading');
  }
}

function syncPetVisual(view, anim, now) {
  halo.style.display = view.halo && !dragging ? 'block' : 'none';
  if (view.halo) halo.style.background = 'radial-gradient(ellipse at center, ' + hexA(view.halo, 0.38) + ', transparent 70%)';
  bob.className = dragging ? '' : (view.bob || '');
  eyesHappy.style.display = now < greetUntil ? 'block' : 'none';
  eyesOpen.style.display = now < greetUntil ? 'none' : 'block';
  if (currentAnim !== anim) {
    currentAnim = anim;
    scheduleDraw(0);
  }
}

var lastHitKey = '';
function publishHitRegion() {
  if (!window.deskPet || !window.deskPet.hitRegion) return;
  var els = [pet, statusBubble, alertBubble, actBubble];
  var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (!el) continue;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    l = Math.min(l, rect.left); t = Math.min(t, rect.top);
    r = Math.max(r, rect.right); b = Math.max(b, rect.bottom);
  }
  if (!isFinite(l)) return;
  var pad = 4;
  var region = {
    x: Math.max(0, l - pad), y: Math.max(0, t - pad),
    w: Math.min(window.innerWidth, r + pad) - Math.max(0, l - pad),
    h: Math.min(window.innerHeight, b + pad) - Math.max(0, t - pad),
  };
  var key = region.x.toFixed(0) + ',' + region.y.toFixed(0) + ',' + region.w.toFixed(0) + ',' + region.h.toFixed(0);
  if (key === lastHitKey) return;
  lastHitKey = key;
  window.deskPet.hitRegion(region);
}

function render() {
  if (BENCH) BENCH.renders += 1;
  var now = Date.now();
  var presentation = core.presentationFor(mode);
  var view = { anim: presentation.anim, halo: presentation.dot, bubble: presentation.bubble, bob: presentation.bob };
  var anim = greetUntil > now ? 'waving'
    : dragging ? (lastDir < 0 ? 'running-left' : 'running-right')
    : view.anim;
  // Priority: a pet swap outranks everything (it is the visible feedback of
  // the click that caused it), then a greeting, then the live session state.
  var bubbleKind = switching ? 'switch'
    : greetUntil > now ? 'greet'
    : (view.bubble || '');
  var dotColor = view.halo || core.DOT_COLORS.working;
  var sig = [anim, bubbleKind, mode, kind, taskText, runLabel(), view.halo || '', switching ? 1 : 0,
    currentSessionId ? 1 : 0, dragging ? 1 : 0, img ? 1 : 0, now < greetUntil ? 1 : 0,
    now < hintUntil ? 1 : 0,
    pending ? [pending.kind, pending.summary, (pending.options || []).length].join(',') : ''].join('|');
  if (sig === lastSig) return;
  lastSig = sig;
  syncBubbleChrome(now, bubbleKind, dotColor);
  syncPetVisual(view, anim, now);
}

// No idle render poll: every state change calls render() directly, and the
// time-based bubbles schedule one render at their expiry.
window.addEventListener('resize', function () {
  render();
  // 窗口尺寸变化后刷新命中区域，避免右键/点击落在旧的交互范围之外。
  requestAnimationFrame(publishHitRegion);
});
setInterval(function () { if (runClock.phase === 'running') render(); }, 1000);

// blink (built-in cat only)
setInterval(function () {
  if (img) return;
  eyesOpen.setAttribute('transform', 'translate(0 50) scale(1 0.12) translate(0 -50)');
  setTimeout(function () { eyesOpen.removeAttribute('transform'); }, 160);
  publishHitRegion();
}, 3200);

// ---- draw-on-demand sprite loop ----
var currentAnim = 'idle';
var last = 0;
var lastDrawKey = '';
var drawTimer = null;
// Frame-based, not rAF: schedule the next wake-up at the remaining frame
// duration (16–320ms) instead of burning 60 callbacks/s while idle.
function scheduleDraw(delay) {
  if (drawTimer) clearTimeout(drawTimer);
  drawTimer = setTimeout(draw, Math.max(16, delay || 0));
}
function draw() {
  var benchStart = BENCH ? performance.now() : 0;
  syncCanvasScale();
  drawTimer = null;
  var now = window.performance && performance.now ? performance.now() : Date.now();
  var next = 500;
  try {
    var dt = last ? now - last : 0;
    last = now;
    if (player) {
      if (player.animation !== currentAnim) player.setAnimation(currentAnim);
      player.advance(dt);
      // Only repaint when the visible frame actually changed.
      var key = player.animation + ':' + player.frameIndex + ':' + (img ? img.src : '');
      if (key !== lastDrawKey) {
        lastDrawKey = key;
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        var rect = player.rect();
        ctx2d.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, canvas.width, canvas.height);
      }
      next = Math.max(16, player.currentFrame().durationMs - player.elapsed);
    }
  } catch (err) { next = 500; }
  if (BENCH) {
    BENCH.draws += 1;
    BENCH.frameMs.push(performance.now() - benchStart);
    if (BENCH.frameMs.length > 4096) BENCH.frameMs.shift();
  }
  scheduleDraw(next);
}
scheduleDraw(0);

// ---- drag: main-process cursor follow; click = press without move ----
var lastSX = 0, lastSY = 0;
pet.addEventListener('mousedown', function (e) {
  if (e.button !== 0) return;
  // bubbles are children of the pet: presses on them are UI interactions,
  // never the start of a drag (and never a pet "click")
  if (e.target && /** @type {Element} */ (e.target).closest && /** @type {Element} */ (e.target).closest('.bubble')) return;
  dragging = true;
  dragMoved = false;
  lastSX = e.screenX;
  lastSY = e.screenY;
  pet.classList.add('grabbing');
  render();
  if (window.deskPet) window.deskPet.dragStart(e.clientX, e.clientY);
});
window.addEventListener('mousemove', function (e) {
  if (!dragging) return;
  if (Math.abs(e.screenX - lastSX) + Math.abs(e.screenY - lastSY) > 3) {
    dragMoved = true;
    var dir = e.screenX > lastSX ? 1 : -1;
    if (dir !== lastDir) {
      lastDir = dir;
      render();
    }
    lastSX = e.screenX;
    lastSY = e.screenY;
  }
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove('grabbing');
  render();
  if (window.deskPet) window.deskPet.dragEnd();
}
window.addEventListener('mouseup', function () {
  if (!dragging) return;
  var wasMoved = dragMoved;
  endDrag();
  if (!wasMoved) {
    btxt3El.textContent = GREETS[Math.floor(Math.random() * GREETS.length)];
    syncBubbleMore(greetBubble, btxt3El);
    greetUntil = Date.now() + 2600;
    render();
    setTimeout(render, 2600 + 30);
    // Clicking the pet raises the app too.
    if (window.deskPet && window.deskPet.focusApp) window.deskPet.focusApp();
  }
});
// recover if a mouseup is ever lost
var lastMoveAt = 0;
window.addEventListener('mousemove', function () { lastMoveAt = Date.now(); });
setInterval(function () {
  if (dragging && Date.now() - lastMoveAt > 3000) endDrag();
}, 1000);
// Right-click opens the menu; choosing Hide shows where to re-activate first.
var hintUntil = 0;
pet.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  e.stopPropagation();
  if (window.deskPet && window.deskPet.menu) window.deskPet.menu();
});
if (window.deskPet && window.deskPet.onHintBeforeHide) {
  window.deskPet.onHintBeforeHide(function () {
    btxt3El.textContent = zh
      ? '我先躲起来了，想我时去「我的宠物」页面激活我'
      : 'Hiding now — bring me back from “My pets” anytime';
    syncBubbleMore(greetBubble, btxt3El);
    hintUntil = Date.now() + 3000;
    greetUntil = hintUntil;
    render();
    setTimeout(render, 3000 + 30);
    setTimeout(function () { if (window.deskPet) window.deskPet.quitPet(); }, 3000);
  });
}

// ---- bubbles jump to the session (and raise the app) ----
// Silent on purpose: the visible result is the app coming forward on the
// right session, no extra "jumped" toast bubble.
// ---- actionable bubble: resolve pending interactions in place ----
var ACT_WORD = {
  approval: zh ? '等你审批' : 'Approval',
  question: zh ? '等你回答' : 'Answer',
  other: zh ? '等你处理' : 'Action needed'
};
function actAnswer(answer) {
  if (!pending || !pending.sessionId || !window.deskPet) return;
  if (window.deskPet.petAnswer) window.deskPet.petAnswer(pending.sessionId, pending.kind, answer);
  // close right away; the next poll brings the real new state
  pending = null;
  actBubble.style.display = 'none';
}
function makeBtn(label, cls, onClick) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
  return b;
}
function chipButton(opt, selected, onPick) {
  var c = document.createElement('span');
  c.className = 'chip' + (selected ? ' sel' : '');
  if (selected) {
    var ck = document.createElement('span');
    ck.className = 'ck';
    ck.textContent = '✓';
    c.appendChild(ck);
  }
  var cl = document.createElement('span');
  cl.className = 'cl';
  cl.textContent = opt.label;
  c.appendChild(cl);
  if (opt.recommended) {
    var rec = document.createElement('span');
    rec.className = 'rec';
    rec.textContent = zh ? '推荐' : 'Recommended';
    c.appendChild(rec);
  }
  c.addEventListener('click', function (e) { e.stopPropagation(); onPick(); });
  return c;
}
function spacer() {
  var s = document.createElement('span');
  s.className = 'spacer';
  return s;
}
function showDesc(text) {
  descAEl.textContent = text || '';
  descAEl.classList.toggle('on', !!text);
}

function renderApprovalActions() {
  footAEl.appendChild(spacer());
  footAEl.appendChild(makeBtn(zh ? '拒绝' : 'Reject', 'btn ghost', function () { actAnswer('rejected'); }));
  footAEl.appendChild(makeBtn(zh ? '允许一次' : 'Allow once', 'btn pri', function () { actAnswer('allowed-once'); }));
  footAEl.classList.add('on');
}

function renderQuestionActions(p) {
  var hasOptions = Array.isArray(p.options) && p.options.length > 0;
  var picked = [];
  var submitBtn = null;
  function syncSubmit() {
    if (!submitBtn) return;
    submitBtn.classList.toggle('disabled', picked.length === 0);
    submitBtn.textContent = (zh ? '提交' : 'Submit') + (p.multi && picked.length ? '（' + picked.length + '）' : '');
  }
  function renderChips() {
    chipsAEl.textContent = '';
    p.options.forEach(function (opt) {
      var sel = picked.indexOf(opt.label) >= 0;
      chipsAEl.appendChild(chipButton(opt, sel, function () {
        if (p.multi) {
          var i = picked.indexOf(opt.label);
          if (i < 0) picked.push(opt.label); else picked.splice(i, 1);
        } else {
          picked.length = 0;
          picked.push(opt.label);
        }
        showDesc(picked.length ? opt.description : '');
        renderChips();
        syncSubmit();
      }));
    });
  }
  if (hasOptions) renderChips();
  // DSH questions always allow an optional custom answer, even with options.
  footAEl.appendChild(makeBtn(zh ? '其他答案 · 在会话中输入' : 'Other answer · open session', 'custom', jumpToSession));
  footAEl.appendChild(spacer());
  footAEl.appendChild(makeBtn(zh ? '跳过' : 'Skip', 'btn ghost', function () {
    actAnswer({ answers: [{ id: p.questionId || '', selected: [] }] });
  }));
  if (hasOptions) {
    submitBtn = makeBtn(zh ? '提交' : 'Submit', 'btn pri disabled', function () {
      if (picked.length) actAnswer({ answers: [{ id: p.questionId || '', selected: picked.slice() }] });
    });
    footAEl.appendChild(submitBtn);
  }
  footAEl.classList.add('on');
  syncSubmit();
}
function renderFallback() {
  btxtAEl.textContent = zh ? '需要你在会话中处理' : 'Needs action in session';
  locateAEl.textContent = jumpLabel();
  sumAEl.textContent = '';
  sumMoreEl.hidden = true;
  sumPlainEl.textContent = zh
    ? '暂不支持在气泡内完成，请打开会话。'
    : 'Not supported in the bubble — open the session.';
  sumPlainEl.classList.add('on');
  paintDot(dotAEl, core.DOT_COLORS.waiting);
}

function renderActBubble() {
  var p = pending;
  // Reset before branching: a fallback must not inherit the previous card.
  sumExpanded = false;
  qWrapEl.classList.remove('expanded', 'long');
  chipsAEl.textContent = '';
  showDesc('');
  sumPlainEl.classList.remove('on');
  footAEl.textContent = '';
  footAEl.classList.remove('on');
  if (p.fallback) { renderFallback(); return; }
  btxtAEl.textContent = (ACT_WORD[p.kind] || ACT_WORD.other) + (taskText ? ' · ' + taskText : '');
  paintDot(dotAEl, core.DOT_COLORS.waiting);
  locateAEl.textContent = jumpLabel();
  sumAEl.textContent = core.pendingText(p.summary) + (p.detail ? '\n' + p.detail : '');
  syncActSummaryMore();
  requestAnimationFrame(syncActSummaryMore);
  if (p.kind === 'approval') renderApprovalActions();
  else if (p.kind === 'question') renderQuestionActions(p);
}

// One sizing path: measure logical boxes, let core.fitWindow apply the scale
// exactly once, and ask the host for those bounds. Deduped so the IPC only
// fires when the result actually changes.
var LAST_FIT = '';
function fitWindowToContent() {
  if (!window.deskPet || !window.deskPet.fitContent) return;
  requestAnimationFrame(function () {
    var bubbles = [statusBubble, alertBubble, greetBubble, actBubble];
    var boxes = [];
    for (var i = 0; i < bubbles.length; i += 1) {
      var b = bubbles[i];
      if (b.style.display === 'none') continue;
      boxes.push({ w: b.offsetWidth, h: b.offsetHeight });
    }
    var petEl = document.getElementById('pet');
    var fit = core.fitWindow({
      pet: { w: petEl ? petEl.offsetWidth : 96, h: petEl ? petEl.offsetHeight : 104 },
      bubbles: boxes,
      base: { w: 300, h: 175 },
      scale: petScale
    });
    var sig = fit.w + 'x' + fit.h;
    if (sig === LAST_FIT) return;
    LAST_FIT = sig;
    window.deskPet.fitContent(fit.w, fit.h);
  });
}

function jumpToSession() {
  if (!currentSessionId || !window.deskPet) return;
  if (window.deskPet.openSession) window.deskPet.openSession(currentSessionId);
  if (window.deskPet.focusApp) window.deskPet.focusApp();
}
// A bubble press must not fall through to the pet underneath (which would
// start a drag and pop the greeting), but only the explicit "open session"
// link may navigate: the title/body/blank area stay inert.
[statusBubble, alertBubble].forEach(function (el) {
  el.addEventListener('mousedown', function (e) { e.stopPropagation(); });
});
[jumpSEl, jumpAEl, locateAEl].forEach(function (link) {
  link.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    jumpToSession();
  });
});

// ---- live status: SSE first, polling as fallback -------------------------
function applyStatus(s) {
  if (!s) return;
  lastStatusAt = Date.now();
  var nextMode = s.mode || 'idle';
  var nextSession = s.sessionId || '';
  if (nextSession !== runSessionId) runClock = core.idleClock();
  runSessionId = nextSession;
  runClock = core.syncRunClock(runClock, nextMode, Date.now(), s.turnStartedAt, s.turnEndedAt);
  mode = nextMode;
  kind = s.kind || '';
  taskText = s.task || '';
  currentSessionId = nextSession;
  pending = s.pending && typeof s.pending === 'object' ? s.pending : null;
  var a = Number(s.opacity);
  applyLayerAlpha(Number.isFinite(a) ? Math.min(1, Math.max(0.3, a)) : 1);
  applyLayerScale(Number(s.size) || 1);
  if ((s.slug || '') !== slug) loadPet(s.slug || '');
  render();
}
function poll() {
  fetch(core.API_BASE + '/status').then(function (r) { return r.json(); }).then(applyStatus).catch(function () {});
}
var lastStatusAt = 0;
// Host pushes status over the child stdin IPC. One initial GET covers the
// window before the first frame arrives; no EventSource/SSE.
if (window.deskPet && window.deskPet.onStatus) {
  window.deskPet.onStatus(applyStatus);
  poll();
} else {
  setInterval(poll, 350);
}
setInterval(function () {
  if (Date.now() - lastStatusAt > 20000) poll();
}, 5000);
// Do not quit on a stale status: macOS sleep pauses SSE/polling, and a
// false "host gone" must not persist petOn=false. The parent watchdog owns
// real Host-death cleanup.
syncPetView();
render();
