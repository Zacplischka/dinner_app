import { describe, expect, it } from 'vitest';
import {
  deriveSearchTerm,
  sanitiseIngredientName,
  translateTerm,
  US_TO_AU_TERMS,
} from '../../src/services/usToAuTerms.js';

describe('translateTerm', () => {
  it('translates the #231-measured dialect terms before search', () => {
    expect(translateTerm('cilantro')).toBe('coriander');
    expect(translateTerm('ground beef')).toBe('beef mince');
    expect(translateTerm('bell pepper')).toBe('capsicum');
    expect(translateTerm('scallions')).toBe('spring onions');
    expect(translateTerm('heavy cream')).toBe('thickened cream');
    expect(translateTerm('all purpose flour')).toBe('plain flour');
    expect(translateTerm('cornstarch')).toBe('cornflour');
    expect(translateTerm('shrimp')).toBe('prawns');
    expect(translateTerm('arugula')).toBe('rocket');
    expect(translateTerm('napa cabbage')).toBe('wombok');
  });

  it('passes untranslated terms through unchanged', () => {
    expect(translateTerm('carrot')).toBe('carrot');
    expect(translateTerm('eggplant')).toBe('eggplant');
    expect(translateTerm('zucchini')).toBe('zucchini');
  });

  it('is insensitive to case, punctuation, and stray whitespace', () => {
    expect(translateTerm('  Heavy  Cream ')).toBe('thickened cream');
    expect(translateTerm('ALL-PURPOSE FLOUR')).toBe('plain flour');
    expect(translateTerm('Self-Rising Flour')).toBe('self-raising flour');
  });

  it('keeps every table key in normalized form so lookups can hit them', () => {
    for (const key of Object.keys(US_TO_AU_TERMS)) {
      expect(key).toBe(
        key
          .toLowerCase()
          .replace(/[\s-]+/g, ' ')
          .trim()
      );
    }
  });
});

// The one search-term derivation (#285): the Matcher's search, an Unmatched
// line's search link at mint, and a demotion's fallback all go through this.
describe('deriveSearchTerm', () => {
  it('derives the term from the ingredient, not a slice of raw recipe text', () => {
    // The two live-list failures the issue names: q=of water, q=6 garlic.
    expect(deriveSearchTerm('of water')).toBe('water');
    expect(deriveSearchTerm('6 garlic')).toBe('garlic');
    expect(deriveSearchTerm('4.5 cups of water')).toBe('water');
    expect(deriveSearchTerm('400g spaghetti')).toBe('spaghetti');
  });

  it('drops only a leading "of" — never the one inside a name', () => {
    expect(deriveSearchTerm('cream of tartar')).toBe('cream of tartar');
  });

  it('still translates the cleaned term into the AU dialect', () => {
    expect(deriveSearchTerm('2 green onions')).toBe('spring onions');
    expect(deriveSearchTerm('cilantro')).toBe('coriander');
  });

  it('leaves a clean ingredient name alone', () => {
    expect(deriveSearchTerm('canned tomatoes')).toBe('canned tomatoes');
    expect(deriveSearchTerm('garlic cloves')).toBe('garlic cloves');
  });

  it('passes a name that was nothing but measurement through unchanged', () => {
    expect(deriveSearchTerm('6')).toBe('6');
  });
});

// The display-name cleaning (#286): narrower than the search derivation on
// purpose — a Shopper reads this text, so it keeps its casing and loses only
// the leading quantity phrase the source embedded, or refuses entirely.
describe('sanitiseIngredientName', () => {
  it('strips the embedded leading quantity phrase, keeping the name as written', () => {
    expect(sanitiseIngredientName('5 pieces chicken breasts')).toBe('chicken breasts');
    expect(sanitiseIngredientName('6 garlic')).toBe('garlic');
    expect(sanitiseIngredientName('2 cups Arborio rice')).toBe('Arborio rice');
    expect(sanitiseIngredientName('400g spaghetti')).toBe('spaghetti');
  });

  it('leaves a clean name untouched — a count word alone is product identity', () => {
    expect(sanitiseIngredientName('garlic cloves')).toBe('garlic cloves');
    expect(sanitiseIngredientName('jjapsahl')).toBe('jjapsahl');
    expect(sanitiseIngredientName('vegetable oil')).toBe('vegetable oil');
  });

  it('refuses what it cannot clean rather than guessing', () => {
    // "oz" eaten out of the middle of mozzarella leaves a stray fragment.
    expect(sanitiseIngredientName('m zarella cheese')).toBeNull();
    // A number it cannot place is not provably a quantity phrase.
    expect(sanitiseIngredientName('chinese 5 spice')).toBeNull();
    // A name that was nothing but quantity has no product identity at all.
    expect(sanitiseIngredientName('6')).toBeNull();
  });
});
