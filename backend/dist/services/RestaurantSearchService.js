import { config } from '../config/index.js';
export function mapPriceLevel(priceLevel) {
    const mapping = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
        PRICE_LEVEL_UNSPECIFIED: 0,
    };
    return mapping[priceLevel] || 0;
}
export function getPhotoUrl(photoName, apiKey, maxHeightPx = 400) {
    return `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxHeightPx=${maxHeightPx}`;
}
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
export function isRestaurantType(primaryType) {
    if (!primaryType)
        return false;
    if (BLOCKED_PLACE_TYPES.has(primaryType))
        return false;
    return FOOD_PLACE_TYPES.has(primaryType) || primaryType.endsWith('_restaurant');
}
export function transformGooglePlaceToRestaurant(place, apiKey) {
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
const KNOWN_CHAINS = /^(mcdonalds|wendys|dennys|arbys|hardees|churchs|carls|starbucks|kfc|subway|dominos|burger\s*king|taco\s*bell|pizza\s*hut|hungry\s*jacks|red\s*rooster|nandos|guzman\s*y\s*gomez)$/i;
export function normalizeRestaurantName(name) {
    const normalized = name
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/\s*[-#(].*$/, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const words = normalized.split(' ');
    for (let i = 1; i <= Math.min(3, words.length); i++) {
        const prefix = words.slice(0, i).join(' ');
        if (KNOWN_CHAINS.test(prefix)) {
            return prefix;
        }
    }
    return normalized;
}
export function deduplicateRestaurants(restaurants) {
    const groupedByName = new Map();
    for (const restaurant of restaurants) {
        const normalizedName = normalizeRestaurantName(restaurant.name);
        if (!groupedByName.has(normalizedName)) {
            groupedByName.set(normalizedName, []);
        }
        groupedByName.get(normalizedName).push(restaurant);
    }
    const deduplicated = [];
    for (const [, group] of groupedByName) {
        const best = group.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
        deduplicated.push(best);
    }
    return deduplicated;
}
async function fetchTextSearchPage(apiKey, latitude, longitude, radiusMeters, pageToken) {
    const textSearchUrl = 'https://places.googleapis.com/v1/places:searchText';
    const fieldMask = pageToken
        ? 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,nextPageToken'
        : 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,nextPageToken';
    const requestBody = {
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
    const data = await response.json();
    return {
        places: data.places || [],
        nextPageToken: data.nextPageToken,
    };
}
export async function searchNearbyRestaurants(params) {
    const { latitude, longitude, radiusMeters, maxResults = 50 } = params;
    const apiKey = config.googlePlaces.apiKey;
    if (!apiKey) {
        throw new Error('Google Places API configuration missing');
    }
    const allPlaces = [];
    let pageToken;
    let pageCount = 0;
    const maxPages = 3;
    const maxRetries = 3;
    while (pageCount < maxPages && allPlaces.length < maxResults) {
        let retries = 0;
        let pageData = null;
        while (retries < maxRetries) {
            try {
                pageData = await fetchTextSearchPage(apiKey, latitude, longitude, radiusMeters, pageToken);
                break;
            }
            catch (error) {
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
        if (!pageToken)
            break;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    console.log(`[RestaurantSearch] API returned ${allPlaces.length} places total`);
    const restaurantPlaces = allPlaces.filter((place) => isRestaurantType(place.primaryType));
    console.log(`[RestaurantSearch] After isRestaurantType filter: ${restaurantPlaces.length} restaurants`);
    const transformedRestaurants = restaurantPlaces.map((place) => transformGooglePlaceToRestaurant(place, apiKey));
    const uniqueRestaurants = deduplicateRestaurants(transformedRestaurants);
    console.log(`[RestaurantSearch] After deduplication: ${uniqueRestaurants.length} restaurants`);
    const restaurants = uniqueRestaurants.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return restaurants;
}
//# sourceMappingURL=RestaurantSearchService.js.map