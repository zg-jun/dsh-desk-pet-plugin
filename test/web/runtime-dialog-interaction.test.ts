import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { RuntimeDialog } from '../../src/scene/web/runtime-dialog';

const t = (key: string) => key;
const noop = () => {};

let dom: JSDOM;
let root: Root | undefined;

function props(runtime: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    t,
    runtime,
    busy: false,
    claimError: '',
    cardOpen: true,
    floatOk: false,
    onInstall: vi.fn(),
    onCancel: vi.fn(),
    onDismiss: vi.fn(),
    onRetry: vi.fn(),
    ...extra,
  };
}

async function mount(value: ReturnType<typeof props>): Promise<HTMLElement> {
  const host = dom.window.document.getElementById('host')!;
  root = createRoot(host);
  await act(async () => {
    root!.render(React.createElement(RuntimeDialog, value));
  });
  return host;
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label);
  if (!found) throw new Error(`button ${label} not found`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  dom = new JSDOM('<div id="host"></div>', { url: 'http://127.0.0.1/' });
  (globalThis as { window?: unknown }).window = dom.window;
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  dom.window.close();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('RuntimeDialog interactions', () => {
  it('installs or dismisses a missing runtime', async () => {
    const value = props({ phase: 'missing', required: '45.2.2' });
    const host = await mount(value);

    await act(async () => { button(host, 'rtDownload').click(); });
    expect(value.onInstall).toHaveBeenCalledTimes(1);

    await act(async () => { button(host, 'rtCancel').click(); });
    expect(value.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('cancels a download', async () => {
    const value = props({ phase: 'downloading', required: '45.2.2', total: 100, received: 25 });
    const host = await mount(value);

    await act(async () => { button(host, 'rtCancelDownload').click(); });
    expect(value.onCancel).toHaveBeenCalledTimes(1);
  });

  it('retries a ready runtime when claiming failed', async () => {
    const value = props({ phase: 'ready', version: '45.2.2', source: 'detected' }, { claimError: 'claim failed' });
    const host = await mount(value);

    await act(async () => { button(host, 'rtRetry').click(); });
    expect(value.onRetry).toHaveBeenCalledTimes(1);
  });

  it('dismisses on Escape', async () => {
    const value = props({ phase: 'missing', required: '45.2.2' });
    await mount(value);

    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(value.onDismiss).toHaveBeenCalledTimes(1);
  });
});
