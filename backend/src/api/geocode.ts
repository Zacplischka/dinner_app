// Resolves a Host-entered suburb/postcode (or raw coordinates) to a usable
// location for Session creation, so browser geolocation is never required.

import { Router } from 'express';
import type { GeocodedArea } from '@dinder/shared/types';
import { asyncHandler } from './asyncHandler.js';
import {
  pruneExpiredRequests,
  queryNumber,
  requestIp,
  retryAfterSeconds,
  type RequestWindow,
} from './rateWindow.js';

interface GeocodeRouterDeps {
  geocodeArea: (query: string) => Promise<GeocodedArea | undefined>;
  reverseGeocodeSuburb: (latitude: number, longitude: number) => Promise<string | undefined>;
}

// Geocoding calls are Google-billed; cap per-visitor spend like /comparison does.
const GEOCODE_LIMIT = 20;
const GEOCODE_WINDOW_MS = 60_000;

export function createGeocodeRouter({ geocodeArea, reverseGeocodeSuburb }: GeocodeRouterDeps) {
  const router = Router();
  // ponytail: per-instance in-memory rate window, same ceiling as rateWindow.ts notes.
  const geocodeRequests = new Map<string, RequestWindow>();

  /**
   * GET /api/geocode?query=<suburb or postcode>
   * GET /api/geocode?latitude=<lat>&longitude=<lng>
   * Returns { latitude, longitude, area? } or 404 AREA_NOT_FOUND.
   */
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
      const latitude = queryNumber(req.query.latitude);
      const longitude = queryNumber(req.query.longitude);
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

      if (!hasCoords && (query.length < 2 || query.length > 100)) {
        return res.status(400).json({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Enter a suburb or postcode to search for.',
        });
      }
      if (hasCoords && (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
        return res.status(400).json({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Coordinates are out of range.',
        });
      }

      const now = Date.now();
      const ip = requestIp(req);
      pruneExpiredRequests(geocodeRequests, now);
      const window = geocodeRequests.get(ip);
      if (!window) {
        geocodeRequests.set(ip, { count: 1, resetAt: now + GEOCODE_WINDOW_MS });
      } else if (window.count >= GEOCODE_LIMIT) {
        res.setHeader('Retry-After', retryAfterSeconds(geocodeRequests, ip, GEOCODE_WINDOW_MS));
        return res.status(429).json({
          error: 'Too Many Requests',
          code: 'RATE_LIMITED',
          message: 'Too many location lookups. Please try again shortly.',
        });
      } else {
        window.count++;
      }

      if (hasCoords) {
        // Best-effort area name for coordinates the browser already resolved.
        const area = await reverseGeocodeSuburb(latitude, longitude).catch(() => undefined);
        req.log.info({ hasArea: Boolean(area) }, 'Reverse geocoded coordinates');
        return res.json({ latitude, longitude, area });
      }

      const resolved = await geocodeArea(query);
      if (!resolved) {
        req.log.warn({ reason: 'area_not_found' }, 'Rejected geocode lookup');
        return res.status(404).json({
          error: 'Not Found',
          code: 'AREA_NOT_FOUND',
          message:
            "We couldn't find that area. Check the spelling or try a nearby suburb or postcode.",
        });
      }

      req.log.info({ hasArea: Boolean(resolved.area) }, 'Geocoded area query');
      return res.json(resolved);
    })
  );

  return router;
}
