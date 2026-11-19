import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useStatusReport } from '../../src/scene/web/status-report';

let dom: JSDOM;
let root: Root | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

function Probe({ onPetOn }: { onPetOn: (value: boolean) => void }): null {
  const status = {
    mode: 'waiting', task: 't', kind: 'approval', sessionId: 's1',
    pending: { kind: 'approval', sessionId: 's1', summary: 'ok', options: ['allowed-once'] },
  };
  useStatusReport({ status, onPetOn });
  return null;
}

async function mount(onPetOn: (value: boolean) => void): Promise<void> {
  root = createRoot(dom.window.document.getElementById('host')!);
  await act(async () => { root!.render(React.createElement(Probe, { onPetOn })); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  dom = new JSDOM('<div id="host"></div>', { url: 'http://127.0.0.1/' });
  (globalThis as { window?: unknown }).window = dom.window;
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, petOn: false }) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  vi.useRealTimers();
  dom.window.close();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('useStatusReport', () => {
  it('pushes pending to /pending and forwards petOn', async () => {
    const onPetOn = vi.fn();
    await mount(onPetOn);
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(call[0]).toContain('/pending');
    expect(JSON.parse(call[1].body)).toMatchObject({ sessionId: 's1', kind: 'approval' });
    expect(onPetOn).toHaveBeenCalledWith(false);
  });

  it('does not heartbeat on a timer', async () => {
    const onPetOn = vi.fn();
    await mount(onPetOn);
    const calls = fetchMock.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(30000); });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
