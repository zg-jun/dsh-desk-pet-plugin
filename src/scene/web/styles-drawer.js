// Drawer CSS (add-pet panel); kept separate to respect the file budget.
export const DRAWER_CSS = `/* ===== 添加宠物抽屉 ===== */
.dpp-scrim {
  position: fixed; inset: 0; background: rgba(16, 16, 24, 0.12); z-index: 40;
  opacity: 0; visibility: hidden;
  transition: opacity 0.26s ease, visibility 0s linear 0.26s;
}
.dpp-scrim.open { opacity: 1; visibility: visible; transition: opacity 0.26s ease, visibility 0s; }
.dpp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dpp-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 360px; z-index: 41;
  box-sizing: border-box; padding: 18px 18px 14px;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: -30px 0 60px -40px rgba(16, 16, 24, 0.35);
  transform: translateX(100%); visibility: hidden; will-change: transform;
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1), visibility 0s linear 0.3s;
}
.dpp-drawer.open {
  transform: translateX(0); visibility: visible;
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1), visibility 0s;
}
@media (prefers-reduced-motion: reduce) {
  .dpp-scrim, .dpp-scrim.open, .dpp-drawer, .dpp-drawer.open { transition: none; }
}
.dpp-drawer-head { display: flex; align-items: center; margin-bottom: 14px; }
.dpp-drawer-head h2 { font-size: var(--dpp-f-title); font-weight: 600; margin: 0; }
.dpp-drawer-head .spacer { flex: 1; }
.dpp-close {
  width: 26px; height: 26px; border: 0; border-radius: var(--dpp-r-item); background: none; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: var(--dpp-f-meta);
}
.dpp-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dpp-search {
  display: flex; align-items: center; gap: 8px; height: var(--dpp-h-input); padding: 0 10px; flex: none;
  border-radius: var(--dpp-r-control); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
}
.dpp-search .ico { width: 13px; height: 13px; flex: none; color: var(--dsw-alias-label-tertiary); }
.dpp-search input {
  flex: 1; border: 0; outline: none; background: none; font: inherit;
  font-size: var(--dpp-f-value); color: var(--dsw-alias-label-primary);
}
.dpp-drawer-hint { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); margin: 8px 0 0; flex: none; }
.dpp-results {
  display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-height: 0;
  overflow-y: auto; margin: 12px -8px 0 0; padding-right: 8px; scrollbar-width: thin;
}
.dpp-result {
  position: relative; display: flex; align-items: center; gap: 10px; min-height: 44px;
  padding: 0 8px; border-radius: var(--dpp-r-control); cursor: pointer; overflow: hidden;
}
.dpp-result:hover, .dpp-result.sel { background: var(--dsw-alias-interactive-bg-hover); }
.dpp-result.sel .nm { font-weight: 600; }
.dpp-result .th { width: 30px; height: 32px; flex: none; display: flex; align-items: center; justify-content: center; }
.dpp-result .th canvas, .dpp-result .th img { width: 30px; height: 32px; object-fit: contain; }
.dpp-result .nm {
  font-size: var(--dpp-f-value); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dpp-result .sl {
  font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary);
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dpp-result .spacer { flex: 1; min-width: 6px; }
.dpp-result .act {
  flex: none; white-space: nowrap;
  border: 0; background: none; font: inherit; font-size: var(--dpp-f-label); color: var(--dsw-alias-label-primary);
  padding: 3px 7px; border-radius: var(--dpp-r-item); cursor: pointer;
}
.dpp-result .act:hover { background: var(--dsw-alias-interactive-bg-active); }
.dpp-result .act:disabled { opacity: 0.5; cursor: default; }
.dpp-result .done { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); }
.dpp-result.installing::before {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.dpp-result.installing::after {
  content: ''; position: absolute; left: 0; bottom: 0; height: 2px; width: 38%;
  background: var(--dsw-alias-label-primary); animation: dpp-slide 1.2s ease-in-out infinite;
}
@keyframes dpp-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(280%); } }

.dpp-preview {
  position: relative; flex: none; margin-top: 12px; padding: 10px; border-radius: var(--dpp-r-card);
  corner-shape: round; text-align: center;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
}
.dpp-preview-pic { position: relative; height: 104px; display: flex; align-items: flex-end; justify-content: center; }
.dpp-preview-pic canvas { display: block; }
.dpp-preview-empty { display: flex; align-items: flex-end; justify-content: center; height: 104px; opacity: 0.32; }
.dpp-preview-spin {
  position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px;
  border-radius: var(--dpp-r-round); corner-shape: round;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
  border-top-color: var(--dsw-alias-label-secondary);
  border-right-color: var(--dsw-alias-label-secondary);
  animation: dpp-spin 0.8s linear infinite;
}
@keyframes dpp-spin { to { transform: rotate(360deg); } }
.dpp-preview-cap { font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); margin-top: 5px; }
.dpp-acts { display: flex; gap: 4px; justify-content: center; margin-top: 8px; }
.dpp-acts .a {
  font-size: var(--dpp-f-label); padding: 2px 8px; border-radius: var(--dpp-r-pill);
  corner-shape: round; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
}
.dpp-acts .a.on { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); }
.dpp-drawer-foot { display: flex; align-items: center; flex: none; padding-top: 12px; }
.dpp-drawer-empty {
  flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; text-align: center; border-radius: var(--dpp-r-card); margin: 12px 0 0; padding: 24px 16px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);
}
.dpp-drawer-empty .t { font-size: var(--dpp-f-meta); font-weight: 600; }
.dpp-drawer-empty .b { font-size: var(--dpp-f-label); line-height: 1.6; color: var(--dsw-alias-label-secondary); margin: 0 0 8px; }

`;
