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
      'table salt',
      'kosher salt',
      'salt and pepper',
      'pepper',
      'black pepper',
      'freshly ground black pepper',
      'white pepper',
      'peppercorns',
      'olive oil',
      'extra virgin olive oil',
      'Extra-virgin olive oil',
      'vegetable oil',
      'canola oil',
      'sunflower oil',
      'cooking oil',
      'cooking spray',
      'water',
      'cold water',
      'hot water',
      'warm water',
      'boiling water',
      'sugar',
      'white sugar',
      'caster sugar',
      'brown sugar',
      'plain flour',
      'all purpose flour',
      'all-purpose flour',
      'self raising flour',
      'self-raising flour',
      'baking powder',
      'baking soda',
      'bicarbonate of soda',
      'white vinegar',
      'soy sauce',
      'honey',
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
      'coconut water',
      'sugar snap peas',
      'water chestnuts',
      'honey mustard',
      'soy sauce noodles',
      'flour tortillas',
      'almond flour',
      'balsamic vinegar',
      'peanut butter',
      'oil-packed anchovies',
    ]) {
      expect(isStaple(name), name).toBe(false);
    }
  });

  it('never mutes an ingredient that merely ends in a Staple (#504)', () => {
    // The shipped Tuna Pasta Bake listed its protein as "tuna in olive oil",
    // and a tail match left the dish's tuna off its own Shopping List.
    for (const name of [
      'tuna in olive oil',
      'tuna in water',
      'jalapeno pepper',
      'chipotle pepper',
      'cayenne pepper',
      'lemon pepper',
      'palm sugar',
      'icing sugar',
      'celery salt',
      'garlic salt',
      'rose water',
      'manuka honey',
      'gluten free soy sauce',
    ]) {
      expect(isStaple(name), name).toBe(false);
    }
  });
});
