import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

type Component = React.ComponentType<Record<string, unknown>>;
type Factory = (require: (name: string) => unknown) => { inject: string[]; apply: (ctx: unknown) => void };

let dom: JSDOM;
let root: Root | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let page: Component;

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as Response;
}

function loadPlugin(fetchImpl: typeof fetch, win: any, doc: Document): Record<string, Component> {
  let factory: Factory | undefined;
  (win as unknown as { __ModuleLoader__?: unknown }).__ModuleLoader__ = {
    load(options: { factory: Factory }): void { factory = options.factory; },
  };
  const sandbox: Record<string, unknown> = {
    window: win,
    document: doc,
    console,
    localStorage: win.localStorage,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    navigator: win.navigator,
    devicePixelRatio: 1,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('dist/client.js', 'utf8'), sandbox);
  expect(factory).toBeTypeOf('function');

  const registered: Record<string, Component> = {};
  const ctx = {
    effect: (callback: () => unknown) => {
      const dispose = callback();
      return () => { if (typeof dispose === 'function') dispose(); };
    },
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key,
      subscribe: () => () => {},
      getSnapshot: () => ({ active: 'en', locales: [], revision: 0 }),
    },
    slots: {
      inject: (_slot: string, callback: () => unknown) => callback(),
      register: (options: Record<string, unknown>, component: Component) => {
        registered[String(options.name)] = component;
        return () => {};
      },
    },
    layout: { selectPanel: () => {} },
    uiWorkspace: { openSession: () => {} },
  };
  const plugin = factory!((name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected require: ${name}`);
  });
  plugin.apply(ctx);
  return registered;
}

beforeEach(async () => {
  dom = new JSDOM('<div id="host"></div>', { url: 'http://127.0.0.1/' });
  (dom.window.HTMLElement.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (globalThis as { window?: unknown }).window = dom.window;
  (globalThis as { document?: unknown }).document = dom.window.document;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/manifest')) return json({ ok: true, pets: [] });
    if (url.includes('/installed')) return json({ ok: true, pets: [] });
    return json({ ok: true });
  });
  const registered = loadPlugin(fetchMock as unknown as typeof fetch, dom.window, dom.window.document);
  page = registered.main!;
  root = createRoot(dom.window.document.getElementById('host')!);
  await act(async () => {
    root!.render(React.createElement(page));
  });
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  dom.window.close();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('PetPage interactions', () => {
  it('posts petOn when the switch is clicked', async () => {
    const host = dom.window.document.getElementById('host')!;
    const toggle = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();

    await act(async () => { toggle.click(); });

    const configCall = (fetchMock.mock.calls as Array<[unknown, RequestInit]>).find(([url]) => String(url).endsWith('/config'));
    expect(configCall).toBeTruthy();
    expect(String(configCall![1].body)).toBe('{"petOn":true}');
  });

});
