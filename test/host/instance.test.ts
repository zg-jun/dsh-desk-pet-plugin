import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { instanceKey, profileFromPath, resolveDirs } from '../../src/host/instance.js';

describe('instanceKey', () => {
  it('prefers DSH_PROFILE and is stable across ports', () => {
    expect(instanceKey({ DSH_PROFILE: 'desktop' })).toBe('desktop');
    expect(instanceKey({ DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: '/x/profiles/web' })).toBe('desktop');
  });

  it('falls back to the profile directory name', () => {
    expect(instanceKey({ DSH_PROFILE_DIR: '/Users/x/.dsh/profiles/web' })).toBe('web');
  });

  it('derives the profile from the installed package path (GUI launch has no DSH_PROFILE)', () => {
    const pathUrl = 'file:///Users/x/.dsh/profiles/desktop/node_modules/dsh-desk-pet-plugin/index.js';
    expect(profileFromPath(pathUrl)).toBe('desktop');
    expect(instanceKey({}, pathUrl)).toBe('desktop');
    expect(instanceKey({ DSH_PROFILE: 'ignored' }, pathUrl)).toBe('desktop');
  });

  it('ignores non-profile paths', () => {
    expect(profileFromPath('file:///Users/x/dev/plugin/index.js')).toBe('');
    expect(instanceKey({}, 'file:///Users/x/dev/plugin/index.js')).toBe('default');
  });

  it('sanitises and defaults', () => {
    expect(instanceKey({})).toBe('default');
    expect(instanceKey({ DSH_PROFILE: 'a/b c' })).toBe('a-b-c');
    expect(instanceKey({ DSH_PROFILE: '...' })).toBe('default');
    expect(instanceKey({ DSH_PROFILE: 'x'.repeat(80) })).toHaveLength(64);
  });
});

describe('resolveDirs', () => {
  it('shares the runtime but isolates settings/pid/pos/userData', () => {
    const base = '/home/u/.petdex/dsh-float';
    const dirs = resolveDirs(base, 'desktop');
    expect(dirs.runtime).toBe(path.join(base, 'runtime'));
    expect(dirs.settings).toBe(path.join(base, 'instances/desktop/settings.json'));
    expect(dirs.pid).toBe(path.join(base, 'instances/desktop/child.pid'));
    expect(dirs.pos).toBe(path.join(base, 'instances/desktop/pos.json'));
    expect(dirs.userData).toBe(path.join(base, 'instances/desktop/userData'));
    expect(dirs.main).toBe(path.join(base, 'instances/desktop/main.js'));
  });
});
