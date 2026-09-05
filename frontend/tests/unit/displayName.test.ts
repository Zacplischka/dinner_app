// Issue #346 — validateDisplayName: the one 1-50 rule behind every
// Host/Participant name field, returning the message or null.

import { describe, it, expect } from 'vitest';
import { validateDisplayName } from '../../src/utils/displayName';

describe('validateDisplayName', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace-only'],
    ['a'.repeat(51), '51 chars'],
    [` ${'a'.repeat(51)} `, '51 chars padded'],
  ])('rejects %j (%s)', (name) => {
    expect(validateDisplayName(name)).toBe('Name must be between 1 and 50 characters');
  });

  it.each([
    ['a', '1 char'],
    ['a'.repeat(50), '50 chars'],
    [` ${'a'.repeat(50)} `, '50 chars padded'],
  ])('accepts %j (%s)', (name) => {
    expect(validateDisplayName(name)).toBeNull();
  });
});
