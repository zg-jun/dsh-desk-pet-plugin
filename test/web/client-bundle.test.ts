import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

interface Plugin {
  readonly inject: readonly string[];
  readonly apply: (ctx: unknown) => void;
}

type Factory = (require: (name: string) => unknown) => Plugin;

/**
 * client.js is generated. This guards the `__ModuleLoader__` + `factory(require)`
 * contract that the shell depends on, and that the bundle returns the plugin.
 */
describe('client.js artifact', () => {
  it('loads through __ModuleLoader__ and returns the plugin', () => {
    let factory: Factory | undefined;
    const window = {
      __ModuleLoader__: {
        load(options: { factory: Factory }): void {
          factory = options.factory;
        },
      },
    };

    class Component {}
    const React = {
      createElement: () => null,
      Component,
      useCallback: (fn: unknown) => fn,
      useEffect: () => undefined,
      useRef: () => ({ current: null }),
      useState: (value: unknown) => [value, () => undefined],
      useSyncExternalStore: () => ({}),
    };

    const sandbox: Record<string, unknown> = {
      window,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      requestAnimationFrame: () => 0,
      devicePixelRatio: 1,
      localStorage: { getItem: () => null, setItem: () => undefined },
      fetch: () => Promise.resolve({ json: async () => ({}) }),
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync('dist/client.js', 'utf8'), sandbox);

    expect(factory).toBeTypeOf('function');
    const plugin = factory!((name) => {
      if (name === 'react') return React;
      throw new Error(`unexpected require: ${name}`);
    });
    expect(plugin.inject).toEqual(['slots', 'locale', 'uiWorkspace', 'layout']);
    expect(plugin.apply).toBeTypeOf('function');
  });
});
