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
let installed: Array<{ slug: string; displayName: string; description?: string; ext?: string }>;

const manifest = [
  { slug: 'alpha', displayName: 'Alpha', description: 'first', spritesheetUrl: 'https://x/a.webp' },
  { slug: 'beta', displayName: 'Beta', description: 'second', spritesheetUrl: 'https://x/b.webp' },
];

const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

function loadPlugin(fetchImpl: typeof fetch, win: any, doc: Document): Record<string, Component> {
  let factory: Factory | undefined;
  (win as any).__ModuleLoader__ = { load: (o: { factory: Factory }) => { factory = o.factory; } };
  const sandbox: Record<string, unknown> = {
    window: win, document: doc, console, localStorage: win.localStorage, fetch: fetchImpl,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    navigator: win.navigator, devicePixelRatio: 1, Image: win.Image,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync('dist/client.js', 'utf8'), sandbox);
  const registered: Record<string, Component> = {};
  const ctx = {
    effect: (cb: () => unknown) => { const d = cb(); return () => { if (typeof d === 'function') d(); }; },
    locale: { register: () => () => {}, bind: () => (k: string) => k, subscribe: () => () => {}, getSnapshot: () => ({ active: 'en', locales: [], revision: 0 }) },
    slots: { inject: (_s: string, cb: () => unknown) => cb(), register: (o: Record<string, unknown>, c: Component) => { registered[String(o.name)] = c; return () => {}; } },
    layout: { selectPanel: () => {} }, uiWorkspace: { openSession: () => {} },
  };
  factory!((name) => { if (name === 'react') return React; throw new Error(name); }).apply(ctx);
  return registered;
}

async function mount(): Promise<void> {
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/manifest')) return json({ ok: true, pets: manifest });
    if (url.includes('/installed')) return json({ ok: true, pets: installed });
    if (url.endsWith('/status')) return json({ ok: true, slug: 'alpha', opacity: 1, size: 1, petOn: false });
    if (url.includes('/runtime/check')) return json({ ok: true, phase: 'ready', source: 'detected', version: '45.2.2' });
    if (url.includes('/runtime')) return json({ ok: true, phase: 'ready', source: 'detected', version: '45.2.2' });
    if (url.endsWith('/install') || url.endsWith('/remove') || url.endsWith('/config')) {
      return json({ ok: true, petOn: true });
    }
    return json({ ok: true });
  });
  const registered = loadPlugin(fetchMock as unknown as typeof fetch, dom.window, dom.window.document);
  page = registered.main!;
  root = createRoot(dom.window.document.getElementById('host')!);
  await act(async () => { root!.render(React.createElement(page)); });
  await act(async () => { await Promise.resolve(); });
}

function callsTo(suffix: string): Array<[string, RequestInit]> {
  return (fetchMock.mock.calls as Array<[string, RequestInit]>).filter(([url]) => String(url).endsWith(suffix));
}

function setInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  const previous = input.value;
  setter.call(input, value);
  const tracker = (input as any)._valueTracker;
  if (tracker) tracker.setValue(previous);
  input.focus();
  input.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

beforeEach(async () => {
  dom = new JSDOM('<div id="host"></div>', { url: 'http://127.0.0.1/' });
  (dom.window.HTMLElement.prototype as any).scrollTo = () => {};
  (dom.window.HTMLCanvasElement.prototype as any).getContext = () => ({
    drawImage() {}, clearRect() {}, save() {}, restore() {}, scale() {}, translate() {},
    setTransform() {}, imageSmoothingEnabled: false, getImageData: () => ({ data: [] }),
  });
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  installed = [{ slug: 'alpha', displayName: 'Alpha', description: 'first', ext: 'webp' }];
  await mount();
});

afterEach(() => {
  if (root) act(() => { root!.unmount(); });
  root = undefined;
  dom.window.close();
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe('PetPage feature regression', () => {
  it('searches, previews, and installs a catalog pet via React props', async () => {
    const input = dom.window.document.querySelector('.dpp-search input') as HTMLInputElement;
    const key = Object.keys(input).find((k) => k.startsWith('__reactProps$'));
    expect(key).toBeTruthy();
    const props = (input as any)[key!];
    await act(async () => {
      props.onChange({ target: { value: 'beta' } });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const results = dom.window.document.querySelectorAll('.dpp-result');
    expect(results.length).toBe(1);
    expect(results[0]!.textContent).toContain('Beta');
    await act(async () => { (results[0]! as HTMLElement).click(); });
    expect(dom.window.document.querySelector('.dpp-preview')).toBeTruthy();
    const installBtn = results[0]!.querySelector('button') as HTMLButtonElement;
    await act(async () => { installBtn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const install = callsTo('/install')[0];
    expect(install).toBeTruthy();
    expect(JSON.parse(String(install![1]!.body))).toMatchObject({ slug: 'beta' });
  });

  it('hydrates the active pet from Host status when overlay is absent', async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const active = dom.window.document.querySelector('.dpp-pet.active');
    expect(active).toBeTruthy();
    expect(active!.textContent).toContain('Alpha');
  });

  it('switches active pet and posts config', async () => {
    const tiles = dom.window.document.querySelectorAll('.dpp-pet');
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    await act(async () => { (tiles[1] as HTMLElement).click(); });
    const config = callsTo('/config').at(-1)!;
    expect(JSON.parse(String(config[1]!.body))).toMatchObject({ slug: 'alpha' });
  });

  it('centers the clicked pet in the 3D row', async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const tiles = dom.window.document.querySelectorAll('.dpp-pet');
    await act(async () => { (tiles[1] as HTMLElement).click(); });
    const active = dom.window.document.querySelector('.dpp-pet.active') as HTMLElement;
    expect(active).toBe(tiles[1]);
    expect(active.style.transform).toContain('translateX(0.0px)');
    expect(active.style.opacity).toBe('1');
  });

  it('clears the search when the drawer closes', async () => {
    const input = dom.window.document.querySelector('.dpp-search input') as HTMLInputElement;
    const key = Object.keys(input).find((k) => k.startsWith('__reactProps$'));
    await act(async () => {
      (input as any)[key!].onChange({ target: { value: 'beta' } });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(dom.window.document.querySelectorAll('.dpp-result').length).toBe(1);
    const close = dom.window.document.querySelector('.dpp-close') as HTMLElement;
    await act(async () => { close.click(); });
    expect(input.value).toBe('');
    expect(dom.window.document.querySelectorAll('.dpp-result').length).toBe(0);
  });

  it('preview action does not touch the pool chips', async () => {
    const stageIdle = Array.from(dom.window.document.querySelectorAll('.dpp-chip'))
      .find((el) => el.textContent === 'pgAct_idle') as HTMLElement;
    expect(stageIdle.classList.contains('on')).toBe(true);
    const input = dom.window.document.querySelector('.dpp-search input') as HTMLInputElement;
    const key = Object.keys(input).find((k) => k.startsWith('__reactProps$'));
    await act(async () => {
      (input as any)[key!].onChange({ target: { value: 'beta' } });
      await new Promise((r) => setTimeout(r, 10));
    });
    // 默认不预览：没点结果前没有动作区
    expect(dom.window.document.querySelectorAll('.dpp-acts .a').length).toBe(0);
    const row = dom.window.document.querySelector('.dpp-result') as HTMLElement;
    expect(row).toBeTruthy();
    await act(async () => { row.click(); });
    const wave = Array.from(dom.window.document.querySelectorAll('.dpp-acts .a'))
      .find((el) => el.textContent === 'pgAct_wave') as HTMLElement;
    expect(wave).toBeTruthy();
    await act(async () => { wave.click(); });
    expect(stageIdle.classList.contains('on')).toBe(true);
    expect(wave.classList.contains('on')).toBe(true);
  });

  it('switches when pointerup lands on another pet', async () => {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const tiles = dom.window.document.querySelectorAll('.dpp-pet');
    const target = tiles[1] as HTMLElement;
    await act(async () => {
      const down = new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 300 });
      const up = new dom.window.MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 500, clientY: 300 });
      target.dispatchEvent(down);
      target.dispatchEvent(up);
    });
    const config = callsTo('/config').at(-1)!;
    expect(config).toBeTruthy();
    expect(JSON.parse(String(config[1]!.body))).toMatchObject({ slug: 'alpha' });
  });

  it('removes an installed pet through /remove', async () => {
    const tiles = dom.window.document.querySelectorAll('.dpp-pet');
    const remove = tiles[1]!.querySelector('.x') as HTMLButtonElement;
    expect(remove).toBeTruthy();
    await act(async () => { remove.click(); });
    const call = callsTo('/remove')[0];
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call![1]!.body))).toMatchObject({ slug: 'alpha' });
  });

  it('applies opacity and size through /config', async () => {
    const segs = dom.window.document.querySelectorAll('.dpp-seg');
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const opacity = Array.from(segs[0]!.querySelectorAll('.s')).find((el) => el.textContent === '60%') as HTMLElement;
    expect(opacity).toBeTruthy();
    await act(async () => { opacity.click(); });
    expect(JSON.parse(String(callsTo('/config').at(-1)![1]!.body))).toMatchObject({ opacity: 0.6 });
    const size = segs[1]!.querySelectorAll('.s')[2] as HTMLElement;
    await act(async () => { size.click(); });
    expect(JSON.parse(String(callsTo('/config').at(-1)![1]!.body))).toMatchObject({ size: expect.any(Number) });
  });
});
