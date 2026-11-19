import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RuntimeDialog } from '../../src/scene/web/runtime-dialog';

/** The real dialog, rendered with real React: the DeskPet empty-state smoke
 *  cannot exercise the card, and this is what the split must not break. */
const dict: Record<string, string> = { rtMissingBody: 'Need {pkg} to run' };
const t = (key: string) => dict[key] ?? key;
const noop = () => {};
const base = {
  t,
  busy: false,
  claimError: '',
  cardOpen: true,
  floatOk: false,
  onInstall: noop,
  onCancel: noop,
  onDismiss: noop,
  onRetry: noop,
};

describe('RuntimeDialog', () => {
  it('renders the missing-runtime card', () => {
    const markup = renderToStaticMarkup(React.createElement(RuntimeDialog, {
      ...base,
      runtime: { phase: 'missing', required: '45.2.2' },
    }));
    expect(markup).toContain('rtMissingTitle');
    expect(markup).toContain('rtDownload');
    expect(markup).toContain('Need Electron 45.2.2 to run');
    expect(markup).toMatchSnapshot();
  });

  it('renders the downloading card with progress', () => {
    const markup = renderToStaticMarkup(React.createElement(RuntimeDialog, {
      ...base,
      runtime: { phase: 'downloading', required: '45.2.2', total: 100 * 1024 * 1024, received: 25 * 1024 * 1024 },
    }));
    expect(markup).toContain('25%');
    expect(markup).toContain('rtCancelDownload');
  });

  it('renders nothing when closed or without a phase', () => {
    expect(renderToStaticMarkup(React.createElement(RuntimeDialog, { ...base, cardOpen: false, runtime: null }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(RuntimeDialog, { ...base, runtime: null }))).toBe('');
  });
});
