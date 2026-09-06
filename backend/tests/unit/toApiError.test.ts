import { describe, expect, it } from 'vitest';
import { toApiError } from '../../src/api/toApiError.js';
import { DomainError } from '../../src/services/DomainError.js';

describe('toApiError', () => {
  it('keeps upstream quota (RATE_LIMITED → 503) apart from client throttling (TOO_MANY_REQUESTS → 429)', () => {
    expect(toApiError(new DomainError('RATE_LIMITED', 'quota'))).toEqual({
      status: 503,
      body: { code: 'RATE_LIMITED', message: 'quota' },
    });
    expect(toApiError(new DomainError('TOO_MANY_REQUESTS', 'slow down'))).toEqual({
      status: 429,
      body: { code: 'RATE_LIMITED', message: 'slow down' },
    });
  });
});
