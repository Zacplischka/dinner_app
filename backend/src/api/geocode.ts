// Resolves a Host-entered suburb/postcode (or raw coordinates) to a usable
// location for Session creation, so browser geolocation is never required.

import { Router } from 'express';
import { queryNumber, type GeocodedArea } from '@dinder/shared/types';
import { DomainError } from '../services/DomainError.js';
import { asyncHandler } from './asyncHandler.js';
import { rateLimit } from './rateWindow.js';

interface GeocodeRouterDeps {
  geocodeArea: (query: string) => Promise<GeocodedArea | undefined>;
  reverseGeocodeSuburb: (latitude: number, longitude: number) => Promise<string | undefined>;
}

export function createGeocodeRouter({ geocodeArea, reverseGeocodeSuburb }: GeocodeRouterDeps) {
  const router = Router();
  // Geocoding calls are Google-billed; cap per-visitor spend like /comparison does.
  // ponytail: per-instance in-memory rate window, same ceiling as rateWindow.ts notes.
  const geocodeLimit = rateLimit({
    limit: 20,
    windowMs: 60_000,
    message: 'Too many location lookups. Please try again shortly.',
  });

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
      const latitude = queryNumber(req.query.latitude);
      const longitude = queryNumber(req.query.longitude);
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

      if (!hasCoords && (query.length < 2 || query.length > 100)) {
        throw new DomainError('VALIDATION_ERROR', 'Enter a suburb or postcode to search for.');
      }
      if (hasCoords && (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
        throw new DomainError('VALIDATION_ERROR', 'Coordinates are out of range.');
      }

      geocodeLimit(req, res);
      if (hasCoords) {
        // Best-effort area name for coordinates the browser already resolved.
        const area = await reverseGeocodeSuburb(latitude, longitude).catch(() => undefined);
        req.log.info({ hasArea: Boolean(area) }, 'Reverse geocoded coordinates');
        return res.json({ latitude, longitude, area } satisfies GeocodedArea);
      }

      const resolved = await geocodeArea(query);
      if (!resolved) {
        req.log.warn({ reason: 'area_not_found' }, 'Rejected geocode lookup');
        throw new DomainError(
          'AREA_NOT_FOUND',
          "We couldn't find that area. Check the spelling or try a nearby suburb or postcode."
        );
      }

      req.log.info({ hasArea: Boolean(resolved.area) }, 'Geocoded area query');
      return res.json(resolved);
    })
  );

  return router;
}
