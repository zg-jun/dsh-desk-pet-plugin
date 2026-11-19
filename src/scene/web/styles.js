import { DRAWER_CSS } from './styles-drawer';
import { RUNTIME_CSS } from './styles-runtime';

const BASE_CSS = `
/* ===== 设置页（C6）：舞台 + 3D 宠物显示区 + 设置 / 运行环境两行卡片 ===== */
.desk-pet-page {
  height: 100%; min-height: 0; display: flex; flex-direction: column; box-sizing: border-box;
  color: var(--dsw-alias-label-primary); line-height: 1.5;
}
.desk-pet-page, .desk-pet-runtime {
  /* 圆角 */
  --dpp-r-stage: 18px;
  --dpp-r-modal: 16px;
  --dpp-r-card: 12px;
  --dpp-r-control: 8px;
  --dpp-r-item: 6px;
  --dpp-r-code: 5px;
  --dpp-r-pill: 999px;
  --dpp-r-round: 50%;
  /* 控件高度 */
  --dpp-h-chip: 26px;
  --dpp-h-button: 28px;
  --dpp-h-seg: 24px;
  --dpp-h-pill: 22px;
  --dpp-h-input: 34px;
  /* 字号 */
  --dpp-f-label: 11.5px;
  --dpp-f-value: 12.5px;
  --dpp-f-meta: 13px;
  --dpp-f-title: 15px;
  --dpp-f-mono: 11px;
  /* 间距 */
  --dpp-sp-1: 4px;
  --dpp-sp-2: 6px;
  --dpp-sp-3: 8px;
  --dpp-sp-4: 12px;
  --dpp-sp-5: 14px;
  --dpp-sp-6: 16px;
}
.dpp-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.dpp-wrap { width: 940px; max-width: 100%; margin: 0 auto; padding: 26px 0 44px; box-sizing: border-box; }

/* 页头 */
.dpp-topbar {
  flex: none; height: 52px; border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base); display: flex; align-items: center; padding: 0 24px;
}
.dpp-topbar h1 { font-size: var(--dpp-f-title); font-weight: 600; margin: 0; letter-spacing: 0.01em; color: var(--dsw-alias-label-primary); }

/* 舞台 */
.dpp-stage {
  position: relative; box-sizing: border-box; padding: 18px 18px 10px;
  border-radius: var(--dpp-r-stage);
  background:
    radial-gradient(125% 90% at 50% -12%, color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent), transparent 62%),
    color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-base));
}
.dpp-stage-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 0 2px; }
.dpp-stage-name { font-size: var(--dpp-f-meta); font-weight: 600; letter-spacing: 0.01em; line-height: 1.5; }
.dpp-stage-meta {
  display: flex; align-items: center; gap: 7px; margin-top: 5px;
  font-size: var(--dpp-f-value); line-height: 1.5; color: var(--dsw-alias-label-secondary);
}
.dpp-dot { width: 6px; height: 6px; border-radius: var(--dpp-r-round); corner-shape: round; background: var(--dsw-alias-state-success-primary); flex: none; }

/* 开关 */
.dpp-switch {
  display: inline-flex; align-items: center; gap: 9px; flex: none;
  border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer;
}
.dpp-switch-label { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-secondary); }
.dpp-switch-track {
  position: relative; width: 36px; height: 20px; border-radius: var(--dpp-r-pill);
  corner-shape: round; flex: none;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
  transition: background 0.14s ease;
}
.dpp-switch-track i {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: var(--dpp-r-round);
  corner-shape: round;
  background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(16, 16, 24, 0.22);
  transition: left 0.14s ease;
}
.dpp-switch-track.on { background: var(--dsw-alias-label-primary); }
.dpp-switch-track.on i { left: 18px; }
.dpp-switch-track:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 45%, transparent); outline-offset: 2px; }

/* 3D 宠物显示区 */
.dpp-scene {
  position: relative; height: 154px; margin-top: 6px;
  perspective: 1100px; transform-style: preserve-3d;
  touch-action: pan-y; user-select: none; -webkit-user-select: none;
  cursor: grab;
}
.dpp-scene.dragging { cursor: grabbing; }
.dpp-pet {
  position: absolute; left: 50%; bottom: 0; width: 126px; height: 134px; margin-left: -63px;
  transform-origin: 50% 100%; display: flex; align-items: flex-end; justify-content: center;
  border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer;
  transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.34s ease;
  will-change: transform, opacity;
}
.dpp-scene.no-anim .dpp-pet, .dpp-scene.no-anim .dpp-pet-media, .dpp-scene.no-anim .dpp-pet-label, .dpp-scene.no-anim .dpp-pet-shadow,
.dpp-scene.dragging .dpp-pet, .dpp-scene.dragging .dpp-pet-media, .dpp-scene.dragging .dpp-pet-label, .dpp-scene.dragging .dpp-pet-shadow { transition: none; }
.dpp-pet-media {
  position: absolute; left: 50%; bottom: 30px; width: 99px; height: 108px; margin-left: -49.5px;
  display: flex; align-items: flex-end; justify-content: center;
  transform-style: preserve-3d; transform-origin: 50% 100%; pointer-events: none;
  transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1), bottom 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.dpp-pet canvas, .dpp-pet img { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; }
.dpp-pet-shadow {
  position: absolute; left: 50%; bottom: 28px; width: 84px; height: 12px; margin-left: -42px;
  border-radius: var(--dpp-r-round); corner-shape: round; pointer-events: none;
  background: radial-gradient(50% 50% at 50% 50%, rgba(16, 16, 24, 0.24), rgba(16, 16, 24, 0) 72%);
  filter: blur(2px);
  transition: bottom 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.dpp-pet-label {
  position: absolute; left: 0; right: 0; bottom: 0; height: 20px; pointer-events: none;
  transform-origin: 50% 100%; transition: transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
}
.dpp-pet-name {
  max-width: 100%; height: 16px; line-height: 16px; font-size: var(--dpp-f-label); font-weight: 400;
  text-align: center; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dpp-pet-dot {
  display: inline-block; width: 5px; height: 5px; margin-right: 5px; vertical-align: 1px;
  border-radius: 50%; corner-shape: round; background: var(--dsw-alias-state-success-primary);
}
.dpp-pet.active .dpp-pet-name { color: var(--dsw-alias-label-primary); }
.dpp-builtin { display: flex; align-items: flex-end; justify-content: center; }
.dpp-builtin svg { width: 99px; height: 99px; display: block; }
.dpp-pet { outline: none; }
.dpp-pet:focus-visible { outline: none; border-radius: var(--dpp-r-card);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 4px color-mix(in srgb, var(--dsw-alias-label-primary) 26%, transparent); }
.dpp-pet .x {
  position: absolute; top: 0; right: 17.5px; width: 18px; height: 18px; padding: 0;
  transform-origin: 100% 0;
  border: 0; border-radius: 0; background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: var(--dpp-f-meta); line-height: 18px; text-align: center; cursor: pointer;
  opacity: 0; z-index: 2; text-shadow: 0 1px 2px rgba(16, 16, 24, 0.3);
  transition: opacity 0.12s ease, color 0.12s ease;
}
.dpp-pet:hover .x { opacity: 0.8; }
.dpp-pet .x { pointer-events: none; }
.dpp-pet:hover .x, .dpp-pet .x:focus-visible { pointer-events: auto; }
.dpp-pet .x:focus-visible { opacity: 0.8; }
.dpp-pet .x:hover { color: var(--dsw-alias-label-primary); opacity: 1; }
@media (hover: none) { .dpp-pet.active .x { opacity: 0.6; pointer-events: auto; } }

/* 舞台底部动作条 */
.dpp-bar { display: flex; align-items: center; gap: 6px; padding: 0 2px; margin-top: 10px; }
.dpp-chip {
  height: var(--dpp-h-chip); padding: 0 11px; border-radius: var(--dpp-r-pill);
  corner-shape: round; display: inline-flex; align-items: center;
  font: inherit; font-size: var(--dpp-f-label); color: var(--dsw-alias-label-secondary); cursor: pointer;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 55%, transparent);
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.dpp-chip:hover { color: var(--dsw-alias-label-primary); }
.dpp-chip.on {
  color: var(--dsw-alias-bg-base); font-weight: 500;
  border-color: transparent;
  background: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px rgba(16, 16, 24, 0.18);
}
.dpp-add {
  margin-left: auto; height: var(--dpp-h-button); padding: 0 14px; border-radius: var(--dpp-r-pill);
  corner-shape: round;
  display: inline-flex; align-items: center; border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent);
  box-shadow: 0 1px 2px rgba(16, 16, 24, 0.06), 0 10px 20px -18px rgba(16, 16, 24, 0.45);
  font: inherit; font-size: var(--dpp-f-label); color: var(--dsw-alias-label-primary); cursor: pointer;
  transition: background 0.12s ease, box-shadow 0.12s ease;
}
.dpp-add:hover {
  background: var(--dsw-alias-bg-base);
  box-shadow: 0 2px 4px rgba(16, 16, 24, 0.08), 0 12px 24px -18px rgba(16, 16, 24, 0.5);
}

/* 下方两行卡片 */
.dpp-stack { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
.dpp-card {
  border-radius: var(--dpp-r-card); padding: 13px 18px 11px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
}
.dpp-card-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.dpp-card-head h3 { font-size: var(--dpp-f-meta); font-weight: 600; margin: 0; }
.dpp-desc { font-size: var(--dpp-f-value); line-height: 1.6; color: var(--dsw-alias-label-secondary); margin: 0 0 8px; }
.dpp-row { display: flex; align-items: center; gap: 12px; height: 28px; }
.dpp-row + .dpp-row { margin-top: 6px; }
.dpp-row .lab { width: 44px; flex: none; font-size: var(--dpp-f-value); color: var(--dsw-alias-label-secondary); }
.dpp-row .val { display: inline-flex; align-items: center; gap: 8px; font-size: var(--dpp-f-value); }
.dpp-row .sub { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); }
.dpp-row .spacer { flex: 1; }
.dpp-row code {
  font: var(--dpp-f-mono)/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dpp-r-code); padding: 3px 6px; color: var(--dsw-alias-label-primary);
  max-width: 560px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dpp-row-empty { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); }
.dpp-install {
  height: 24px; padding: 0 12px; border: 0; border-radius: var(--dpp-r-control); corner-shape: round;
  background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base);
  font: inherit; font-size: var(--dpp-f-label); cursor: pointer;
}
.dpp-install:disabled { opacity: 0.6; cursor: default; }
.dpp-state {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--dpp-f-value); color: var(--dsw-alias-label-secondary);
}
.dpp-state .d { width: 6px; height: 6px; border-radius: var(--dpp-r-round); corner-shape: round;
  background: var(--dsw-alias-label-tertiary); }
.dpp-state.ok .d { background: var(--dsw-alias-state-success-primary); }
.dpp-state.warn .d { background: var(--dsw-alias-state-warn-primary); }
.dpp-state.bad .d { background: var(--dsw-alias-state-error-primary); }
.dpp-pill {
  display: inline-flex; align-items: center; gap: 6px; height: var(--dpp-h-pill); padding: 0 9px;
  border-radius: var(--dpp-r-pill); font-size: var(--dpp-f-label); border: 1px solid transparent;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
}
.dpp-pill .d { width: 6px; height: 6px; border-radius: var(--dpp-r-round); corner-shape: round; background: currentColor; }
.dpp-pill.ok { color: var(--dsw-alias-state-success-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 26%, transparent); }
.dpp-pill.warn { color: var(--dsw-alias-state-warn-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent); }
.dpp-pill.bad { color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 28%, transparent); }

.dpp-seg {
  position: relative; margin-left: auto; display: inline-flex; align-items: center; gap: 2px; padding: 2px;
  border-radius: var(--dpp-r-control); corner-shape: round;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
}
.dpp-seg-thumb {
  position: absolute; top: 2px; bottom: 2px; left: 2px; width: 0; border-radius: var(--dpp-r-item);
  corner-shape: round; background: var(--dsw-alias-bg-base); pointer-events: none;
  box-shadow: 0 1px 2px rgba(16, 16, 24, 0.10);
  transition: transform 0.18s ease, width 0.18s ease;
}
.dpp-seg .s {
  position: relative; z-index: 1;
  min-width: 40px; height: var(--dpp-h-seg); padding: 0 8px; border-radius: var(--dpp-r-item);
  corner-shape: round; display: flex;
  align-items: center; justify-content: center; font-size: var(--dpp-f-label);
  color: var(--dsw-alias-label-secondary); cursor: pointer;
  background: transparent; transition: color 0.18s ease, font-weight 0.18s ease;
}
.dpp-seg .s:hover { color: var(--dsw-alias-label-primary); }
.dpp-seg .s.on { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dpp-link {
  border: 0; background: none; padding: 0 2px; height: 26px; font: inherit;
  font-size: var(--dpp-f-label); color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.dpp-link:hover { color: var(--dsw-alias-label-primary); }
.dpp-link:disabled { opacity: 0.6; cursor: default; }

`;

const GUARANTEE_CSS = `/* ===== 保证层（放最后、带 !important）=====
   全局令牌见文件顶部（--dpp-r-* / --dpp-h-* / --dpp-f-*）；这里引用同一套令牌兜底几何与字形，
   防止宿主全局 button / 控件样式按优先级或顺序覆盖。颜色与状态仍由语义层控制。
   规则：新增任何按钮/控件，必须同步登记到这一层，并优先使用令牌而不是裸数值。 */
.desk-pet-page.desk-pet-page .dpp-chip,
.desk-pet-page.desk-pet-page .dpp-add,
.desk-pet-page.desk-pet-page .dpp-acts .a,
.desk-pet-page.desk-pet-page .dpp-pill { border-radius: var(--dpp-r-pill) !important; corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-switch-track { border-radius: var(--dpp-r-pill) !important; corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-switch-track i { border-radius: var(--dpp-r-round) !important; corner-shape: round !important; }

/* 宿主会向页面元素注入 corner-shape: squircle，它会把圆角/正圆改画成超椭圆。
   这里对整个插件子树做一次兜底，任何新增元素都不会再被改形状；需要 squircle 时必须显式提高优先级。 */
.desk-pet-page.desk-pet-page *,
.desk-pet-runtime.desk-pet-runtime * { corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-dot,
.desk-pet-page.desk-pet-page .dpp-pet-dot,
.desk-pet-page.desk-pet-page .dpp-pill .d,
.desk-pet-page.desk-pet-page .dpp-pet-shadow,
.desk-pet-page.desk-pet-page .dpp-preview-spin { border-radius: var(--dpp-r-round) !important; corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-seg { border-radius: var(--dpp-r-control) !important; corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-seg .s { border-radius: var(--dpp-r-item) !important; corner-shape: round !important; }
.desk-pet-page.desk-pet-page .dpp-row code { border-radius: var(--dpp-r-code) !important; }
.desk-pet-page.desk-pet-page .dpp-close,
.desk-pet-page.desk-pet-page .dpp-result .act { border-radius: var(--dpp-r-item) !important; }

.desk-pet-page.desk-pet-page .dpp-chip {
  display: inline-flex !important; align-items: center !important;
  height: var(--dpp-h-chip) !important; padding: 0 11px !important; font-size: var(--dpp-f-label) !important;
}
.desk-pet-page.desk-pet-page .dpp-add {
  display: inline-flex !important; align-items: center !important;
  height: var(--dpp-h-button) !important; padding: 0 14px !important; font-size: var(--dpp-f-label) !important;
}
.desk-pet-page.desk-pet-page .dpp-seg .s {
  display: flex !important; align-items: center !important; justify-content: center !important;
  height: var(--dpp-h-seg) !important; min-width: 40px !important; padding: 0 8px !important; font-size: var(--dpp-f-label) !important;
}
.desk-pet-page.desk-pet-page .dpp-pill {
  display: inline-flex !important; align-items: center !important;
  height: var(--dpp-h-pill) !important; padding: 0 9px !important; font-size: var(--dpp-f-label) !important;
}
.desk-pet-page.desk-pet-page .dpp-row code { font-size: var(--dpp-f-mono) !important; }
.desk-pet-page.desk-pet-page .dpp-switch-track { width: 36px !important; height: 20px !important; }
.desk-pet-page.desk-pet-page .dpp-acts .a { display: inline-flex !important; align-items: center !important; font-size: var(--dpp-f-label) !important; }
.desk-pet-page.desk-pet-page .dpp-pet .x {
  width: 18px !important; height: 18px !important; border: 0 !important;
  border-radius: 0 !important; background: transparent !important; font-size: var(--dpp-f-meta) !important;
}
.desk-pet-page.desk-pet-page .dpp-search input {
  border: 0 !important; border-radius: 0 !important; background: transparent !important; outline: none !important;
}
.desk-pet-runtime.desk-pet-runtime .dp-btn { border-radius: var(--dpp-r-control) !important; }

`;

export const CSS = [BASE_CSS, DRAWER_CSS, GUARANTEE_CSS, RUNTIME_CSS].join('\n');
