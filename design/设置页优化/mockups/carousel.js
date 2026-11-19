/* 3D 轮播（设计稿用）：布局 + 拖拽 + 磁性吸附 + 键盘。
   与 src/scene/web/pet-carousel.js 的布局数学一致，只是参数更克制。
   参数集中在这里，方便统一调整后再回填到真实组件。 */
(function () {
  var CFG = {
    rotate: 16,        // 每单位偏移的 Y 轴旋转（度）：22 → 16
    depth: 28,         // 每单位偏移的 Z 位移（px）：38 → 28
    scale: 0.95,       // |t|=1 时的目标缩放（原 0.93）
    minOpacity: 0.88,  // 透明度下限：0.72 → 0.88
    fadePerUnit: 0.08, // 透明度斜率：0.12 → 0.08
    dragThreshold: 6,
    wheel: 1,
  };

  function init(wrap) {
    var strip = wrap.querySelector('.dpp-strip');
    if (!strip) return;
    // data-params="rotate,depth,scale,minOpacity" 可按实例覆盖，便于对比参数
    var cfg = Object.assign({}, CFG);
    var raw = wrap.getAttribute('data-params');
    if (raw) {
      var p = raw.split(',').map(Number);
      if ((p.length === 4 || p.length === 5) && p.every(function (n) { return Number.isFinite(n); })) {
        cfg = { rotate: p[0], depth: p[1], scale: p[2], minOpacity: p[3],
          fadePerUnit: p.length === 5 ? p[4] : CFG.fadePerUnit,
          dragThreshold: CFG.dragThreshold, wheel: CFG.wheel };
      }
    }
    var cards = Array.prototype.slice.call(strip.querySelectorAll('.dpp-pet'));
    if (!cards.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = 0;

    function spanOf() {
      var v = parseFloat(getComputedStyle(strip).getPropertyValue('--dp-card-span'));
      if (v > 0) return v;
      var gap = parseFloat(getComputedStyle(strip).columnGap || '0') || 0;
      return cards[0].offsetWidth + gap;
    }

    function layout() {
      raf = 0;
      var mid = strip.clientWidth / 2;
      var span = spanOf();
      for (var i = 0; i < cards.length; i += 1) {
        var card = cards[i];
        var centre = card.offsetLeft + card.offsetWidth / 2 - strip.scrollLeft;
        var t = (centre - mid) / span;
        var tc = Math.max(-1.6, Math.min(1.6, t)); // 边缘卡最多 1.6 个单位，避免过度旋转
        var a = Math.min(Math.abs(t), 2);
        card.style.transform = 'rotateY(' + (-tc * cfg.rotate).toFixed(2) + 'deg) translateZ(' +
          (-a * cfg.depth).toFixed(1) + 'px) scale(' + (1 - a * (1 - cfg.scale)).toFixed(3) + ')';
        card.style.opacity = String(Math.max(cfg.minOpacity, 1 - a * cfg.fadePerUnit));
        card.style.zIndex = String(Math.max(1, 10 - Math.round(a * 3)));
      }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(layout); }

    function indexNearest() {
      var mid = strip.clientWidth / 2;
      var best = 0;
      var bestD = Infinity;
      for (var i = 0; i < cards.length; i += 1) {
        var d = Math.abs(cards[i].offsetLeft + cards[i].offsetWidth / 2 - strip.scrollLeft - mid);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    function centreOf(i) { return cards[i].offsetLeft + cards[i].offsetWidth / 2 - strip.clientWidth / 2; }
    function goTo(i, smooth) {
      var left = centreOf(i);
      if (smooth && !reduce) strip.scrollTo({ left: left, behavior: 'smooth' });
      else { strip.scrollLeft = left; schedule(); }
    }
    function snapNearest() { goTo(indexNearest(), true); }

    function activate(card) {
      cards.forEach(function (c) {
        var on = c === card;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      goTo(cards.indexOf(card), true);
    }

    // 初始：把选中卡居中；?at=0.5 可停在两张卡之间（用于截图检查中间态）
    requestAnimationFrame(function () {
      var on = cards.findIndex(function (c) { return c.classList.contains('active'); });
      var at = parseFloat(new URLSearchParams(location.search).get('at') || '');
      if (on >= 0 && Number.isFinite(at)) {
        strip.scrollLeft = centreOf(on) + at * spanOf();
        schedule();
      } else if (on >= 0) {
        goTo(on, false);
      }
      layout();
    });

    strip.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', function () { schedule(); });

    // 拖拽：指针捕获 + 阈值；松手后磁性吸附到最近一张
    var drag = null;
    var suppressClick = false;
    strip.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.x')) return;
      drag = { x: e.clientX, left: strip.scrollLeft, moved: false, card: e.target.closest('.dpp-pet') };
      strip.classList.add('dragging');
      if (strip.setPointerCapture) { try { strip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    strip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > CFG.dragThreshold) drag.moved = true;
      if (!drag.moved) return;
      strip.scrollLeft = drag.left - dx;
      schedule();
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      var card = drag.card;
      drag = null;
      strip.classList.remove('dragging');
      if (moved) {
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
        snapNearest();
      } else if (card) {
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
        activate(card);
      }
    }
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);

    // 点击：键盘 Enter/Space 与鼠标共用；拖拽后的合成点击被吞掉
    strip.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
      var card = e.target.closest('.dpp-pet');
      if (!card || e.target.closest('.x')) return;
      activate(card);
    });

    // 键盘：左右切卡并居中
    strip.addEventListener('keydown', function (e) {
      var card = e.target.closest('.dpp-pet');
      if (!card) return;
      var i = cards.indexOf(card);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = Math.max(0, Math.min(cards.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
        cards[next].focus();
        goTo(next, true);
      }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(card); }
    });

    // 滚轮：纵向滚动映射为横向，停下来吸附
    var wheelTimer = 0;
    strip.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var canRight = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
      var canLeft = strip.scrollLeft > 1;
      if ((e.deltaY > 0 && !canRight) || (e.deltaY < 0 && !canLeft)) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY * CFG.wheel;
      schedule();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(snapNearest, 160);
    }, { passive: false });
  }

  window.initCarousel = function (root) {
    (root || document).querySelectorAll('.dpp-stripwrap').forEach(init);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.initCarousel(); });
  } else {
    window.initCarousel();
  }
})();
