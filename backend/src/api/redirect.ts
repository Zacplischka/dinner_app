import { Router } from 'express';
import type { Redis } from 'ioredis';
import {
  COMPARISON_TAP_SOURCE_SET,
  woolworthsProductUrl,
  woolworthsSearchUrl,
} from '@dinder/shared/types';
import type { VenueDetails } from '../services/RestaurantSearchService.js';
import { asyncHandler } from './asyncHandler.js';
import { admitRequest, requestIp, retryAfterSeconds, type RequestWindow } from './rateWindow.js';

// Counting redirect for results-screen delivery buttons (#72): makes "the
// group acted on a card" server-countable, then 302s to the Platform's
// public search deep link. Exactly three parameters; no cookies.
const PLATFORMS = new Set(['ubereats', 'doordash']);
// The same seam, for the Shopping List's Retailer links (#228, #238): every
// product deep link and every Unmatched search link is minted here so the
// affiliate seam stays open with server-side counting — nothing monetized.
// A Retailer target is computed, never looked up, so it needs no cache and no
// spend guard: it is not the Platform arm's paid Places call.
const RETAILERS = new Set(['woolworths']);
// Each uncached redirect is a paid Places details lookup; cache the target and
// cap uncached lookups per IP so anonymous taps cannot run up spend.
const TARGET_CACHE_SECONDS = 24 * 60 * 60;
const REDIRECT_LIMIT = 30;
const REDIRECT_WINDOW_MS = 60 * 60_000;

interface RedirectRouterDeps {
  fetchPlaceDetails: (placeId: string) => Promise<VenueDetails>;
  targetCache?: Pick<Redis, 'get' | 'set'>;
}

/** A product page for a Stockcode, a search for a term, or null for neither. */
function retailerTarget(stockcode: unknown, q: unknown): string | null {
  if (typeof stockcode === 'string' && /^\d{1,12}$/.test(stockcode)) {
    return woolworthsProductUrl(Number(stockcode));
  }
  if (typeof q === 'string' && q.trim() !== '') {
    return woolworthsSearchUrl(q.trim());
  }
  return null;
}

export function createRedirectRouter({ fetchPlaceDetails, targetCache }: RedirectRouterDeps) {
  const router = Router();
  const redirectRequests = new Map<string, RequestWindow>();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { retailer, stockcode, q } = req.query;
      if (retailer !== undefined) {
        const target =
          typeof retailer === 'string' && RETAILERS.has(retailer)
            ? retailerTarget(stockcode, q)
            : null;
        if (!target) {
          return res.status(400).json({
            code: 'VALIDATION_ERROR',
            message: 'retailer (woolworths) and one of stockcode or q are required',
          });
        }
        req.log?.info({ retailer, stockcode, q }, 'Retailer redirect');
        return res.redirect(302, target);
      }

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
        if (!admitRequest(redirectRequests, ip, REDIRECT_LIMIT, REDIRECT_WINDOW_MS)) {
          res.setHeader('Retry-After', retryAfterSeconds(redirectRequests, ip, REDIRECT_WINDOW_MS));
          return res.status(429).json({
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
