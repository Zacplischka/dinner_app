import { logger } from '../logger.js';
import type { GeocodedArea, Restaurant, Venue } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { DomainError } from './DomainError.js';
import { distanceMeters } from './storefrontResolution.js';

const METERS_PER_MILE = 1609.344;

export interface GooglePlacesSearchParams {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxResults?: number;
}

export interface VenueDetails {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
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
  primaryType?: string; // e.g., "mexican_restaurant", "golf_course"
  primaryTypeDisplayName?: { text: string };
  formattedAddress?: string;
  photos?: GooglePlacePhoto[];
  location?: { latitude: number; longitude: number };
  currentOpeningHours?: { openNow?: boolean };
}

// Shared 429 handling for every Google API this service spends the key on
// (issue #216): retry honouring Retry-After, and when the 429 persists, log at
// error level naming the API — so the log answers "which quota" without a code
// read — and return undefined. Each call site then decides only whether to
// surface (DomainError RATE_LIMITED) or degrade.
const MAX_RATE_LIMIT_RETRIES = 3;

async function fetchWithRateLimitRetry(
  apiName: string,
  doFetch: () => Promise<Response>
): Promise<Response | undefined> {
  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
    const response = await doFetch();
    if (response.status !== 429) return response;
    const retryAfter = parseFloat(response.headers.get('Retry-After') || '1');
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
  }
  logger.error(
    { retries: MAX_RATE_LIMIT_RETRIES },
    `${apiName} rate limit persisted after retries`
  );
  return undefined;
}

export async function fetchPlaceDetails(placeId: string): Promise<VenueDetails> {
  const apiKey = config.googlePlaces.apiKey;
  if (!apiKey) {
    throw new Error('Google Places API configuration missing');
  }

  const response = await fetchWithRateLimitRetry('Places details', () =>
    fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
      },
    })
  );

  if (!response) {
    // Blocking: Comparison and the delivery redirect dead-end without the Venue.
    throw new DomainError(
      'RATE_LIMITED',
      'Venue lookup is temporarily unavailable: the app has reached its Google Places limit. Please try again later.'
    );
  }
  if (!response.ok) {
    throw new Error(`Places API error: ${response.statusText}`);
  }

  const place = (await response.json()) as GooglePlaceResult;
  if (!place.id || !place.displayName?.text || !place.formattedAddress || !place.location) {
    throw new Error('Places API returned incomplete Venue details');
  }

  return {
    placeId: place.id,
    name: place.displayName.text,
    address: place.formattedAddress,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
  };
}

export async function reverseGeocodeSuburb(
  latitude: number,
  longitude: number
): Promise<string | undefined> {
  const apiKey = config.googlePlaces.apiKey;
  if (!apiKey) {
    throw new Error('Google Places API configuration missing');
  }

  const response = await fetchWithRateLimitRetry('Geocoding reverse lookup', () =>
    fetch(
      `https://geocode.googleapis.com/v4/geocode/location/${latitude},${longitude}?types=locality&regionCode=AU&languageCode=en`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'results.addressComponents.longText,results.addressComponents.types',
        },
      }
    )
  );
  // Best-effort decoration: the suburb name only labels a location the caller
  // already has, so a persistent 429 degrades to no label, never an error.
  if (!response) return undefined;
  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      addressComponents?: Array<{ longText?: string; types?: string[] }>;
    }>;
  };
  return data.results
    ?.flatMap((result) => result.addressComponents || [])
    .find((component) => component.types?.includes('locality'))?.longText;
}

export async function geocodeArea(query: string): Promise<GeocodedArea | undefined> {
  const apiKey = config.googlePlaces.apiKey;
  if (!apiKey) {
    throw new Error('Google Places API configuration missing');
  }

  const response = await fetchWithRateLimitRetry('Geocoding address', () =>
    fetch(
      `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(query)}?regionCode=AU&languageCode=en`,
      {
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'results.location,results.formattedAddress',
        },
      }
    )
  );
  if (!response) {
    // Blocking: without this the Host cannot resolve an area or create a Session.
    throw new DomainError(
      'RATE_LIMITED',
      'Location lookup is temporarily unavailable: the app has reached its Google Geocoding limit. Please try again later.'
    );
  }
  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.statusText}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      location?: { latitude: number; longitude: number };
      formattedAddress?: string;
    }>;
  };
  const match = data.results?.find((result) => result.location);
  if (!match?.location) return undefined;

  return {
    latitude: match.location.latitude,
    longitude: match.location.longitude,
    area: match.formattedAddress,
  };
}

// Maps Google's PriceLevel enum to 0-4. Unknown or unspecified levels return
// undefined so clients omit the price instead of implying the venue is free.
export function mapPriceLevel(priceLevel: string): number | undefined {
  const mapping: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return mapping[priceLevel];
}

// The client never sees a Google media URL: it gets a proxy path, and the
// backend spends the API key on its behalf in fetchPlacePhoto.
export function getPhotoUrl(photoName: string): string {
  return `/api/comparison/photo?name=${encodeURIComponent(photoName)}`;
}

export async function fetchPlacePhoto(photoName: string): Promise<string> {
  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) {
    throw new Error('Invalid Google Places photo name');
  }
  const apiKey = config.googlePlaces.apiKey;
  if (!apiKey) throw new Error('Google Places API configuration missing');

  const response = await fetchWithRateLimitRetry('Places photo', () =>
    fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&skipHttpRedirect=true`,
      {
        headers: { 'X-Goog-Api-Key': apiKey },
      }
    )
  );
  // Decorative: the card already renders without a photo, so a persistent 429
  // stays a plain Error (generic 500 on the proxy route) — no new error surface.
  if (!response) throw new Error('Places photo API error: rate limited');
  if (!response.ok) throw new Error(`Places photo API error: ${response.statusText}`);

  const output = (await response.json()) as { photoUri?: unknown };
  if (typeof output.photoUri !== 'string')
    throw new Error('Places API returned an invalid photo URL');
  try {
    const photoUrl = new URL(output.photoUri);
    if (
      photoUrl.protocol !== 'https:' ||
      (photoUrl.hostname !== 'googleusercontent.com' &&
        !photoUrl.hostname.endsWith('.googleusercontent.com'))
    ) {
      throw new Error();
    }
    return photoUrl.toString();
  } catch {
    throw new Error('Places API returned an invalid photo URL');
  }
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

export function transformGooglePlaceToRestaurant(place: GooglePlaceResult): Restaurant {
  const photoName = place.photos?.[0]?.name;

  return {
    placeId: place.id,
    name: place.displayName.text,
    rating: place.rating,
    priceLevel: place.priceLevel ? mapPriceLevel(place.priceLevel) : undefined,
    cuisineType: place.primaryTypeDisplayName?.text,
    address: place.formattedAddress,
    photoUrl: photoName ? getPhotoUrl(photoName) : undefined,
    openNow: place.currentOpeningHours?.openNow,
  };
}

/**
 * Known fast food chains that should be deduplicated.
 * Only these chains will have location suffixes stripped for deduplication.
 * This is intentionally conservative to avoid false positives.
 */
const KNOWN_CHAINS =
  /^(mcdonalds|wendys|dennys|arbys|hardees|churchs|carls|starbucks|kfc|subway|dominos|burger\s*king|taco\s*bell|pizza\s*hut|hungry\s*jacks|red\s*rooster|nandos|guzman\s*y\s*gomez)$/i;

/**
 * Normalize restaurant name for deduplication matching.
 * Only deduplicates known fast food chains to avoid false positives.
 */
export function normalizeRestaurantName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/['']/g, '') // Remove apostrophes (McDonald's -> mcdonalds)
    .replace(/\s*[-#(].*$/, '') // Remove suffixes (- Downtown, #123, (Airport))
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Collapse multiple spaces
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
 * Fetch the first (and only) page of results from Text Search API.
 * Pagination is never followed — see fetchNearbyPlaces.
 */
async function fetchTextSearchPage(
  apiKey: string,
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<{ places: GooglePlaceResult[]; nextPageToken?: string }> {
  const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';

  const fieldMask =
    'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,places.location,places.currentOpeningHours.openNow,nextPageToken';

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

  const response = await fetchWithRateLimitRetry('Places searchText', () =>
    fetch(textSearchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(requestBody),
    })
  );

  if (!response) {
    // Persistent 429 = the Places searchText quota is exhausted (daily cap or
    // billing detached), not a transient burst — surface it instead of a
    // silent generic 500 (2026-07-22 outage).
    throw new DomainError(
      'RATE_LIMITED',
      'Restaurant search is temporarily unavailable: the app has reached its Google Places search limit. Please try again later.'
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      { status: response.status, statusText: response.statusText, errorBody },
      'Places API error'
    );
    throw new Error(`Places API error: ${response.statusText}`);
  }

  const data = (await response.json()) as { places?: GooglePlaceResult[]; nextPageToken?: string };
  return {
    places: data.places || [],
    nextPageToken: data.nextPageToken,
  };
}

async function fetchNearbyPlaces(params: GooglePlacesSearchParams): Promise<GooglePlaceResult[]> {
  const { latitude, longitude, radiusMeters } = params;

  const apiKey = config.googlePlaces.apiKey;

  if (!apiKey) {
    throw new Error('Google Places API configuration missing');
  }

  // Fetch exactly one page and never follow nextPageToken: every extra page
  // is a full-price Enterprise Text Search call, and 20 results is enough for
  // both the Comparison browse and the Session swipe search (issue #97).
  // 429s are retried inside fetchWithRateLimitRetry against this same request.
  const pageData = await fetchTextSearchPage(apiKey, latitude, longitude, radiusMeters);

  logger.info(
    { page: 1, fetched: pageData.places.length, total: pageData.places.length },
    'RestaurantSearch page fetched'
  );
  logger.info({ placeCount: pageData.places.length }, 'RestaurantSearch API returned places');

  return pageData.places;
}

export async function searchNearbyRestaurants(
  params: GooglePlacesSearchParams
): Promise<Restaurant[]> {
  const allPlaces = await fetchNearbyPlaces(params);

  // Filter to only include actual restaurants (by primaryType)
  const restaurantPlaces = allPlaces.filter((place: GooglePlaceResult) =>
    isRestaurantType(place.primaryType)
  );
  logger.info({ restaurantCount: restaurantPlaces.length }, 'RestaurantSearch after type filter');

  // Transform Google Places results to Restaurant objects
  const transformedRestaurants = restaurantPlaces.map(transformGooglePlaceToRestaurant);

  // Deduplicate chain restaurants (keeps highest-rated instance)
  const uniqueRestaurants = deduplicateRestaurants(transformedRestaurants);
  logger.info(
    { restaurantCount: uniqueRestaurants.length },
    'RestaurantSearch after deduplication'
  );

  // Sort by open state first (closed sinks to the bottom), then rating descending
  const restaurants = uniqueRestaurants.sort(
    (a, b) =>
      Number(a.openNow === false) - Number(b.openNow === false) || (b.rating || 0) - (a.rating || 0)
  );

  return restaurants;
}

export async function searchNearbyVenues(params: GooglePlacesSearchParams): Promise<Venue[]> {
  const places = await fetchNearbyPlaces(params);
  const origin = { latitude: params.latitude, longitude: params.longitude };
  const maxDistanceMiles = params.radiusMeters / METERS_PER_MILE;

  return places
    .filter((place) => isRestaurantType(place.primaryType) && place.location)
    .map((place) => ({
      placeId: place.id,
      name: place.displayName.text,
      rating: place.rating,
      cuisineType: place.primaryTypeDisplayName?.text,
      address: place.formattedAddress,
      photoUrl: place.photos?.[0]?.name ? getPhotoUrl(place.photos[0].name) : undefined,
      distanceMiles: distanceMeters(origin, place.location!) / METERS_PER_MILE,
    }))
    .filter((venue) => venue.distanceMiles <= maxDistanceMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, params.maxResults ?? 50);
}
