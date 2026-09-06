import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import {
  admitRequest,
  pruneExpiredRequests,
  requestIp,
  retryAfterSeconds,
  type RequestWindow,
} from '../../src/api/rateWindow.js';

const WINDOW_MS = 60_000;
const LIMIT = 3;

describe('rateWindow', () => {
  let requests: Map<string, RequestWindow>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    requests = new Map();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('admits up to the limit within a window and refuses the next request', () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS)).toBe(true);
    }
    expect(admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS)).toBe(false);
    // Another IP has its own window.
    expect(admitRequest(requests, '2.2.2.2', LIMIT, WINDOW_MS)).toBe(true);
  });

  it('keeps refusing until the window boundary, then rolls into a fresh window', () => {
    for (let i = 0; i < LIMIT; i++) admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS);

    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS)).toBe(false);

    // At exactly resetAt the entry is pruned and this request opens a new window.
    vi.advanceTimersByTime(1);
    expect(admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS)).toBe(true);
    expect(requests.get('1.1.1.1')).toEqual({ count: 1, resetAt: Date.now() + WINDOW_MS });
  });

  it('reports seconds until the window resets, never below one', () => {
    expect(retryAfterSeconds(requests, '1.1.1.1', WINDOW_MS)).toBe(60);

    admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS);
    vi.advanceTimersByTime(30_500);
    expect(retryAfterSeconds(requests, '1.1.1.1', WINDOW_MS)).toBe(30);

    vi.advanceTimersByTime(WINDOW_MS - 30_500 - 200);
    expect(retryAfterSeconds(requests, '1.1.1.1', WINDOW_MS)).toBe(1);
  });

  it('prunes only the windows that have expired', () => {
    admitRequest(requests, '1.1.1.1', LIMIT, WINDOW_MS);
    vi.advanceTimersByTime(WINDOW_MS / 2);
    admitRequest(requests, '2.2.2.2', LIMIT, WINDOW_MS);
    vi.advanceTimersByTime(WINDOW_MS / 2);

    pruneExpiredRequests(requests, Date.now());

    expect([...requests.keys()]).toEqual(['2.2.2.2']);
  });

  it('trusts x-real-ip only when it is a valid IP', () => {
    const req = (header: string | undefined, ip = '10.0.0.1') =>
      ({ get: () => header, ip, socket: { remoteAddress: '10.0.0.2' } }) as unknown as Request;

    expect(requestIp(req(' 203.0.113.9 '))).toBe('203.0.113.9');
    expect(requestIp(req('not-an-ip'))).toBe('10.0.0.1');
    expect(requestIp(req(undefined, ''))).toBe('10.0.0.2');
  });
});
