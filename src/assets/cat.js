/**
 * Built-in cat icon (64x64). The float window draws a 96x96 animated variant
 * with its own eye/tail ids; this is the static mark used by the settings page
 * and the runtime card.
 */
export function catIcon(h, size = 52) {
  return h('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true },
    h('rect', { width: 64, height: 64, rx: 14, fill: '#fff4d6' }),
    h('path', { d: 'M17 28 L11 7 L34 19 Z', fill: '#f2b950' }),
    h('path', { d: 'M47 28 L53 7 L30 19 Z', fill: '#f2b950' }),
    h('circle', { cx: 32, cy: 39, r: 20, fill: '#ffd166' }),
    h('ellipse', { cx: 22, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
    h('ellipse', { cx: 42, cy: 43, rx: 3.4, ry: 2.2, fill: '#ffab9e', opacity: 0.8 }),
    h('circle', { cx: 25, cy: 36, r: 3, fill: '#3a2c1a' }),
    h('circle', { cx: 39, cy: 36, r: 3, fill: '#3a2c1a' }),
    h('path', { d: 'M28 44 Q32 47 36 44', stroke: '#3a2c1a', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' }));
}
