import { isIP } from 'node:net';
import type { Request } from 'express';

// Fixed-window per-IP request counting shared by the comparison and redirect
// routers. ponytail: per-instance in-memory state; multi-instance needs a
// shared store (same ceiling as the ComparisonService in-flight dedupe).
export type RequestWindow = { count: number; resetAt: number };

export function pruneExpiredRequests(requests: Map<string, RequestWindow>, now: number): void {
  // ponytail: O(active IPs) per request; use an expiring cache if traffic makes this costly.
  for (const [ip, request] of requests) {
    if (request.resetAt <= now) requests.delete(ip);
  }
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
