import React from 'react';
import { h, PetPreview, PetThumb, spriteUrl, thumbUrl, CAT_SVG, ACTIONS, PET_SIZES, PET_OPACITIES } from './shared';
import { PetScene } from './pet-carousel';
import { useModalA11y } from './modal-a11y';
import { H, R } from './tokens';

const { useRef } = React;

const fill = (text, vars) => String(text || '').replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] != null ? String(vars[key]) : m));

const SEARCH_ICON = h('svg', { className: 'ico', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
  h('circle', { cx: 7, cy: 7, r: 4.6, stroke: 'currentColor', strokeWidth: 1.4 }),
  h('path', { d: 'M10.6 10.6 L13.6 13.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));

function Switch(props) {
  const { t, petOn, switching, onToggle } = props;
  return h('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': petOn ? 'true' : 'false',
    'aria-label': t('pgShowPet'),
    className: 'dpp-switch',
    disabled: switching,
    onClick: () => onToggle(!petOn),
  },
  h('span', { className: 'dpp-switch-label' }, t('pgShowPet')),
  h('span', { className: `dpp-switch-track${petOn ? ' on' : ''}`, style: { borderRadius: R.pill } },
    h('i', { style: { borderRadius: R.round } })));
}

function StageBar(props) {
  const { t, anim, onAnim, onAdd } = props;
  return h('div', { className: 'dpp-bar' },
    ACTIONS.map((action) => h('button', {
      key: action.anim,
      type: 'button',
      className: `dpp-chip${anim === action.anim ? ' on' : ''}`,
      style: { borderRadius: R.pill, height: H.chip },
      'aria-pressed': anim === action.anim ? 'true' : 'false',
      onClick: () => onAnim(action.anim),
    }, t(`pgAct_${action.key}`))),
    h('button', { type: 'button', className: 'dpp-add', style: { borderRadius: R.pill, height: H.button }, onClick: onAdd }, t('addPet')));
}

export function Stage(props) {
  const { t, pets, activeSlug, anim, petOn, switching, onToggle, onAnim, onPick, onRemove, onAdd } = props;
  return h('section', { className: 'dpp-stage' },
    h('div', { className: 'dpp-stage-head' },
      h('div', null,
        h('div', { className: 'dpp-stage-name' }, t('currentPet')),
        h('div', { className: 'dpp-stage-meta' },
          fill(t('pgPetsSub'), { n: pets.length }))),
      h(Switch, { t, petOn, switching, onToggle })),
    h(PetScene, {
      pets,
      activeSlug,
      anim,
      removeLabel: t('remove'),
      activeLabel: t('active'),
      onPick,
      onRemove,
    }),
    h(StageBar, { t, anim, onAnim, onAdd }));
}

function Segment(props) {
  const { items, value, onPick } = props;
  const ref = useRef(null);
  const [thumb, setThumb] = React.useState({ left: 2, width: 0 });
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const node = root.querySelector('.s.on');
    if (!node) return;
    setThumb({ left: node.offsetLeft, width: node.offsetWidth });
  }, [value, items.length]);
  return h('div', { className: 'dpp-seg', ref, style: { borderRadius: R.control } },
    h('span', {
      className: 'dpp-seg-thumb',
      style: { width: thumb.width, transform: `translateX(${thumb.left - 2}px)`, borderRadius: R.item },
    }),
    items.map((item) => h('span', {
    key: item.key,
    className: `s${Math.abs(value - item.value) < 0.01 ? ' on' : ''}`,
    style: { borderRadius: R.item, height: H.seg },
    role: 'button',
    tabIndex: 0,
    'aria-pressed': Math.abs(value - item.value) < 0.01 ? 'true' : 'false',
    onClick: () => onPick(item.value),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPick(item.value);
      }
    },
  }, item.label)));
}

export function SettingsCard(props) {
  const { t, opacity, size, onOpacity, onSize } = props;
  const opacityItems = PET_OPACITIES.map((v) => ({ key: String(v), value: v, label: `${Math.round(v * 100)}%` }));
  const sizeItems = PET_SIZES.map((item) => ({
    key: item.key,
    value: item.value,
    label: t(`pgSize${item.key[0].toUpperCase()}${item.key.slice(1)}`),
  }));
  return h('section', { className: 'dpp-card' },
    h('div', { className: 'dpp-card-head' }, h('h3', null, t('appearance'))),
    h('div', { className: 'dpp-row' },
      h('span', { className: 'lab' }, t('pgOpacity')),
      h(Segment, { items: opacityItems, value: opacity, onPick: onOpacity })),
    h('div', { className: 'dpp-row' },
      h('span', { className: 'lab' }, t('pgSize')),
      h(Segment, { items: sizeItems, value: size, onPick: onSize })));
}

function runtimeTone(phase) {
  if (phase === 'ready') return 'ok';
  if (phase === 'failed') return 'bad';
  if (phase === 'missing' || phase === 'outdated') return 'warn';
  return '';
}

function runtimeLabel(t, runtime) {
  if (!runtime) return t('pgRuntimeChecking');
  if (runtime.phase === 'ready') return t('pgRuntimeReady');
  if (runtime.phase === 'downloading' || runtime.phase === 'extracting') return t('pgRuntimeInstalling');
  if (runtime.phase === 'failed') return t('pgRuntimeFailed');
  return t('pgRuntimeMissing');
}

function shortBin(value) {
  if (!value) return '';
  const cut = value.indexOf('/Electron.app/');
  const dir = cut >= 0 ? value.slice(0, cut) : value;
  return dir.replace(/^\/(Users|home)\/[^/]+/, '~');
}

export function RuntimeInfoCard(props) {
  const { t, runtime, installing, onInstall } = props;
  const phase = runtime && runtime.phase;
  const tone = runtimeTone(phase);
  const source = runtime && runtime.source;
  const detail = phase === 'ready' && source
    ? `（${t(source === 'detected' || source === 'env' ? 'pgRuntimeLocal' : 'pgRuntimeDownloaded')}）`
    : '';
  const version = runtime && runtime.version ? `Electron ${runtime.version}` : '';
  const location = shortBin(runtime && (runtime.dir || runtime.bin));
  // 只有环境没就绪时才给下载入口。
  const needsInstall = phase === 'missing' || phase === 'outdated' || phase === 'failed';
  return h('section', { className: 'dpp-card' },
    h('div', { className: 'dpp-card-head' }, h('h3', null, t('pgRuntime'))),
    h('p', { className: 'dpp-desc' }, t('pgRuntimeHint')),
    h('div', { className: 'dpp-row' },
      h('span', { className: 'lab' }, t('pgStatus')),
      h('span', { className: 'val' },
        h('span', { className: `dpp-state${tone ? ` ${tone}` : ''}` },
          h('i', { className: 'd' }),
          runtimeLabel(t, runtime)),
        detail ? h('span', { className: 'sub' }, detail) : null),
      h('span', { className: 'spacer' }),
      needsInstall
        ? h('button', {
          type: 'button',
          className: 'dpp-install',
          style: { borderRadius: R.control },
          disabled: installing,
          onClick: onInstall,
        }, installing ? t('pgInstalling') : t('pgDownload'))
        : null),
    h('div', { className: 'dpp-row' },
      h('span', { className: 'lab' }, t('pgVersion')),
      version
        ? h('code', { style: { borderRadius: R.code } }, version)
        : h('span', { className: 'dpp-row-empty' }, '/')),
    h('div', { className: 'dpp-row' },
      h('span', { className: 'lab' }, t('pgLocation')),
      location
        ? h('code', { style: { borderRadius: R.code } }, location)
        : h('span', { className: 'dpp-row-empty' }, '/')));
}

function ResultRow(props) {
  const { t, pet, selected, installed, busySlug, onPreview, onInstall } = props;
  const busy = busySlug === pet.slug;
  const locked = Boolean(busySlug);
  const name = pet.displayName || pet.slug;
  return h('div', {
    className: `dpp-result${selected ? ' sel' : ''}${busy ? ' installing' : ''}`,
    role: 'button',
    tabIndex: 0,
    onClick: () => onPreview(pet.slug),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPreview(pet.slug);
      }
    },
  },
  h('div', { className: 'th' }, h(PetThumb, {
    url: installed
      ? spriteUrl(pet.slug)
      : (pet.spritesheetUrl ? thumbUrl(pet.spritesheetUrl) : ''),
    fallbackUrl: pet.spritesheetUrl ? thumbUrl(pet.spritesheetUrl) : '',
    size: 30,
  })),
  h('span', { className: 'nm' }, name),
  h('span', { className: 'sl' }, pet.slug),
  h('span', { className: 'spacer' }),
  installed
    ? h('span', { className: 'done' }, `✓ ${t('installedMark')}`)
    : h('button', {
      type: 'button',
      className: 'act',
      style: { borderRadius: R.item },
      disabled: locked,
      onClick: (event) => {
        event.stopPropagation();
        onInstall(pet);
      },
    }, busy ? t('installing') : t('install')));
}

function PreviewBlock(props) {
  const { t, previewSlug, previewName, previewUrl, anim, onAnim } = props;
  const picked = Boolean(previewSlug);
  // 切换宠物时（slug 变了但状态还是上一只的）立刻回到 loading，避免闪现旧图。
  const [load, setLoad] = React.useState({ slug: '', phase: 'ready' });
  const phase = picked && load.slug === previewSlug ? load.phase : 'loading';
  const failed = picked && phase === 'error';
  return h('div', { className: 'dpp-preview' },
    h('div', { className: 'dpp-preview-pic' },
      picked && !failed
        ? h(PetPreview, {
          slug: previewSlug,
          url: previewUrl || undefined,
          anim,
          px: 92,
          onReady: () => setLoad({ slug: previewSlug, phase: 'ready' }),
          onError: () => setLoad({ slug: previewSlug, phase: 'error' }),
        })
        : h('span', { className: 'dpp-preview-empty' }, CAT_SVG),
      picked && phase === 'loading' ? h('span', { className: 'dpp-preview-spin' }) : null),
    h('div', { className: 'dpp-preview-cap' },
      picked ? `${t('pgPreview')} · ${previewName}` : t('pgPickPreview')),
    picked ? h('div', { className: 'dpp-acts' }, ACTIONS.map((action) => h('button', {
      key: action.anim,
      type: 'button',
      className: `a${anim === action.anim ? ' on' : ''}`,
      style: { borderRadius: R.pill },
      onClick: () => onAnim(action.anim),
    }, t(`pgAct_${action.key}`)))) : null);
}

function DrawerBody(props) {
  const {
    t, query, onQuery, manifest, results, error, busySlug, installedSlugs,
    previewSlug, previewName, previewUrl, anim, onAnim, onPreview, onInstall, siteUrl,
  } = props;
  const total = manifest ? manifest.length : 0;
  const empty = Boolean(manifest) && !error && Boolean(query.trim()) && results.length === 0;
  return h(React.Fragment, null,
    h('div', { className: 'dpp-drawer-head' },
      h('h2', null, t('addPet')),
      h('span', { className: 'spacer' }),
      h('button', { type: 'button', className: 'dpp-close', style: { borderRadius: R.item }, 'aria-label': t('pgClose'), onClick: props.onClose }, '✕')),
    h('div', { className: 'dpp-search', style: { borderRadius: R.control, height: H.input } },
      SEARCH_ICON,
      h('input', {
        value: query,
        onChange: (event) => onQuery(event.target.value),
        placeholder: t('searchPlaceholder'),
        'aria-label': t('searchPlaceholder'),
        spellCheck: false,
      })),
    h('p', { className: 'dpp-drawer-hint' }, `${total ? total.toLocaleString() : '—'} ${t('petsAvailable')} · ${t('pgInstallHint')}`),
    error
      ? h('div', { className: 'dpp-drawer-empty' },
        h('div', { className: 't' }, t('loadFailed')),
        h('p', { className: 'b' }, t('pgEmptyHint')))
      : null,
    !manifest && !error ? h('p', { className: 'dpp-drawer-hint' }, t('loading')) : null,
    empty
      ? h('div', { className: 'dpp-drawer-empty' },
        h('div', { className: 't' }, t('noResults')),
        h('p', { className: 'b' }, t('pgEmptyHint')),
        h('a', { className: 'dpp-link', href: siteUrl, target: '_blank', rel: 'noreferrer' }, t('pgOpenSite')))
      : null,
    results.length > 0
      ? h('div', { className: 'dpp-results' }, results.map((pet) => h(ResultRow, {
        key: pet.slug,
        t,
        pet,
        selected: pet.slug === previewSlug,
        installed: installedSlugs.has(pet.slug),
        busySlug,
        onPreview,
        onInstall,
      })))
      : null,
    empty ? null : h(PreviewBlock, { t, previewSlug, previewName, previewUrl, anim, onAnim }),
    empty ? null : h('div', { className: 'dpp-drawer-foot' },
      h('a', { className: 'dpp-link', href: siteUrl, target: '_blank', rel: 'noreferrer' }, t('pgOpenSite'))));
}

export function AddPetDrawer(props) {
  const { open, onClose } = props;
  const ref = useRef(null);
  useModalA11y(open, ref, onClose);
  const cls = open ? ' open' : '';
  return h(React.Fragment, null,
    h('div', {
      className: `dpp-scrim${cls}`,
      onClick: onClose,
      'aria-hidden': 'true',
    }),
    h('aside', {
      className: `dpp-drawer${cls}`,
      ref,
      role: 'dialog',
      'aria-modal': open ? 'true' : 'false',
      'aria-hidden': open ? 'false' : 'true',
      inert: !open,
      'aria-label': props.t('addPet'),
    },
    h(DrawerBody, { ...props, onClose })));
}
