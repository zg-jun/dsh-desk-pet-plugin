/* 3D 环绕切换（设计稿）：所有宠物站在同一地面上，选中者在中央放大，
   左右按透视后退；列表首尾相接，永远两侧都有邻居。
   拖动 / 滚轮 / ←→ 改变位置，松手吸附到最近一只。 */
(function () {
  var CFG = {
    step: 200,           // 每格水平间距（px）
    rotate: 12,          // 每格 Y 轴旋转（度）
    depth: 80,           // 每格 Z 位移（px）
    lift: 8,             // 每格上移（地面透视：越远越靠上）
    scaleFalloff: 0.5,   // scale = 1 / (1 + 0.5*|k|)
    opacityFalloff: 0.26,
    minOpacity: 0.12,
    hideAfter: 2.45,     // 超过这个距离就不显示（避免边缘残影）
    dragThreshold: 4,
  };

  function init(scene) {
    var items = Array.prototype.slice.call(scene.querySelectorAll('.pet-item'));
    if (!items.length) return;
    var n = items.length;

    var cfg = Object.assign({}, CFG);
    var raw = scene.getAttribute('data-params');
    if (raw) {
      var p = raw.split(',').map(Number);
      if (p.length === 7 && p.every(Number.isFinite)) {
        cfg.step = p[0]; cfg.rotate = p[1]; cfg.depth = p[2];
        cfg.scaleFalloff = p[3]; cfg.opacityFalloff = p[4]; cfg.minOpacity = p[5]; cfg.lift = p[6];
      }
    }

    var active = items.findIndex(function (el) { return el.classList.contains('center'); });
    if (active < 0) active = 0;
    var offset = active;

    var at = parseFloat(new URLSearchParams(location.search).get('at') || '');
    if (Number.isFinite(at)) offset = active + at;

    // 把索引差折算到 [-n/2, n/2)，让列表首尾相接
    function rel(i) {
      var k = i - offset;
      k = ((k % n) + n) % n;
      if (k > n / 2) k -= n;
      return k;
    }

    function layout() {
      items.forEach(function (el, i) {
        var k = rel(i);
        var a = Math.abs(k);
        var s = 1 / (1 + cfg.scaleFalloff * a);
        var hidden = a > cfg.hideAfter;
        var op = hidden ? 0 : Math.max(cfg.minOpacity, 1 - a * cfg.opacityFalloff);
        el.style.transform = 'translateX(' + (k * cfg.step).toFixed(1) + 'px)' +
          ' translateY(' + (-a * cfg.lift).toFixed(1) + 'px)' +
          ' translateZ(' + (-a * cfg.depth).toFixed(1) + 'px)' +
          ' rotateY(' + (-k * cfg.rotate).toFixed(2) + 'deg)' +
          ' scale(' + s.toFixed(3) + ')';
        el.style.opacity = String(op);
        el.style.pointerEvents = hidden ? 'none' : '';
        el.style.zIndex = String(100 - Math.round(a * 10));
        var center = a < 0.5;
        el.classList.toggle('is-center', center);
        el.setAttribute('aria-hidden', center ? 'false' : 'true');
        el.tabIndex = center ? 0 : -1;
      });
      scene.dataset.active = String(((Math.round(offset) % n) + n) % n);
    }

    function goTo(i) { offset += rel(i); layout(); }
    function stepBy(dir) {
      offset = Math.round(offset) + dir;
      layout();
    }

    scene.classList.add('no-anim');
    layout();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { scene.classList.remove('no-anim'); });
    });

    function openDrawer() {
      var scrim = document.getElementById('scrim');
      var drawer = document.getElementById('drawer');
      if (scrim) scrim.hidden = false;
      if (drawer) drawer.hidden = false;
    }

    function syncStage() {
      var now = ((Math.round(offset) % n) + n) % n;
      var el = items[now];
      var nm = document.querySelector('.stage-head .nm');
      var name = el.getAttribute('aria-label');
      if (nm && name) nm.textContent = name;
      scene.dataset.activeSlug = el.getAttribute('data-slug');
      return el;
    }

    var drag = null;
    var suppressClick = false;
    scene.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.x')) return;
      drag = { x: e.clientX, start: offset, moved: false };
      scene.classList.add('dragging');
      if (scene.setPointerCapture) { try { scene.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    scene.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > cfg.dragThreshold) drag.moved = true;
      if (!drag.moved) return;
      offset = drag.start - dx / cfg.step;
      layout();
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      scene.classList.remove('dragging');
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      if (moved) {
        offset = Math.round(offset);
        layout();
        var el = syncStage();
        if (el && el.getAttribute('data-slug') === 'add') openDrawer();
      }
    }
    scene.addEventListener('pointerup', endDrag);
    scene.addEventListener('pointercancel', endDrag);

    scene.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.target.closest('.x')) return;
      var item = e.target.closest('.pet-item');
      if (!item) return;
      if (item.getAttribute('data-slug') === 'add') { openDrawer(); return; }
      goTo(items.indexOf(item));
      syncStage();
    });

    scene.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(e.key === 'ArrowRight' ? 1 : -1);
        var cur = syncStage();
        if (cur) cur.focus();
      }
    });

    var wheelTimer = 0;
    scene.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      offset += (e.deltaY > 0 ? 0.25 : -0.25);
      layout();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { offset = Math.round(offset); layout(); syncStage(); }, 140);
    }, { passive: false });

  }

  window.initCarousel3d = function (root) {
    (root || document).querySelectorAll('.scene').forEach(init);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.initCarousel3d(); });
  } else {
    window.initCarousel3d();
  }
})();
