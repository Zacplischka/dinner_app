// Pack strings from the #231/#245 corpus through the whitelist parser:
// known-good shapes produce numbers, everything else is null — never a guess.
import { describe, expect, it } from 'vitest';
import { cupCentsPerGram, parsePack } from '../../src/services/packParser.js';

describe('parsePack', () => {
  it.each([
    ['400g', 400, 'mass'],
    ['1.5kg', 1500, 'mass'],
    ['300mL', 300, 'volume'],
    ['1L', 1000, 'volume'],
    ['2 x 400g', 800, 'mass'],
    ['250mL x 4 pack', 1000, 'volume'],
  ] as const)('fixed pack %s → %d (%s)', (size, quantity, family) => {
    expect(parsePack(size)).toEqual({ kind: 'fixed', quantity, family });
  });

  it.each([
    ['each', 1],
    ['Each', 1],
    ['1 Each', 1],
    ['1ea', 1],
    ['bunch', 1],
    ['punnet', 1],
    ['loaf', 1],
    ['12 pack', 12],
    ['4pk', 4],
  ] as const)('count pack %s → %d units', (size, units) => {
    expect(parsePack(size)).toEqual({ kind: 'count', units });
  });

  it('names variable-weight packs instead of guessing a fixed size', () => {
    // "per 190g" parsed as a 190g pack once made 600g of chicken thigh a $62 line (#241).
    expect(parsePack('per 150g')).toEqual({ kind: 'variable' });
    expect(parsePack('approx. 170g')).toEqual({ kind: 'variable' });
  });

  it('names range packs — the three #245 corpus shapes plus the unitless-first spelling', () => {
    expect(parsePack('750g - 2.2kg')).toEqual({ kind: 'range' });
    expect(parsePack('1.5kg - 2.5kg')).toEqual({ kind: 'range' });
    expect(parsePack('1.8kg - 2.2kg')).toEqual({ kind: 'range' });
    expect(parsePack('1.5-2.5kg')).toEqual({ kind: 'range' });
  });

  it('rejects anything outside the whitelist', () => {
    expect(parsePack('Serves 4')).toBeNull();
    expect(parsePack('400g net when drained')).toBeNull();
    expect(parsePack('')).toBeNull();
    expect(parsePack(undefined)).toBeNull();
  });
});

describe('cupCentsPerGram', () => {
  it('reads Woolworths unit-price strings', () => {
    expect(cupCentsPerGram('$15.50 / 1KG')).toBeCloseTo(1.55);
    expect(cupCentsPerGram('$1.13 / 100G')).toBeCloseTo(1.13);
    expect(cupCentsPerGram('$2.00 / 1L')).toBeCloseTo(0.2);
  });

  it('returns null for unpriceable strings', () => {
    expect(cupCentsPerGram('$3.00 / 1EA')).toBeNull();
    expect(cupCentsPerGram(undefined)).toBeNull();
    expect(cupCentsPerGram('')).toBeNull();
  });
});
