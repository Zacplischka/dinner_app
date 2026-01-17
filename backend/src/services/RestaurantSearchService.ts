import type { Restaurant } from '@dinder/shared/types';
import { config } from '../config/index.js';

interface GooglePlacesSearchParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxResults?: number;
}

interface GooglePlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
}

interface GooglePlaceResult {
  id: string;
  displayName: { text: string };
  rating?: number;
  priceLevel?: string;
  primaryType?: string;  // e.g., "mexican_restaurant", "golf_course"
  primaryTypeDisplayName?: { text: string };
  formattedAddress?: string;
  photos?: GooglePlacePhoto[];
}

export function mapPriceLevel(priceLevel: string): number {
  const mapping: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
    PRICE_LEVEL_UNSPECIFIED: 0,
  };
  return mapping[priceLevel] || 0;
}

export function getPhotoUrl(photoName: string, apiKey: string, maxHeightPx = 400): string {
  return `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxHeightPx=${maxHeightPx}`;
}

/**
 * Food-related place types that should be included in results.
 * These are places where people go to eat/drink, not retail stores.
 */
const FOOD_PLACE_TYPES = new Set([
  'restaurant',
  'cafe',
  'coffee_shop',
  'bar',
  'pub',
  'bakery',
  'food_court',
  'meal_takeaway',
  'meal_delivery',
]);

/**
 * Non-restaurant place types that should be explicitly blocked.
 * These venues may serve food but are not primarily restaurants.
 */
const BLOCKED_PLACE_TYPES = new Set([
  'golf_course',
  'bowling_alley',
  'movie_theater',
  'amusement_park',
  'casino',
  'stadium',
  'gym',
  'spa',
  'hotel',
  'lodging',
  'shopping_mall',
  'supermarket',
  'grocery_store',
  'convenience_store',
  'gas_station',
  'night_club',
  'event_venue',
]);

/**
 * Check if a place is a food establishment based on its primaryType.
 * Includes restaurants, cafes, bars, bakeries - anywhere people eat.
 * Excludes retail (supermarkets, stores) and non-food venues (golf courses).
 */
export function isRestaurantType(primaryType?: string): boolean {
  if (!primaryType) return false;
  // First check blocklist - these are never restaurants even if they serve food
  if (BLOCKED_PLACE_TYPES.has(primaryType)) return false;
  // Match exact food types or any *_restaurant subtype
  return FOOD_PLACE_TYPES.has(primaryType) || primaryType.endsWith('_restaurant');
}

export function transformGooglePlaceToRestaurant(place: GooglePlaceResult, apiKey?: string): Restaurant {
  const photoUrl = place.photos?.[0]?.name && apiKey
    ? getPhotoUrl(place.photos[0].name, apiKey)
    : undefined;

  return {
    placeId: place.id,
    name: place.displayName.text,
    rating: place.rating,
    priceLevel: place.priceLevel ? mapPriceLevel(place.priceLevel) : 0,
    cuisineType: place.primaryTypeDisplayName?.text,
    address: place.formattedAddress,
    photoUrl,
  };
}

/**
 * Known fast food chains that should be deduplicated.
 * Only these chains will have location suffixes stripped for deduplication.
 * This is intentionally conservative to avoid false positives.
 */
const KNOWN_CHAINS = /^(mcdonalds|wendys|dennys|arbys|hardees|churchs|carls|starbucks|kfc|subway|dominos|burger\s*king|taco\s*bell|pizza\s*hut|hungry\s*jacks|red\s*rooster|nandos|guzman\s*y\s*gomez)$/i;

/**
 * Normalize restaurant name for deduplication matching.
 * Only deduplicates known fast food chains to avoid false positives.
 */
export function normalizeRestaurantName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/['']/g, '')               // Remove apostrophes (McDonald's -> mcdonalds)
    .replace(/\s*[-#(].*$/, '')         // Remove suffixes (- Downtown, #123, (Airport))
    .replace(/[^a-z0-9\s]/g, '')        // Remove special chars
    .replace(/\s+/g, ' ')               // Collapse multiple spaces
    .trim();

  // Only extract brand name for KNOWN chains
  // This prevents false positive deduplication of unique restaurants
  const words = normalized.split(' ');

  // Check progressively longer prefixes to match multi-word chains
  // e.g., "burger king box hill" → check "burger", then "burger king"
  for (let i = 1; i <= Math.min(3, words.length); i++) {
    const prefix = words.slice(0, i).join(' ');
    if (KNOWN_CHAINS.test(prefix)) {
      return prefix;
    }
  }

  // For non-chains, return full normalized name (no aggressive stripping)
  return normalized;
}

/**
 * Deduplicate restaurants by chain name, keeping highest-rated instance.
 */
export function deduplicateRestaurants(restaurants: Restaurant[]): Restaurant[] {
  const groupedByName = new Map<string, Restaurant[]>();

  for (const restaurant of restaurants) {
    const normalizedName = normalizeRestaurantName(restaurant.name);
    if (!groupedByName.has(normalizedName)) {
      groupedByName.set(normalizedName, []);
    }
    groupedByName.get(normalizedName)!.push(restaurant);
  }

  const deduplicated: Restaurant[] = [];
  for (const [, group] of groupedByName) {
    // Keep highest-rated instance from each group
    const best = group.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    deduplicated.push(best);
  }

  return deduplicated;
}

/**
 * Fetch a single page of results from Text Search API
 */
async function fetchTextSearchPage(
  apiKey: string,
  latitude: number,
  longitude: number,
  radiusMeters: number,
  pageToken?: string
): Promise<{ places: GooglePlaceResult[]; nextPageToken?: string }> {
  const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';

  // Include nextPageToken in field mask if paginating
  const fieldMask = pageToken
    ? 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,nextPageToken'
    : 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,nextPageToken';

  const requestBody: Record<string, unknown> = {
    textQuery: 'restaurants',
    includedType: 'restaurant',
    strictTypeFiltering: true,
    locationBias: {
      circle: {
        center: { latitude, longitude },
        radius: radiusMeters,
      },
    },
    pageSize: 20,
  };

  // Add pageToken for subsequent pages
  if (pageToken) {
    requestBody.pageToken = pageToken;
  }

  const response = await fetch(textSearchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(requestBody),
  });

  if (response.status === 429) {
    const retryAfter = parseFloat(response.headers.get('Retry-After') || '1');
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Places API Error:', response.status, response.statusText);
    console.error('Error body:', errorBody);
    throw new Error(`Places API error: ${response.statusText}`);
  }

  const data = await response.json() as { places?: GooglePlaceResult[]; nextPageToken?: string };
  return {
    places: data.places || [],
    nextPageToken: data.nextPageToken,
  };
}

export async function searchNearbyRestaurants(
  params: GooglePlacesSearchParams
): Promise<Restaurant[]> {
  const { latitude, longitude, radiusMeters, maxResults = 50 } = params;

  const apiKey = config.googlePlaces.apiKey;

  if (!apiKey) {
    throw new Error('Google Places API configuration missing');
  }

  const allPlaces: GooglePlaceResult[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3; // Text Search allows up to 60 results (3 pages of 20)
  const maxRetries = 3;

  // Fetch pages until we have enough results or no more pages
  while (pageCount < maxPages && allPlaces.length < maxResults) {
    let retries = 0;
    let pageData: { places: GooglePlaceResult[]; nextPageToken?: string } | null = null;

    while (retries < maxRetries) {
      try {
        pageData = await fetchTextSearchPage(apiKey, latitude, longitude, radiusMeters, pageToken);
        break;
      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMITED') {
          retries++;
          continue;
        }
        throw error;
      }
    }

    if (!pageData) {
      throw new Error('Max retries exceeded');
    }

    allPlaces.push(...pageData.places);
    console.log(`[RestaurantSearch] Page ${pageCount + 1}: fetched ${pageData.places.length} places (total: ${allPlaces.length})`);

    pageToken = pageData.nextPageToken;
    pageCount++;

    // Stop if no more pages
    if (!pageToken) break;

    // Brief delay before next page request (Google recommends this)
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`[RestaurantSearch] API returned ${allPlaces.length} places total`);

  // Filter to only include actual restaurants (by primaryType)
  const restaurantPlaces = allPlaces.filter((place: GooglePlaceResult) =>
    isRestaurantType(place.primaryType)
  );
  console.log(`[RestaurantSearch] After isRestaurantType filter: ${restaurantPlaces.length} restaurants`);

  // Transform Google Places results to Restaurant objects
  const transformedRestaurants = restaurantPlaces.map((place: GooglePlaceResult) =>
    transformGooglePlaceToRestaurant(place, apiKey)
  );

  // Deduplicate chain restaurants (keeps highest-rated instance)
  const uniqueRestaurants = deduplicateRestaurants(transformedRestaurants);
  console.log(`[RestaurantSearch] After deduplication: ${uniqueRestaurants.length} restaurants`);

  // Sort by rating descending
  const restaurants = uniqueRestaurants.sort((a, b) =>
    (b.rating || 0) - (a.rating || 0)
  );

  return restaurants;
}
