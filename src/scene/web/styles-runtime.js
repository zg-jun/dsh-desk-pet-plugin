// Runtime install dialog CSS (overlay slot).
export const RUNTIME_CSS = `/* ===== 运行时环境弹框（overlay） ===== */
.desk-pet-runtime {
  position: absolute; left: 0; top: 0; width: 400px; box-sizing: border-box;
  pointer-events: auto; padding: 24px 22px 12px; border-radius: var(--dpp-r-modal); text-align: center;
  background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary);
  box-shadow: 0 30px 60px -30px rgba(16, 16, 24, 0.45), 0 2px 8px rgba(16, 16, 24, 0.06);
  font-size: var(--dpp-f-value); line-height: 1.6;
  animation: desk-pet-fade-in 0.18s ease-out both;
}
.desk-pet-runtime-layer { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
.desk-pet-runtime-icon { display: flex; justify-content: center; margin: 0 auto 8px; }
.desk-pet-runtime-icon svg { display: block; width: 56px; height: 56px; border-radius: var(--dpp-r-modal);
  box-shadow: 0 8px 18px -10px rgba(16, 16, 24, 0.4), 0 0 0 1px rgba(0, 0, 0, 0.04); }
.desk-pet-runtime-title { font-size: var(--dpp-f-title); font-weight: 600; color: var(--dsw-alias-label-primary); }
.desk-pet-runtime-title.ok { color: var(--dsw-alias-state-success-primary); }
.desk-pet-runtime-title.warn { color: var(--dsw-alias-state-warn-primary); }
.desk-pet-runtime-title.err { color: var(--dsw-alias-state-error-primary); }
.desk-pet-runtime-body { color: var(--dsw-alias-label-secondary); margin-top: 6px; line-height: 1.6; word-break: break-word; }
.desk-pet-runtime-detail { margin-top: 6px; font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); word-break: break-all; }
.desk-pet-runtime-bar { height: 6px; border-radius: var(--dpp-r-pill); overflow: hidden; margin: 10px 0 0; background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); }
.desk-pet-runtime-bar > i { display: block; height: 100%; border-radius: var(--dpp-r-pill);
  background: linear-gradient(90deg, color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent), var(--dsw-alias-label-primary)); transition: width 0.3s ease; }
.desk-pet-runtime-bar.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.desk-pet-runtime-bar.ok > i { background: var(--dsw-alias-state-success-primary); }
.desk-pet-runtime-meta { display: flex; justify-content: center; margin-top: 5px; font-size: var(--dpp-f-label); color: var(--dsw-alias-label-tertiary); }
.desk-pet-runtime-actions { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
.desk-pet-runtime-actions.progress { margin-top: 6px; }

/* 按钮（运行时弹框共用） */
.dp-btn {
  font: inherit; font-size: var(--dpp-f-label); line-height: 1.45; border-radius: var(--dpp-r-control); padding: 0 14px; height: 30px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; cursor: pointer; white-space: nowrap;
  transition: filter 0.12s ease, background 0.12s ease, color 0.12s ease;
}
.dp-btn--xs { font-size: var(--dpp-f-label); padding: 0 12px; height: 26px; }
.dp-btn--md { font-size: var(--dpp-f-label); padding: 0 14px; height: 30px; }
.dp-btn--lg { font-size: var(--dpp-f-label); padding: 0 16px; height: 32px; }
.dp-btn--primary { background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
.dp-btn--primary:hover { filter: brightness(1.08); }
.dp-btn--warn { background: var(--dsw-alias-state-warn-primary); color: #fff; }
.dp-btn--warn:hover { filter: brightness(1.06); }
.dp-btn--ghost { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); }
.dp-btn--ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dp-btn--link { background: none; color: var(--dsw-alias-label-secondary); }
.dp-btn--link:hover { color: var(--dsw-alias-label-primary); }
.dp-btn:disabled { opacity: 0.6; cursor: default; }

@keyframes desk-pet-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;
