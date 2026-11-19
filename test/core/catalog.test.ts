import { describe, expect, it } from 'vitest';
import { filterPets } from '../../src/core/view-model.js';

describe('filterPets', () => {
  const pets = [
    { slug: 'alpha', displayName: 'Alpha' },
    { slug: 'beta', displayName: 'Beta' },
    { slug: 'gamma', displayName: 'Alpha Two' },
  ];
  it('matches slug or display name case-insensitively and caps results', () => {
    expect(filterPets(pets, 'ALP').map((p) => p.slug)).toEqual(['alpha', 'gamma']);
    expect(filterPets(pets, 'be').map((p) => p.slug)).toEqual(['beta']);
    expect(filterPets(pets, '')).toEqual([]);
    expect(filterPets(pets, 'a', 1)).toHaveLength(1);
  });
});
