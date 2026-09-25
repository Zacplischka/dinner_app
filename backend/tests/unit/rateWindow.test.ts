import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  admitRequest,
  pruneExpiredRequests,
  rateLimit,
  requestIp,
  retryAfterSeconds,
  type RequestWindow,
} from '../../src/api/rateWindow.js';
import { DomainError } from '../../src/services/DomainError.js';

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

  describe('rateLimit', () => {
    const req = (ip: string, userId?: string) =>
      ({
        get: () => undefined,
        ip,
        socket: {},
        user: userId && { id: userId },
      }) as unknown as Request;
    const res = () => {
      const headers: Record<string, unknown> = {};
      const response = {
        headers,
        setHeader: (name: string, value: unknown) => (headers[name] = value),
      };
      return response as unknown as Response & { headers: Record<string, unknown> };
    };

    it('passes requests through until the window is full, then sets Retry-After and throws', () => {
      const limit = rateLimit({ limit: 2, windowMs: WINDOW_MS, message: 'Slow down.' });
      const next = vi.fn();

      limit(req('1.1.1.1'), res(), next);
      vi.advanceTimersByTime(20_000);
      limit(req('1.1.1.1'), res(), next);
      expect(next).toHaveBeenCalledTimes(2);

      const limited = res();
      let thrown: unknown;
      try {
        limit(req('1.1.1.1'), limited, next);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(DomainError);
      expect(thrown).toMatchObject({ code: 'TOO_MANY_REQUESTS', message: 'Slow down.' });
      expect(limited.headers['Retry-After']).toBe(40);
      expect(next).toHaveBeenCalledTimes(2);

      // Called mid-handler without next, another IP still has its own window.
      expect(() => limit(req('2.2.2.2'), res())).not.toThrow();
    });

    it('counts by key when given, so one user shares a window across IPs', () => {
      const limit = rateLimit({
        limit: 1,
        windowMs: WINDOW_MS,
        message: 'Wait a minute.',
        key: (r) => (r as Request & { user: { id: string } }).user.id,
      });

      limit(req('1.1.1.1', 'user-a'), res());
      expect(() => limit(req('2.2.2.2', 'user-a'), res())).toThrow('Wait a minute.');
      expect(() => limit(req('1.1.1.1', 'user-b'), res())).not.toThrow();
    });
  });
});
