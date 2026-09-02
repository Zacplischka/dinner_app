// The relaxation ladder (#334): the steps a Craving that dealt nothing can be
// offered, in order. Reference data plus a pure walk — the pricing lives in
// RecipePoolService, so everything here is about what may be offered at all.
import { describe, expect, it } from 'vitest';
import { CUISINES, type Craving } from '@dinder/shared/types';
import { CUISINE_GROUPS, relaxationLadder } from '../../src/services/cuisineGroups.js';

const korean: Craving = { mealType: 'main course', cuisines: ['korean'], diets: ['vegan'] };

describe('CUISINE_GROUPS', () => {
  it('places every setup chip in exactly one group', () => {
    const grouped = CUISINE_GROUPS.flatMap((group) => group.cuisines);
    expect([...grouped].sort()).toEqual([...CUISINES].sort());
  });
});

describe('relaxationLadder', () => {
  it('widens the cuisine to its group first, then drops it', () => {
    expect(relaxationLadder(korean)).toEqual([
      {
        craving: {
          mealType: 'main course',
          cuisines: ['chinese', 'indian', 'japanese', 'korean', 'thai', 'vietnamese'],
          diets: ['vegan'],
        },
        label: 'Asian',
      },
      {
        craving: { mealType: 'main course', cuisines: [], diets: ['vegan'] },
        label: 'any cuisine',
      },
    ]);
  });

  it('never touches the diets or the meal type', () => {
    for (const step of relaxationLadder(korean)) {
      expect(step.craving.diets).toEqual(['vegan']);
      expect(step.craving.mealType).toBe('main course');
    }
  });

  it('widens to every group the chips reach into', () => {
    const [widened] = relaxationLadder({ ...korean, cuisines: ['korean', 'mexican'] });
    expect(widened.label).toBe('Asian or the Americas');
    expect(widened.craving.cuisines).toContain('japanese');
    expect(widened.craving.cuisines).toContain('american');
  });

  it('skips a widening that is the Craving that already dealt nothing', () => {
    const asian: Craving = {
      ...korean,
      cuisines: ['chinese', 'indian', 'japanese', 'korean', 'thai', 'vietnamese'],
    };
    expect(relaxationLadder(asian).map((step) => step.label)).toEqual(['any cuisine']);
  });

  it('offers nothing when no cuisine chip is set — there is nothing left to relax', () => {
    expect(relaxationLadder({ ...korean, cuisines: [] })).toEqual([]);
  });
});
