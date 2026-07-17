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

export function requestIp(req: Request): string {
  const railwayClientIp = req.get('x-real-ip')?.trim();
  if (railwayClientIp && isIP(railwayClientIp)) return railwayClientIp;
  return req.ip || req.socket.remoteAddress || 'unknown';
}
