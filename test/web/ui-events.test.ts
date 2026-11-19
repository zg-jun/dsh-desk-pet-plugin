import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useUiEvents } from '../../src/scene/web/ui-events';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(event: { data: string }) => void>>();
  closed = false;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, callback: (event: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(callback);
    this.listeners.set(type, list);
  }
  close(): void {
    this.closed = true;
  }
  error(): void {
    this.onerror?.();
  }
  emit(type: string, payload: unknown): void {
    for (const callback of this.listeners.get(type) ?? []) callback({ data: JSON.stringify(payload) });
  }
}

interface UiEventsProps {
  statusRef: { current: Map<string, any> };
  openPage: () => void;
  checkRuntime: (auto: boolean) => void;
  openSession: (id: string) => void;
  onPetOn: (on: boolean) => void;
  onQuit: () => void;
  onStatus?: (status: any) => void;
}

function Probe(props: UiEventsProps): null {
  useUiEvents(props as any);
  return null;
}

let dom: JSDOM;
let root: Root | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeEventSource.instances = [];
  dom = new JSDOM('<div id="host"></div>');
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  dom.window.close();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function mount(props: UiEventsProps): Promise<FakeEventSource> {
  root = createRoot(document.getElementById('host')!);
  await act(async () => {
    root!.render(React.createElement(Probe, props));
  });
  return FakeEventSource.instances[0]!;
}

describe('useUiEvents', () => {
  it('connects the SSE stream and handles open-settings once per id', async () => {
    const openPage = vi.fn();
    const source = await mount({
      statusRef: { current: new Map() },
      openPage,
      checkRuntime: vi.fn(),
      openSession: vi.fn(),
      onPetOn: vi.fn(),
      onQuit: vi.fn(),
    });
    expect(source.url).toContain('/api/desk-pet/stream');

    act(() => source.emit('ui-event', { id: 'e1', type: 'open-settings' }));
    expect(openPage).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/desk-pet/ui-event'), expect.objectContaining({ method: 'POST' }));

    act(() => source.emit('ui-event', { id: 'e1', type: 'open-settings' }));
    expect(openPage).toHaveBeenCalledTimes(1);
  });

  it('routes pet-answer and quit-pet, and forwards petOn from status', async () => {
    const answer = vi.fn();
    const onQuit = vi.fn();
    const onPetOn = vi.fn();
    const onStatus = vi.fn();
    const source = await mount({
      statusRef: { current: new Map([['s1', { pendingInteraction: { answer } }]]) },
      openPage: vi.fn(),
      checkRuntime: vi.fn(),
      openSession: vi.fn(),
      onPetOn,
      onStatus,
      onQuit,
    });

    act(() => source.emit('ui-event', {
      id: 'e2', type: 'pet-answer', sessionId: 's1', kind: 'approval', answer: 'allowed-once',
    }));
    expect(answer).toHaveBeenCalledWith('allowed-once');

    act(() => source.emit('ui-event', { id: 'e3', type: 'quit-pet' }));
    expect(onQuit).toHaveBeenCalledTimes(1);

    act(() => source.emit('status', { petOn: false, slug: 'alpha' }));
    expect(onPetOn).toHaveBeenCalledWith(false);
    expect(onStatus).toHaveBeenCalledWith({ petOn: false, slug: 'alpha' });
  });

  it('falls back to polling when SSE errors', async () => {
    const source = await mount({
      statusRef: { current: new Map() },
      openPage: vi.fn(),
      checkRuntime: vi.fn(),
      openSession: vi.fn(),
      onPetOn: vi.fn(),
      onQuit: vi.fn(),
    });
    act(() => source.error());
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/desk-pet/ui-event'));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/desk-pet/status'));
  });

  it('closes the stream on unmount', async () => {
    const source = await mount({
      statusRef: { current: new Map() },
      openPage: vi.fn(),
      checkRuntime: vi.fn(),
      openSession: vi.fn(),
      onPetOn: vi.fn(),
      onQuit: vi.fn(),
    });
    expect(source.closed).toBe(false);
    act(() => { root!.unmount(); });
    root = undefined;
    expect(source.closed).toBe(true);
  });
});
