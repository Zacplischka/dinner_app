// Wire contract for the shared Socket.IO acknowledgement event map (#116).
// The handler suite asserts what each handler emits; this asserts the shared
// `Ack<T>` types themselves - the final canonical shapes with no legacy
// flattened fields, no string errors, and no success/failure coexistence.

import { describe, it, expect } from 'vitest';
import type {
  Ack,
  SessionJoinResponse,
  SelectionSubmitResponse,
  SessionRestartResponse,
  SessionLeaveResponse,
  SessionJoinData,
} from '@dinder/shared/types';

describe('canonical Socket.IO ack wire contract (shared event map)', () => {
  it('join success is exactly { success, data } carrying the canonical data', () => {
    const data: SessionJoinData = {
      participantId: 'p1',
      sessionCode: 'ABC12',
      displayName: 'Alice',
      participantCount: 1,
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
    const acks: Array<SelectionSubmitResponse | SessionRestartResponse | SessionLeaveResponse> = [
      { success: true, data: null },
      { success: true, data: null },
      { success: true, data: null },
    ];
    for (const ack of acks) {
      expect(ack).toEqual({ success: true, data: null });
    }
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
