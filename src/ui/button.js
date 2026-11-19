/**
 * One button primitive for both scenes. Sizes reproduce the previous paddings;
 * variants resolve against --dp-* first, then the app's --dsw-alias-* tokens.
 * @param {'primary'|'ghost'|'warn'|'link'} variant
 * @param {'xs'|'md'|'lg'|null} size
 */
export function buttonClass(variant, size = 'md') {
  return `dp-btn dp-btn--${variant}${size ? ` dp-btn--${size}` : ''}`;
}
