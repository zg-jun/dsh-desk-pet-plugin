import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAW = readFileSync(fileURLToPath(new URL('../../src/scene/web/styles.js', import.meta.url)), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, ''); // 注释不算样式

describe('style guards', () => {
  it('never declares squircle corners', () => {
    expect(CSS).not.toMatch(/corner-shape:\s*squircle/);
  });

  it('keeps the float bubble styles on the shared token set', () => {
    const floatCss = readFileSync(fileURLToPath(new URL('../../src/scene/screen/style.css', import.meta.url)), 'utf8');
    expect(floatCss).toMatch(/--dpb-surface:/);
    expect(floatCss).toMatch(/--dpb-border:/);
    expect(floatCss).toMatch(/--dpb-primary:/);
    expect(floatCss).not.toMatch(/corner-shape:\s*squircle/);
  });

  it('keeps a blanket round-corner guard for the whole plugin subtree', () => {
    // 宿主会向元素注入 squircle；这条兜底必须存在，否则任意新元素都会被改形状。
    expect(CSS).toMatch(/\.desk-pet-page\.desk-pet-page\s*\*[\s\S]{0,80}corner-shape:\s*round\s*!important/);
    expect(CSS).toMatch(/\.desk-pet-runtime\.desk-pet-runtime\s*\*[\s\S]{0,80}corner-shape:\s*round\s*!important/);
  });
});
