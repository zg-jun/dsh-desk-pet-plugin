import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { usePetLifecycle } from '../../src/scene/web/pet-lifecycle';

let dom: JSDOM;
let root: Root | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let checkResponse: Record<string, unknown>;
let snapshot: any;

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

function Harness({ capture }: { capture: (value: unknown) => void }): null {
  const [runtime, setRuntime] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [claimError, setClaimError] = React.useState('');
  const [cardOpen, setCardOpen] = React.useState(false);
  const api = usePetLifecycle({ runtime, setRuntime, setBusy, setClaimError, cardOpen, setCardOpen });
  React.useEffect(() => {
    capture({ api, runtime, busy, claimError, cardOpen });
  });
  return null;
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

async function mount(): Promise<void> {
  root = createRoot(dom.window.document.getElementById('host')!);
  await act(async () => {
    root!.render(React.createElement(Harness, { capture: (value: unknown) => { snapshot = value; } }));
  });
  await act(async () => { vi.advanceTimersByTime(300); });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM('<div id="host"></div>', { url: 'http://127.0.0.1/' });
  (globalThis as { window?: unknown }).window = dom.window;
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  checkResponse = { ok: true, phase: 'missing', required: '45.2.2' };
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/runtime/check')) return json(checkResponse);
    if (url.includes('/runtime/install')) return json({ ok: true, phase: 'downloading' });
    if (url.includes('/runtime/cancel')) return json({ ok: true, phase: 'failed' });
    return json({ ok: true });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  vi.useRealTimers();
  dom.window.close();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('usePetLifecycle', () => {
  it('checks the runtime on mount without popping the card', async () => {
    await mount();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/runtime/check'))).toBe(true);
    expect(snapshot.runtime?.phase).toBe('missing');
    // 自动探测（挂载/状态同步）只更新状态，不弹运行时卡片
    expect(snapshot.cardOpen).toBe(false);

    // 显式检查（页面内动作）才打开
    await act(async () => { snapshot.api.checkRuntime(false); });
    await flush();
    expect(snapshot.cardOpen).toBe(true);

    await act(async () => { snapshot.api.dismissCard(); });
    expect(snapshot.cardOpen).toBe(false);
  });

  it('closes the card once the runtime is ready', async () => {
    await mount();
    await act(async () => { snapshot.api.checkRuntime(false); });
    await flush();
    expect(snapshot.cardOpen).toBe(true);

    checkResponse = { ok: true, phase: 'ready', version: '45.2.2' };
    await act(async () => { snapshot.api.checkRuntime(true); });
    await flush();
    await act(async () => { vi.advanceTimersByTime(900); });
    await flush();
    expect(snapshot.cardOpen).toBe(false);
  });

  it('starts an install without claiming a window', async () => {
    await mount();
    await act(async () => { snapshot.api.startInstall(); });
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/runtime/install'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/float-open'))).toBe(false);
    expect(snapshot.busy).toBe(false);
  });

  it('switches out of the downloading state even if the Host still reports it', async () => {
    await mount();
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: unknown) => (
      String(input).includes('/runtime/cancel')
        ? json({ ok: true, phase: 'downloading', received: 10, total: 100 })
        : json({ ok: true })
    )) as unknown as typeof fetch;
    await act(async () => { snapshot.api.cancelDownload(); });
    await flush();
    globalThis.fetch = original;
    expect(snapshot.runtime?.phase).toBe('missing');
  });

  it('cancels a download through the Host', async () => {
    await mount();
    await act(async () => { snapshot.api.checkRuntime(false); });
    await flush();
    expect(snapshot.cardOpen).toBe(true);
    await act(async () => { snapshot.api.cancelDownload(); });
    await flush();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/runtime/cancel'))).toBe(true);
    // 取消后弹框立即关闭，不会停在“未就绪”界面
    expect(snapshot.cardOpen).toBe(false);
  });
});
