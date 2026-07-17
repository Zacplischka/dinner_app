import { Router } from 'express';
import type { Redis } from 'ioredis';
import { COMPARISON_TAP_SOURCE_SET } from '@dinder/shared/types';
import type { VenueDetails } from '../services/RestaurantSearchService.js';
import { asyncHandler } from './asyncHandler.js';
import {
  pruneExpiredRequests,
  requestIp,
  retryAfterSeconds,
  type RequestWindow,
} from './rateWindow.js';

// Counting redirect for results-screen delivery buttons (#72): makes "the
// group acted on a card" server-countable, then 302s to the Platform's
// public search deep link. Exactly three parameters; no cookies.
const PLATFORMS = new Set(['ubereats', 'doordash']);
// Each uncached redirect is a paid Places details lookup; cache the target and
// cap uncached lookups per IP so anonymous taps cannot run up spend.
const TARGET_CACHE_SECONDS = 24 * 60 * 60;
const REDIRECT_LIMIT = 30;
const REDIRECT_WINDOW_MS = 60 * 60_000;

interface RedirectRouterDeps {
  fetchPlaceDetails: (placeId: string) => Promise<VenueDetails>;
  targetCache?: Pick<Redis, 'get' | 'set'>;
}

export function createRedirectRouter({ fetchPlaceDetails, targetCache }: RedirectRouterDeps) {
  const router = Router();
  const redirectRequests = new Map<string, RequestWindow>();

  const beginUncachedRedirect = (ip: string) => {
    const now = Date.now();
    pruneExpiredRequests(redirectRequests, now);
    const requestCount = redirectRequests.get(ip);
    if (!requestCount) {
      redirectRequests.set(ip, { count: 1, resetAt: now + REDIRECT_WINDOW_MS });
      return true;
    }
    if (requestCount.count >= REDIRECT_LIMIT) return false;
    requestCount.count++;
    return true;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { platform, placeId, source } = req.query;
      if (
        typeof platform !== 'string' ||
        !PLATFORMS.has(platform) ||
        typeof placeId !== 'string' ||
        !placeId.trim() ||
        typeof source !== 'string' ||
        !COMPARISON_TAP_SOURCE_SET.has(source)
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message:
            'platform (ubereats|doordash), placeId, and source (match_card|near_miss) are required',
        });
      }

      const cacheKey = `redirect:target:${platform}:${placeId}`;
      // Cache errors fail open to the Places lookup — Redis must never break taps.
      let target = await targetCache?.get(cacheKey).catch(() => null);
      if (!target) {
        const ip = requestIp(req);
        if (!beginUncachedRedirect(ip)) {
          res.setHeader('Retry-After', retryAfterSeconds(redirectRequests, ip, REDIRECT_WINDOW_MS));
          return res.status(429).json({
            error: 'Too Many Requests',
            code: 'RATE_LIMITED',
            message: 'Too many delivery links opened. Please try again later.',
          });
        }

        const venue = await fetchPlaceDetails(placeId);
        // Same public search links the Match card builds client-side.
        const query = encodeURIComponent(`${venue.name} ${venue.address}`);
        target =
          platform === 'ubereats'
            ? `https://www.ubereats.com/search?q=${query}`
            : `https://www.doordash.com/search/store/${query}/`;
        await targetCache?.set(cacheKey, target, 'EX', TARGET_CACHE_SECONDS).catch(() => undefined);
      }

      req.log?.info({ platform, placeId, source }, 'Delivery redirect');
      return res.redirect(302, target);
    })
  );

  return router;
}
