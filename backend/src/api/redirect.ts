import { Router } from 'express';
import type { VenueDetails } from '../services/RestaurantSearchService.js';
import { asyncHandler } from './asyncHandler.js';

// Counting redirect for results-screen delivery buttons (#72): makes "the
// group acted on a card" server-countable, then 302s to the Platform's
// public search deep link. Exactly three parameters; no cookies.
const PLATFORMS = new Set(['ubereats', 'doordash']);
const SOURCES = new Set(['match_card', 'near_miss']);

interface RedirectRouterDeps {
  fetchPlaceDetails: (placeId: string) => Promise<VenueDetails>;
}

export function createRedirectRouter({ fetchPlaceDetails }: RedirectRouterDeps) {
  const router = Router();

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
        !SOURCES.has(source)
      ) {
        return res.status(400).json({
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message:
            'platform (ubereats|doordash), placeId, and source (match_card|near_miss) are required',
        });
      }

      const venue = await fetchPlaceDetails(placeId);
      // Same public search links the Match card builds client-side.
      const query = encodeURIComponent(`${venue.name} ${venue.address}`);
      const target =
        platform === 'ubereats'
          ? `https://www.ubereats.com/search?q=${query}`
          : `https://www.doordash.com/search/store/${query}/`;

      req.log?.info({ platform, placeId, source }, 'Delivery redirect');
      return res.redirect(302, target);
    })
  );

  return router;
}
