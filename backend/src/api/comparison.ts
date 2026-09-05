import { Router } from 'express';
import type { Redis } from 'ioredis';
import {
  parseComparisonEntryRequest,
  parseVenueSearchRequest,
  type ApiError,
  type Venue,
  type VenueSearchResponse,
} from '@dinder/shared/types';
import type { GooglePlacesSearchParams } from '../services/RestaurantSearchService.js';
import type { ComparisonService } from '../services/ComparisonService.js';
import { DomainError } from '../services/DomainError.js';
import { asyncHandler } from './asyncHandler.js';
import { admitRequest, requestIp, retryAfterSeconds, type RequestWindow } from './rateWindow.js';

interface ComparisonRouterDeps {
  searchNearbyVenues: (params: GooglePlacesSearchParams) => Promise<Venue[]>;
  reverseGeocodeSuburb?: (latitude: number, longitude: number) => Promise<string | undefined>;
  fetchPlacePhoto?: (photoName: string) => Promise<string>;
  photoCache?: Pick<Redis, 'get' | 'set'>;
  comparisonService?: ComparisonService;
}

const PHOTO_CACHE_SECONDS = 24 * 60 * 60;
// Cold Comparisons launch paid Apify actor runs; this caps per-visitor spend (#70).
const COLD_COMPARE_LIMIT = 5;
const COLD_COMPARE_WINDOW_MS = 60 * 60_000;
// Photo and venue lookups are Google-billed on a cache miss.
const PHOTO_LIMIT = 60;
const PHOTO_WINDOW_MS = 60_000;
const VENUE_LIMIT = 30;
const VENUE_WINDOW_MS = 60_000;

export function createComparisonRouter({
  searchNearbyVenues,
  reverseGeocodeSuburb,
  fetchPlacePhoto,
  photoCache,
  comparisonService,
}: ComparisonRouterDeps) {
  const router = Router();
  // ponytail: per-instance in-memory rate windows (matches the in-flight dedupe
  // ceiling); a second backend instance would need a shared store.
  const venueRequests = new Map<string, RequestWindow>();
  const photoRequests = new Map<string, RequestWindow>();
  const coldCompareRequests = new Map<string, RequestWindow>();

  if (fetchPlacePhoto) {
    router.get(
      '/photo',
      asyncHandler(async (req, res) => {
        const photoName = typeof req.query.name === 'string' ? req.query.name : '';
        if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) {
          throw new DomainError('VALIDATION_ERROR', 'A valid Google Places photo name is required');
        }

        const cacheKey = `comparison:photo:${photoName}`;
        // Cache errors fail open to the Google lookup — Redis must never break photos.
        const cachedPhotoUrl = await photoCache?.get(cacheKey).catch(() => null);
        if (cachedPhotoUrl) {
          res.setHeader('Cache-Control', `private, max-age=${PHOTO_CACHE_SECONDS}`);
          return res.redirect(302, cachedPhotoUrl);
        }

        const ip = requestIp(req);
        if (!admitRequest(photoRequests, ip, PHOTO_LIMIT, PHOTO_WINDOW_MS)) {
          res.setHeader('Retry-After', retryAfterSeconds(photoRequests, ip, PHOTO_WINDOW_MS));
          return res.status(429).json({
            code: 'RATE_LIMITED',
            message: 'Too many photo requests. Please try again shortly.',
          } satisfies ApiError);
        }

        const photoUrl = await fetchPlacePhoto(photoName);
        // Google Places ToS permits caching the resolved URL, not the photo bytes.
        await photoCache?.set(cacheKey, photoUrl, 'EX', PHOTO_CACHE_SECONDS).catch(() => undefined);
        res.setHeader('Cache-Control', `private, max-age=${PHOTO_CACHE_SECONDS}`);
        return res.redirect(302, photoUrl);
      })
    );
  }

  if (comparisonService) {
    router.get('/:placeId/stream', (req, res) => {
      const input = parseComparisonEntryRequest({
        placeId: req.params.placeId,
        source: req.query.source,
      });
      if (!input) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'A valid placeId and optional Comparison source are required'
        );
      }

      const ip = requestIp(req);
      req.log?.info({ placeId: input.placeId, source: input.source }, 'Comparison subscribe');
      // Headers flush lazily on the first event, so a rate-limited cold
      // Comparison can still answer with a real 429 instead of an SSE error.
      let streaming = false;

      let unsubscribe: () => void = () => undefined;
      res.on('close', () => unsubscribe());
      unsubscribe = comparisonService.subscribe(
        input.placeId,
        (event) => {
          if (res.writableEnded) return;
          if (!streaming) {
            if (event.type === 'error' && event.code === 'RATE_LIMITED') {
              const retryAfter = retryAfterSeconds(coldCompareRequests, ip, COLD_COMPARE_WINDOW_MS);
              res.setHeader('Retry-After', retryAfter);
              res.status(429).json({
                code: 'RATE_LIMITED',
                message: `Limit of ${COLD_COMPARE_LIMIT} new comparisons per hour reached. Try again in about ${Math.ceil(retryAfter / 60)} minute(s).`,
              } satisfies ApiError);
              return;
            }
            res.status(200).set({
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
            res.flushHeaders();
            streaming = true;
          }
          const { type, ...data } = event;
          res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
          if (type === 'comparison' || type === 'error') res.end();
        },
        {
          beginColdCompare: () =>
            admitRequest(coldCompareRequests, ip, COLD_COMPARE_LIMIT, COLD_COMPARE_WINDOW_MS),
        }
      );
      return undefined;
    });
  }

  router.get(
    '/venues',
    asyncHandler(async (req, res) => {
      const input = parseVenueSearchRequest(req.query);
      if (!input) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Valid latitude, longitude, and radiusMiles (1–15) are required'
        );
      }

      const ip = requestIp(req);
      if (!admitRequest(venueRequests, ip, VENUE_LIMIT, VENUE_WINDOW_MS)) {
        res.setHeader('Retry-After', retryAfterSeconds(venueRequests, ip, VENUE_WINDOW_MS));
        return res.status(429).json({
          code: 'RATE_LIMITED',
          message: 'Too many venue searches. Please try again shortly.',
        } satisfies ApiError);
      }

      const [venues, suburb] = await Promise.all([
        searchNearbyVenues({
          latitude: input.latitude,
          longitude: input.longitude,
          radiusMeters: input.radiusMiles * 1609.344,
        }),
        reverseGeocodeSuburb?.(input.latitude, input.longitude).catch(() => undefined),
      ]);
      const body: VenueSearchResponse = suburb === undefined ? { venues } : { venues, suburb };
      return res.json(body);
    })
  );

  return router;
}
