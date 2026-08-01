// The Staples (#229): a small hardcoded set assumed already at home. The
// predicate has to be a whole-word phrase match, because the near misses are
// real ingredients a substring test would wrongly zero out of every count.
import { describe, expect, it } from 'vitest';
import { isStaple } from '../../src/services/staples.js';

describe('isStaple', () => {
  it('recognises the pantry set, however the recipe words it', () => {
    for (const name of [
      'salt',
      'Salt',
      'sea salt',
      'freshly ground black pepper',
      'extra virgin olive oil',
      'water',
      'plain flour',
      'caster sugar',
    ]) {
      expect(isStaple(name), name).toBe(true);
    }
  });

  it('leaves ingredients that merely start the same way alone', () => {
    for (const name of [
      'salted peanuts',
      'salmon fillet',
      'watercress',
      'peppercorn sauce',
      'red pepper',
      'red pepper',
      'bell pepper',
      'sugar snap peas',
      'water chestnuts',
      'almond flour',
      'balsamic vinegar',
      'peanut butter',
      'oil-packed anchovies',
    ]) {
      expect(isStaple(name), name).toBe(false);
    }
  });
});
