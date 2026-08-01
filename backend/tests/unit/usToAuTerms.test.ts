import { describe, expect, it } from 'vitest';
import { translateTerm, US_TO_AU_TERMS } from '../../src/services/usToAuTerms.js';

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
