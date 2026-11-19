import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * The host serves `dist/pet-core.js` at runtime, so the artifact itself is part
 * of the contract. Evaluate it in a bare context and exercise the public API.
 */
describe('dist/pet-core.js', () => {
  const code = readFileSync('dist/pet-core.js', 'utf8');
  const context: Record<string, unknown> = {};
  vm.createContext(context);
  vm.runInContext(code, context);
  const PetCore = context.PetCore as {
    createAtlas(width: number, height: number): { rows: number; cellWidth: number };
    PetPlayer: new (atlas: unknown) => { rect(): { sy: number } };
    deriveViewModel(source: unknown): { mode: string };
  };

  it('exposes the shared API as a global', () => {
    expect(PetCore).toBeTypeOf('object');
    expect(typeof PetCore.createAtlas).toBe('function');
    expect(typeof PetCore.PetPlayer).toBe('function');
    expect(typeof PetCore.deriveViewModel).toBe('function');
  });

  it('produces the same geometry as the source', () => {
    const atlas = PetCore.createAtlas(1536, 1872);
    expect(atlas.rows).toBe(9);
    expect(atlas.cellWidth).toBe(192);
    const player = new PetCore.PetPlayer(atlas);
    expect(player.rect().sy).toBe(0);
  });
});
