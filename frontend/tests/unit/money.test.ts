// Issue #179 — parseDollarsToCents: dollars text -> integer cents, or null
// when the value must not be emitted (rejected before the wire).

import { describe, it, expect } from 'vitest';
import { parseDollarsToCents } from '../../src/utils/money';

describe('parseDollarsToCents', () => {
  it.each([
    ['8.99', 899],
    ['0', 0],
    ['.5', 50],
    ['1,234.56', 123456],
    ['', 0], // clearing the field zeroes the fee, not covered by the spec's table
  ])('%s -> %i', (raw, cents) => {
    expect(parseDollarsToCents(raw)).toBe(cents);
  });

  it.each(['abc', '-5', '99999999'])('rejects %s with null', (raw) => {
    expect(parseDollarsToCents(raw)).toBeNull();
  });
});
