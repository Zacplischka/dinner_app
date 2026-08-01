import { describe, expect, it } from 'vitest';
import { deriveSearchTerm, translateTerm, US_TO_AU_TERMS } from '../../src/services/usToAuTerms.js';

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
