import type { Restaurant } from '@dinner-app/shared/types';
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

export async function searchNearbyRestaurants(
  params: GooglePlacesSearchParams
): Promise<Restaurant[]> {
  const { latitude, longitude, radiusMeters, maxResults = 50 } = params;

  const apiKey = config.googlePlaces.apiKey;
  const apiUrl = config.googlePlaces.apiUrl;

  if (!apiKey || !apiUrl) {
    throw new Error('Google Places API configuration missing');
  }

  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryTypeDisplayName,places.formattedAddress,places.photos',
      },
      body: JSON.stringify({
        includedTypes: ['restaurant'],
        maxResultCount: maxResults,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: radiusMeters,
          },
        },
      }),
    });

    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get('Retry-After') || '1');
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      retries++;
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Places API Error:', response.status, response.statusText);
      console.error('Error body:', errorBody);
      throw new Error(`Places API error: ${response.statusText}`);
    }

    const data = await response.json() as { places?: GooglePlaceResult[] };
    const places = data.places || [];

    const restaurants = places
      .map((place: GooglePlaceResult) => transformGooglePlaceToRestaurant(place, apiKey))
      .sort((a: Restaurant, b: Restaurant) => (b.rating || 0) - (a.rating || 0));

    return restaurants;
  }

  throw new Error('Max retries exceeded');
}
