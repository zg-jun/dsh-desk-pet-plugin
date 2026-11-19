import React from 'react';
import { catIcon } from '../../assets/cat';
import { buttonClass } from '../../ui/button';
import { useModalA11y } from './modal-a11y';

const h = React.createElement;
const { useRef } = React;
const MB = 1024 * 1024;

const mbOf = (bytes) => (bytes / MB).toFixed(1);
const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] != null ? String(vars[key]) : m));

function cardTitleFor(t, phase) {
  return {
    checking: t('rtCheckingTitle'),
    missing: t('rtMissingTitle'),
    outdated: t('rtOutdatedTitle'),
    downloading: t('rtDownloadingTitle'),
    extracting: t('rtExtractingTitle'),
    ready: t('rtReadyTitle'),
    failed: t('rtFailedTitle'),
  }[phase] || '';
}

function cardBodyFor(t, runtime, phase, pkg, pkgVersion) {
  if (phase === 'checking') return t('rtCheckingBody');
  if (phase === 'missing') return fill(t('rtMissingBody'), { pkg });
  if (phase === 'outdated') return fill(t('rtOutdatedBody'), { found: (runtime && runtime.found) || '', required: pkgVersion });
  if (phase === 'downloading') return fill(t('rtDownloadBody'), { pkg });
  if (phase === 'extracting') return t('rtExtractingBody');
  if (phase === 'ready') {
    const usedVersion = (runtime && runtime.version) || '';
    if (!usedVersion) return t('rtReadyBodyUnknown');
    const local = runtime.source === 'detected' || runtime.source === 'env';
    return fill(t(local ? 'rtReadyBodyLocal' : 'rtReadyBody'), { version: usedVersion });
  }
  if (phase === 'failed') return String((runtime && runtime.error) || '');
  return '';
}

function cardActionsFor({ t, phase, busy, onInstall, onCancel, onDismiss, onRetry }) {
  if (phase === 'missing') {
    return [
      h('button', { key: 'dl', className: buttonClass('primary', 'lg'), disabled: busy, onClick: onInstall }, t('rtDownload')),
      h('button', { key: 'x', className: buttonClass('ghost', 'lg'), onClick: onDismiss }, t('rtCancel')),
    ];
  }
  if (phase === 'outdated') {
    return [
      h('button', { key: 'up', className: buttonClass('warn', 'lg'), disabled: busy, onClick: onInstall }, t('rtUpdate')),
      h('button', { key: 'x', className: buttonClass('ghost', 'lg'), onClick: onDismiss }, t('rtCancel')),
    ];
  }
  if (phase === 'downloading' || phase === 'extracting') {
    return [h('button', { key: 'c', className: buttonClass('link', null), onClick: onCancel }, t('rtCancelDownload'))];
  }
  if (phase === 'ready') {
    return [h('button', { key: 'ok', className: buttonClass('primary', 'lg'), disabled: busy, onClick: onRetry }, t('rtRetry'))];
  }
  if (phase === 'failed') {
    return [
      h('button', { key: 'r', className: buttonClass('primary', 'lg'), disabled: busy, onClick: onInstall }, t('rtRetry')),
      h('button', { key: 'x', className: buttonClass('ghost', 'lg'), onClick: onDismiss }, t('rtCancel')),
    ];
  }
  return null;
}

function metaFor(phase, pct, gotBytes, totalBytes) {
  return phase === 'downloading' ? `${pct}% · ${mbOf(gotBytes)} / ${mbOf(totalBytes)} MB` : '';
}

// Class names for the current phase, kept out of the component so its
// complexity budget stays for the state wiring.
function phaseClasses(phase, pct) {
  const download = phase === 'downloading' || phase === 'extracting';
  return {
    title: `desk-pet-runtime-title${phase === 'ready' ? ' ok' : ''}${phase === 'failed' ? ' err' : ''}${phase === 'outdated' ? ' warn' : ''}`,
    bar: `desk-pet-runtime-bar${phase === 'ready' ? ' ok' : ''}`,
    actions: `desk-pet-runtime-actions${download ? ' progress' : ''}`,
    check: phase === 'ready' ? ' ✓' : '',
    width: `${phase === 'ready' ? 100 : pct}%`,
  };
}

function RuntimeDialog({ t, runtime, busy, claimError, cardOpen, floatOk, onInstall, onCancel, onDismiss, onRetry }) {
  const phase = runtime && runtime.phase;
  const pkgVersion = (runtime && runtime.required) || '';
  const pkg = pkgVersion ? `Electron ${pkgVersion}` : '';
  const totalBytes = (runtime && runtime.total) || 0;
  const gotBytes = (runtime && runtime.received) || 0;
  const pct = totalBytes > 1 ? Math.min(100, Math.round((gotBytes / totalBytes) * 100)) : 0;
  const cardTitle = cardTitleFor(t, phase);
  const cardBody = cardBodyFor(t, runtime, phase, pkg, pkgVersion);
  const showBar = phase === 'downloading' || phase === 'extracting' || phase === 'ready';
  const metaText = metaFor(phase, pct, gotBytes, totalBytes);
  const cardActions = cardActionsFor({ t, phase, busy, onInstall, onCancel, onDismiss, onRetry });
  const classes = phaseClasses(phase, pct);
  const showCard = cardOpen && !floatOk && phase && (phase !== 'ready' || claimError);

  // The overlay slot lives under a transformed ancestor, so a fixed box is
  // laid out against that ancestor instead of the window. Measure it and
  // place the card at the real window center (same visual as the settings
  // dialog).
  const layerRef = useRef(null);
  const cardRef = useRef(null);
  useModalA11y(showCard, cardRef, onDismiss);
  const placeCard = () => {
    const layer = layerRef.current;
    const card = cardRef.current;
    if (!layer || !card) return;
    const box = layer.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    card.style.left = `${(window.innerWidth - w) / 2 - box.left}px`;
    card.style.top = `${(window.innerHeight - h) / 2 - box.top}px`;
  };
  const useIsoLayout = React.useLayoutEffect || React.useEffect;
  useIsoLayout(() => {
    if (!showCard) return undefined;
    placeCard();
    const onChange = () => placeCard();
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, [showCard, phase, claimError, metaText]);

  return showCard && h('div', { ref: layerRef, className: 'desk-pet-runtime-layer', role: 'presentation' },
    h('div', { ref: cardRef, className: 'desk-pet-runtime', role: 'dialog', 'aria-modal': 'true', tabIndex: -1, 'aria-label': cardTitle },
      h('div', { className: 'desk-pet-runtime-icon' }, catIcon(h, 48)),
      h('div', { className: classes.title }, cardTitle, classes.check),
      cardBody && h('div', { className: 'desk-pet-runtime-body' }, cardBody),
      phase === 'failed' && runtime && runtime.detail
        ? h('div', { className: 'desk-pet-runtime-detail' }, runtime.detail)
        : null,
      claimError && h('div', { className: 'desk-pet-runtime-body', style: { color: 'var(--dp-err)' } }, claimError),
      showBar && h('div', { className: classes.bar }, h('i', { style: { width: classes.width } })),
      metaText && h('div', { className: 'desk-pet-runtime-meta' }, metaText),
      cardActions && h('div', { className: classes.actions }, cardActions)));
}

export { RuntimeDialog };
