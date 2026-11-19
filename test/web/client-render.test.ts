import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type Component = React.ComponentType<Record<string, unknown>>;
interface Registration {
  name: string;
  options: Record<string, unknown>;
  component: Component;
}
type Factory = (require: (name: string) => unknown) => { inject: string[]; apply: (ctx: unknown) => void };

/**
 * Render the real client components with real React and the real bundle. This
 * is a smoke test for the component split: a bad hook order, a missing prop or
 * a renamed local fails here instead of blanking the slot in the app.
 */
function loadPlugin(): Registration[] {
  let factory: Factory | undefined;
  const window = {
    __ModuleLoader__: {
      load(options: { factory: Factory }): void {
        factory = options.factory;
      },
    },
  };
  const storage = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  const sandbox: Record<string, unknown> = {
    window,
    console,
    localStorage,
    fetch: () => Promise.resolve({ json: async () => ({}) }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: () => 0,
    navigator: { language: 'en-US' },
    devicePixelRatio: 1,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('dist/client.js', 'utf8'), sandbox);
  expect(factory).toBeTypeOf('function');

  const registered: Registration[] = [];
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
        registered.push({ name: String(options.name), options, component });
        return () => {};
      },
    },
    layout: { selectPanel: () => {} },
    uiWorkspace: { openSession: () => {} },
  };
  // DeskPet calls useSyncExternalStore with two arguments (no server snapshot);
  // supply getSnapshot as the server fallback so the server render smoke works.
  const ReactForBundle = new Proxy(React, {
    get(target, prop, receiver) {
      if (prop === 'useSyncExternalStore') {
        return (subscribe: () => () => void, getSnapshot: () => unknown, getServerSnapshot?: () => unknown) =>
          target.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  const plugin = factory!((name) => {
    if (name === 'react') return ReactForBundle;
    throw new Error(`unexpected require: ${name}`);
  });
  plugin.apply(ctx);
  return registered;
}

describe('client components render', () => {
  const registered = loadPlugin();

  it('registers the three slots with the expected shapes', () => {
    expect(registered.map((entry) => entry.name).sort()).toEqual(['main', 'shell.overlay', 'sidebar.panellist']);
    const main = registered.find((entry) => entry.name === 'main')!;
    expect(main.options.key).toBe('desk-pet');
    const sidebar = registered.find((entry) => entry.name === 'sidebar.panellist')!;
    expect(sidebar.options.id).toBe('desk-pet');
    const overlay = registered.find((entry) => entry.name === 'shell.overlay')!;
    expect(overlay.options.id).toBe('desk-pet');
  });

  it('renders the settings page without throwing', () => {
    const page = registered.find((entry) => entry.name === 'main')!.component;
    const markup = renderToStaticMarkup(React.createElement(page, {}));
    expect(markup).toContain('desk-pet-page');
    expect(markup).toContain('dpp-card');
    expect(markup).toMatchSnapshot();
  });

  it('renders the overlay entry (empty state) without throwing', () => {
    const overlay = registered.find((entry) => entry.name === 'shell.overlay')!.component;
    const useSessions = (select: (state: unknown) => unknown) => select({ byId: {} });
    const useSessionStatus = (select: (state: unknown) => unknown) => select(new Map());
    const markup = renderToStaticMarkup(React.createElement(overlay, { useSessions, useSessionStatus }));
    expect(typeof markup).toBe('string');
  });

  it('renders the sidebar icon', () => {
    const icon = registered.find((entry) => entry.name === 'sidebar.panellist')!.component;
    const markup = renderToStaticMarkup(React.createElement(icon, { size: 18, active: false }));
    expect(markup).toContain('🐾');
  });
});
