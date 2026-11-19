import { describe, expect, it } from 'vitest';
import { PET_PACK_SCHEMA, parsePetPack } from '../../src/core/pet-pack.js';

const base = { schemaVersion: PET_PACK_SCHEMA, id: 'my-pet', version: '1.0.0', displayName: 'My Pet', atlas: 'atlas.png', animations: { idle: 'idle.png' } };

describe('pet-pack@1', () => {
  it('accepts a data-only manifest', () => {
    expect(parsePetPack(base)).toMatchObject({ id: 'my-pet', animations: { idle: 'idle.png' } });
  });
  it('rejects executable fields and bad schema', () => {
    expect(() => parsePetPack({ ...base, main: 'x.js' })).toThrow(/may not contain main/);
    expect(() => parsePetPack({ ...base, schemaVersion: 'pet-pack@2' })).toThrow(/unsupported/);
    expect(() => parsePetPack({ ...base, id: 'Bad ID' })).toThrow(/id/);
  });
});
