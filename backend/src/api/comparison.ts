import { isIP } from 'node:net';
import { Router, type Request } from 'express';
import type { Redis } from 'ioredis';
import type { GooglePlacesSearchParams } from '../services/RestaurantSearchService.js';
import type { ComparisonService } from '../services/ComparisonService.js';
import { asyncHandler } from './asyncHandler.js';

interface ComparisonRouterDeps {
  searchNearbyVenues: (params: GooglePlacesSearchParams) => Promise<unknown[]>;
  reverseGeocodeSuburb?: (latitude: number, longitude: number) => Promise<string | undefined>;
  fetchPlacePhoto?: (photoName: string) => Promise<string>;
  photoCache?: Pick<Redis, 'get' | 'set'>;
  comparisonService?: ComparisonService;
}

type RequestWindow = { count: number; resetAt: number };
const PHOTO_CACHE_SECONDS = 24 * 60 * 60;
// Cold Comparisons launch paid Apify actor runs; this caps per-visitor spend (#70).
const COLD_COMPARE_LIMIT = 5;
const COLD_COMPARE_WINDOW_MS = 60 * 60_000;

function pruneExpiredRequests(requests: Map<string, RequestWindow>, now: number): void {
  // ponytail: O(active IPs) per request; use an expiring cache if traffic makes this costly.
  for (const [ip, request] of requests) {
    if (request.resetAt <= now) requests.delete(ip);
  }
}

function queryNumber(value: unknown): number {
  return typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
}

function requestIp(req: Request): string {
  const railwayClientIp = req.get('x-real-ip')?.trim();
  if (railwayClientIp && isIP(railwayClientIp)) return railwayClientIp;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createComparisonRouter({
  searchNearbyVenues,
  reverseGeocodeSuburb,
  fetchPlacePhoto,
  photoCache,
  comparisonService,
}: ComparisonRouterDeps) {
  const router = Router();
  const venueRequests = new Map<string, RequestWindow>();
  const photoRequests = new Map<string, RequestWindow>();
  const coldCompareRequests = new Map<string, RequestWindow>();

  if (fetchPlacePhoto) {
    router.get(
      '/photo',
      asyncHandler(async (req, res) => {
        const photoName = typeof req.query.name === 'string' ? req.query.name : '';
        if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) {
          return res.status(400).json({
            error: 'Bad Request',
            code: 'VALIDATION_ERROR',
            message: 'A valid Google Places photo name is required',
          });
        }

        const cacheKey = `comparison:photo:${photoName}`;
        // Cache errors fail open to the Google lookup — Redis must never break photos.
        const cachedPhotoUrl = await photoCache?.get(cacheKey).catch(() => null);
        if (cachedPhotoUrl) {
          res.setHeader('Cache-Control', `private, max-age=${PHOTO_CACHE_SECONDS}`);
          return res.redirect(302, cachedPhotoUrl);
        }

        const now = Date.now();
        const ip = requestIp(req);
        pruneExpiredRequests(photoRequests, now);
        const requestCount = photoRequests.get(ip);
        if (!requestCount) {
          photoRequests.set(ip, { count: 1, resetAt: now + 60_000 });
        } else if (requestCount.count >= 60) {
          res.setHeader('Retry-After', Math.ceil((requestCount.resetAt - now) / 1000));
          return res.status(429).json({
            error: 'Too Many Requests',
            code: 'RATE_LIMITED',
            message: 'Too many photo requests. Please try again shortly.',
          });
        } else {
          requestCount.count++;
        }

        const photoUrl = await fetchPlacePhoto(photoName);
        // Google Places ToS permits caching the resolved URL, not the photo bytes.
        await photoCache?.set(cacheKey, photoUrl, 'EX', PHOTO_CACHE_SECONDS).catch(() => undefined);
        res.setHeader('Cache-Control', `private, max-age=${PHOTO_CACHE_SECONDS}`);
        return res.redirect(302, photoUrl);
      })
    );
  }

  const beginColdCompare = (ip: string) => {
    const now = Date.now();
    pruneExpiredRequests(coldCompareRequests, now);
    const requestCount = coldCompareRequests.get(ip);
    if (!requestCount) {
      coldCompareRequests.set(ip, { count: 1, resetAt: now + COLD_COMPARE_WINDOW_MS });
      return true;
    }
    if (requestCount.count >= COLD_COMPARE_LIMIT) return false;
    requestCount.count++;
    return true;
  };

  const coldCompareRetryAfterSeconds = (ip: string) => {
    const requestCount = coldCompareRequests.get(ip);
    if (!requestCount) return Math.ceil(COLD_COMPARE_WINDOW_MS / 1000);
    return Math.max(1, Math.ceil((requestCount.resetAt - Date.now()) / 1000));
  };

  if (comparisonService) {
    router.get('/:placeId/stream', (req, res) => {
      const ip = requestIp(req);
      // Headers flush lazily on the first event, so a rate-limited cold
      // Comparison can still answer with a real 429 instead of an SSE error.
      let streaming = false;

      let unsubscribe: () => void = () => undefined;
      res.on('close', () => unsubscribe());
      unsubscribe = comparisonService.subscribe(
        req.params.placeId,
        (event) => {
          if (res.writableEnded) return;
          if (!streaming) {
            if (event.type === 'error' && event.code === 'RATE_LIMITED') {
              const retryAfterSeconds = coldCompareRetryAfterSeconds(ip);
              res.setHeader('Retry-After', retryAfterSeconds);
              res.status(429).json({
                error: 'Too Many Requests',
                code: 'RATE_LIMITED',
                message: `Limit of ${COLD_COMPARE_LIMIT} new comparisons per hour reached. Try again in about ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
              });
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
        { beginColdCompare: () => beginColdCompare(ip) }
      );
    });
  }

  router.get(
    '/venues',
    asyncHandler(async (req, res) => {
      const latitude = queryNumber(req.query.latitude);
      const longitude = queryNumber(req.query.longitude);
      const radiusMiles = queryNumber(req.query.radiusMiles);

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180 ||
        !Number.isFinite(radiusMiles) ||
        radiusMiles < 1 ||
        radiusMiles > 15
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Valid latitude, longitude, and radiusMiles (1–15) are required',
        });
      }

      const now = Date.now();
      const ip = requestIp(req);
      pruneExpiredRequests(venueRequests, now);
      const requestCount = venueRequests.get(ip);
      if (!requestCount) {
        venueRequests.set(ip, { count: 1, resetAt: now + 60_000 });
      } else if (requestCount.count >= 30) {
        res.setHeader('Retry-After', Math.ceil((requestCount.resetAt - now) / 1000));
        return res.status(429).json({
          error: 'Too Many Requests',
          code: 'RATE_LIMITED',
          message: 'Too many venue searches. Please try again shortly.',
        });
      } else {
        requestCount.count++;
      }

      const [venues, suburb] = await Promise.all([
        searchNearbyVenues({
          latitude,
          longitude,
          radiusMeters: radiusMiles * 1609.344,
        }),
        reverseGeocodeSuburb?.(latitude, longitude).catch(() => undefined),
      ]);
      return res.json({ venues, suburb });
    })
  );

  return router;
}
