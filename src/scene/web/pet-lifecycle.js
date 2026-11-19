import React from 'react';
import * as core from '../../core/browser';

const { useEffect } = React;

/**
 * Runtime resolution only. The Host owns petOn, spawn/kill, and the child
 * lifecycle; the client must not claim or respawn a window.
 */
export function usePetLifecycle({ runtime, setRuntime, setBusy, setClaimError, cardOpen, setCardOpen }) {
  const applyRuntime = (data) => {
    if (!data || data.ok !== true) return;
    setRuntime(data);
  };

  const checkRuntime = async (auto, attempt = 0) => {
    try {
      const res = await fetch(`${core.API_BASE}/runtime/check`, { method: 'POST' });
      const data = await res.json();
      applyRuntime(data);
      const phase = data && data.phase;
      // auto=true 是静默探测（挂载/状态同步）：只更新状态，绝不弹窗；
      // 只有页面内的显式动作（点开关、点重新检测、收到 open-runtime-card）才打开运行时卡片。
      if (!auto) setCardOpen(true);
    } catch {
      if (attempt < 2) setTimeout(() => checkRuntime(auto, attempt + 1), 700);
    }
  };

  const startInstall = async () => {
    setBusy(true);
    setClaimError('');
    setRuntime((prev) => ({ ...(prev || {}), ok: true, phase: 'downloading', received: 0, total: 0, error: '' }));
    try {
      const res = await fetch(`${core.API_BASE}/runtime/install`, { method: 'POST' });
      const data = await res.json();
      if (!data || data.ok !== true) checkRuntime(false);
    } catch {
      checkRuntime(false);
    }
    setBusy(false);
  };

  const cancelDownload = async () => {
    // 取消就是结束这次操作：先关掉弹框，避免它停在被取消后的“未就绪”状态。
    setCardOpen(false);
    try {
      const res = await fetch(`${core.API_BASE}/runtime/cancel`, { method: 'POST' });
      const data = await res.json();
      // 宿主已经同步退出下载态；若响应仍是 downloading，本地也先切走，避免界面“没反应”。
      applyRuntime(data && data.phase === 'downloading'
        ? { ...data, phase: 'missing', received: 0, total: 0 }
        : data);
    } catch { /* host unreachable */ }
  };

  const dismissCard = () => setCardOpen(false);

  useEffect(() => {
    const id = setTimeout(() => checkRuntime(true), 250);
    return () => clearTimeout(id);
  }, []);

  // 装好后自动关闭卡片（宠物由 Host 自动激活），避免停在“已完成”界面。
  useEffect(() => {
    if (!cardOpen) return undefined;
    if (!runtime || runtime.phase !== 'ready') return undefined;
    const id = setTimeout(() => setCardOpen(false), 800);
    return () => clearTimeout(id);
  }, [cardOpen, runtime && runtime.phase]);

  useEffect(() => {
    if (!cardOpen) return undefined;
    const phase = runtime && runtime.phase;
    if (phase !== 'downloading' && phase !== 'extracting') return undefined;
    const tick = async () => {
      try {
        const r = await fetch(`${core.API_BASE}/runtime`);
        const d = await r.json();
        if (d && d.ok) setRuntime(d);
      } catch { /* host unreachable */ }
    };
    const id = setInterval(tick, 700);
    return () => clearInterval(id);
  }, [cardOpen, runtime && runtime.phase]);

  return { checkRuntime, startInstall, cancelDownload, dismissCard };
}
