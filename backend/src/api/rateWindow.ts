import { isIP } from 'node:net';
import type { Request } from 'express';

// Fixed-window per-IP request counting shared by the comparison and redirect
// routers. ponytail: per-instance in-memory state; multi-instance needs a
// shared store (same ceiling as the ComparisonService in-flight dedupe).
export type RequestWindow = { count: number; resetAt: number };

function pruneExpiredRequests(requests: Map<string, RequestWindow>, now: number): void {
  // ponytail: O(active IPs) per request; use an expiring cache if traffic makes this costly.
  for (const [ip, request] of requests) {
    if (request.resetAt <= now) requests.delete(ip);
  }
}

/**
 * Count this IP's request against a fixed window. Returns false once the window
 * is full — the caller owns the status, message, and Retry-After it answers with.
 */
export function admitRequest(
  requests: Map<string, RequestWindow>,
  ip: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  pruneExpiredRequests(requests, now);
  const window = requests.get(ip);
  if (!window) {
    requests.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (window.count >= limit) return false;
  window.count++;
  return true;
}

export function retryAfterSeconds(
  requests: Map<string, RequestWindow>,
  ip: string,
  windowMs: number
): number {
  const request = requests.get(ip);
  if (!request) return Math.ceil(windowMs / 1000);
  return Math.max(1, Math.ceil((request.resetAt - Date.now()) / 1000));
}

export function requestIp(req: Request): string {
  const railwayClientIp = req.get('x-real-ip')?.trim();
  if (railwayClientIp && isIP(railwayClientIp)) return railwayClientIp;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function queryNumber(value: unknown): number {
  return typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
}
