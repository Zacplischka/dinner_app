// The Staples (#229): a small hardcoded set assumed already at home. A name is
// a Staple only if it is an entry, because the near misses on either side
// ("salted peanuts", "tuna in olive oil") are real ingredients a looser test
// would wrongly zero out of every count (#504).
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
      'fine sea salt',
      'flaky sea salt',
      'salt and pepper',
      'Salt & pepper',
      'salt and black pepper',
      'salt and freshly ground black pepper',
      'kosher salt & freshly ground black pepper',
      'sea salt and pepper',
      'pepper',
      'ground pepper',
      'freshly ground pepper',
      'black pepper',
      'ground black pepper',
      'freshly ground black pepper',
      'cracked black pepper',
      'white pepper',
      'peppercorns',
      'black peppercorns',
      'olive oil',
      'extra virgin olive oil',
      'Extra-virgin olive oil',
      'vegetable oil',
      'canola oil',
      'sunflower oil',
      'cooking oil',
      'cooking spray',
      'nonstick cooking spray',
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

  it('leaves the near misses alone, whichever end they share with a Staple', () => {
    for (const name of [
      'salted peanuts',
      'salmon fillet',
      'watercress',
      'peppercorn sauce',
      'red pepper',
      'green pepper',
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
