// Wire contract for the shared Socket.IO acknowledgement event map (#116).
// The handler suite asserts what each handler emits; this asserts the shared
// `Ack<T>` types themselves - the final canonical shapes with no legacy
// flattened fields, no string errors, and no success/failure coexistence.

import { describe, it, expect } from 'vitest';
import { isApiError } from '@dinder/shared/types';
import type {
  Ack,
  SessionJoinResponse,
  SelectionSubmitResponse,
  SessionRestartResponse,
  SessionLeaveResponse,
  SelectionLiveResponse,
  SessionJoinData,
  OrderUnavailableError,
  OrderBuyResponse,
} from '@dinder/shared/types';

describe('canonical Socket.IO ack wire contract (shared event map)', () => {
  it('join success is exactly { success, data } carrying the canonical data', () => {
    const data: SessionJoinData = {
      participantId: 'p1',
      sessionCode: 'ABC12',
      displayName: 'Alice',
      participantCount: 1,
      rejoinToken: '00000000-0000-4000-8000-000000000001',
      participants: [{ participantId: 'p1', displayName: 'Alice', isHost: true }],
    };
    const ack: SessionJoinResponse = { success: true, data };
    // No flattened participantId/participantCount/participants at the top level.
    expect(Object.keys(ack).sort()).toEqual(['data', 'success']);
  });

  it('a failure ack is exactly { success:false, error: ApiError } - no string error, no apiError', () => {
    const ack: SessionJoinResponse = {
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'gone' },
    };
    expect(Object.keys(ack).sort()).toEqual(['error', 'success']);
    if (!ack.success) {
      expect(Object.keys(ack.error).sort()).toEqual(['code', 'message']);
    }
  });

  it('no-data commands acknowledge data: null', () => {
    const acks: Array<
      | SelectionSubmitResponse
      | SessionRestartResponse
      | SessionLeaveResponse
      | SelectionLiveResponse
      | OrderBuyResponse
    > = [
      { success: true, data: null },
      { success: true, data: null },
      { success: true, data: null },
      { success: true, data: null },
      { success: true, data: null },
    ];
    for (const ack of acks) {
      expect(ack).toEqual({ success: true, data: null });
      expect(Object.keys(ack).sort()).toEqual(['data', 'success']);
    }
  });

  it('OrderUnavailableError is still an ApiError, carrying one extra reason field', () => {
    const err: OrderUnavailableError = {
      code: 'NOT_FOUND',
      message: 'Prices for this Venue are stale. Please try again.',
      reason: 'stale',
    };
    // It extends ApiError structurally — isApiError must still accept it.
    expect(isApiError(err)).toBe(true);
    expect(err.reason).toBe('stale');
  });

  it('success and failure never coexist (discriminated union)', () => {
    const success: Ack<number> = { success: true, data: 1 };
    const failure: Ack<number> = {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    };
    // Each arm carries exactly one payload key beside `success`.
    expect('error' in success).toBe(false);
    expect('data' in failure).toBe(false);
  });
});
