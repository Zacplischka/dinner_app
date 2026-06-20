import type { Restaurant } from '@dinder/shared/types';
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
    displayName: {
        text: string;
    };
    rating?: number;
    priceLevel?: string;
    primaryType?: string;
    primaryTypeDisplayName?: {
        text: string;
    };
    formattedAddress?: string;
    photos?: GooglePlacePhoto[];
}
export declare function mapPriceLevel(priceLevel: string): number;
export declare function getPhotoUrl(photoName: string, apiKey: string, maxHeightPx?: number): string;
export declare function isRestaurantType(primaryType?: string): boolean;
export declare function transformGooglePlaceToRestaurant(place: GooglePlaceResult, apiKey?: string): Restaurant;
export declare function normalizeRestaurantName(name: string): string;
export declare function deduplicateRestaurants(restaurants: Restaurant[]): Restaurant[];
export declare function searchNearbyRestaurants(params: GooglePlacesSearchParams): Promise<Restaurant[]>;
export {};
//# sourceMappingURL=RestaurantSearchService.d.ts.map