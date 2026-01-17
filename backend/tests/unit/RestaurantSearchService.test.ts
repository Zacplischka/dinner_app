import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';

describe('RestaurantSearchService', () => {
  describe('transformGooglePlaceToRestaurant', () => {
    it('should transform Google Place with all fields to Restaurant', () => {
      const googlePlace = {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: 'Pizza Palace' },
        rating: 4.5,
        priceLevel: 'PRICE_LEVEL_MODERATE',
        primaryTypeDisplayName: { text: 'Italian Restaurant' },
        formattedAddress: '123 Main St, San Francisco, CA 94102',
      };

      const result = RestaurantSearchService.transformGooglePlaceToRestaurant(googlePlace);

      expect(result).toEqual({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        name: 'Pizza Palace',
        rating: 4.5,
        priceLevel: 2, // MODERATE = 2
        cuisineType: 'Italian Restaurant',
        address: '123 Main St, San Francisco, CA 94102',
      });
    });

    it('should handle missing optional fields gracefully', () => {
      const googlePlace = {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: 'Pizza Palace' },
        // rating missing
        priceLevel: 'PRICE_LEVEL_UNSPECIFIED',
        // primaryTypeDisplayName missing
        // formattedAddress missing
      };

      const result = RestaurantSearchService.transformGooglePlaceToRestaurant(googlePlace);

      expect(result).toEqual({
        placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        name: 'Pizza Palace',
        rating: undefined,
        priceLevel: 0,
        cuisineType: undefined,
        address: undefined,
      });
    });
  });

  describe('mapPriceLevel', () => {
    it('should map PRICE_LEVEL_FREE to 0', () => {
      expect(RestaurantSearchService.mapPriceLevel('PRICE_LEVEL_FREE')).toBe(0);
    });

    it('should map PRICE_LEVEL_INEXPENSIVE to 1', () => {
      expect(RestaurantSearchService.mapPriceLevel('PRICE_LEVEL_INEXPENSIVE')).toBe(1);
    });

    it('should map PRICE_LEVEL_MODERATE to 2', () => {
      expect(RestaurantSearchService.mapPriceLevel('PRICE_LEVEL_MODERATE')).toBe(2);
    });

    it('should map PRICE_LEVEL_EXPENSIVE to 3', () => {
      expect(RestaurantSearchService.mapPriceLevel('PRICE_LEVEL_EXPENSIVE')).toBe(3);
    });

    it('should map PRICE_LEVEL_VERY_EXPENSIVE to 4', () => {
      expect(RestaurantSearchService.mapPriceLevel('PRICE_LEVEL_VERY_EXPENSIVE')).toBe(4);
    });

    it('should map unknown values to 0', () => {
      expect(RestaurantSearchService.mapPriceLevel('INVALID')).toBe(0);
    });
  });

  describe('searchNearbyRestaurants', () => {
    let fetchMock: any;

    beforeEach(() => {
      // Mock global fetch
      fetchMock = vi.fn();
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call Google Places Text Search API with correct parameters', async () => {
      const mockResponse = {
        places: [
          {
            id: 'place1',
            displayName: { text: 'Restaurant 1' },
            rating: 4.5,
            priceLevel: 'PRICE_LEVEL_MODERATE',
            primaryType: 'italian_restaurant',
            primaryTypeDisplayName: { text: 'Italian' },
            formattedAddress: '123 Main St',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: {
          get: () => null,
        },
      });

      const result = await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72, // 5 miles
        maxResults: 50,
      });

      // Text Search API uses different endpoint and request structure
      expect(fetchMock).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': expect.any(String),
            'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryType,places.primaryTypeDisplayName,places.formattedAddress,places.photos,nextPageToken',
          },
          body: JSON.stringify({
            textQuery: 'restaurants',
            includedType: 'restaurant',
            strictTypeFiltering: true,
            locationBias: {
              circle: {
                center: {
                  latitude: 37.7749,
                  longitude: -122.4194,
                },
                radius: 8046.72,
              },
            },
            pageSize: 20,
          }),
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Restaurant 1');
    });

    it('should sort results by rating descending', async () => {
      const mockResponse = {
        places: [
          { id: '1', displayName: { text: 'R1' }, rating: 3.5, priceLevel: 'PRICE_LEVEL_MODERATE', primaryType: 'restaurant' },
          { id: '2', displayName: { text: 'R2' }, rating: 4.8, priceLevel: 'PRICE_LEVEL_MODERATE', primaryType: 'mexican_restaurant' },
          { id: '3', displayName: { text: 'R3' }, rating: 4.2, priceLevel: 'PRICE_LEVEL_MODERATE', primaryType: 'italian_restaurant' },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: {
          get: () => null,
        },
      });

      const result = await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72,
      });

      expect(result[0].rating).toBe(4.8);
      expect(result[1].rating).toBe(4.2);
      expect(result[2].rating).toBe(3.5);
    });

    it('should handle API errors gracefully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Error details',
        headers: {
          get: () => null,
        },
      });

      await expect(
        RestaurantSearchService.searchNearbyRestaurants({
          latitude: 37.7749,
          longitude: -122.4194,
          radiusMeters: 8046.72,
        })
      ).rejects.toThrow('Places API error: Bad Request');
    });

    it('should retry on 429 rate limiting', async () => {
      // First call: 429 with Retry-After header
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => name === 'Retry-After' ? '0.1' : null,
        },
      });

      // Second call: Success
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [] }),
        headers: {
          get: () => null,
        },
      });

      await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries', async () => {
      // Mock 3 consecutive 429 responses
      for (let i = 0; i < 3; i++) {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: {
            get: (name: string) => name === 'Retry-After' ? '0.1' : null,
          },
        });
      }

      await expect(
        RestaurantSearchService.searchNearbyRestaurants({
          latitude: 37.7749,
          longitude: -122.4194,
          radiusMeters: 8046.72,
        })
      ).rejects.toThrow();
    }, 10000); // Increase timeout for retry logic

    it('should return empty array if no places found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ places: [] }),
        headers: {
          get: () => null,
        },
      });

      const result = await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72,
      });

      expect(result).toEqual([]);
    });

    it('should filter out non-restaurant places by primaryType', async () => {
      const mockResponse = {
        places: [
          { id: '1', displayName: { text: 'Good Restaurant' }, rating: 4.5, priceLevel: 'PRICE_LEVEL_MODERATE', primaryType: 'italian_restaurant' },
          { id: '2', displayName: { text: 'Golf Club' }, rating: 4.8, priceLevel: 'PRICE_LEVEL_EXPENSIVE', primaryType: 'golf_course' },
          { id: '3', displayName: { text: 'Supermarket Deli' }, rating: 4.0, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryType: 'supermarket' },
          { id: '4', displayName: { text: 'Another Restaurant' }, rating: 4.2, priceLevel: 'PRICE_LEVEL_MODERATE', primaryType: 'restaurant' },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: {
          get: () => null,
        },
      });

      const result = await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72,
      });

      // Should only include the 2 actual restaurants
      expect(result).toHaveLength(2);
      expect(result.map(r => r.name)).toContain('Good Restaurant');
      expect(result.map(r => r.name)).toContain('Another Restaurant');
      expect(result.map(r => r.name)).not.toContain('Golf Club');
      expect(result.map(r => r.name)).not.toContain('Supermarket Deli');
    });

    it('should deduplicate chain restaurants keeping highest rated', async () => {
      const mockResponse = {
        places: [
          { id: '1', displayName: { text: "McDonald's" }, rating: 3.5, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryType: 'fast_food_restaurant' },
          { id: '2', displayName: { text: "McDonald's - Downtown" }, rating: 4.2, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryType: 'fast_food_restaurant' },
          { id: '3', displayName: { text: 'Burger King' }, rating: 4.0, priceLevel: 'PRICE_LEVEL_INEXPENSIVE', primaryType: 'fast_food_restaurant' },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: {
          get: () => null,
        },
      });

      const result = await RestaurantSearchService.searchNearbyRestaurants({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: 8046.72,
      });

      // Should have 2 unique restaurants (1 McDonald's, 1 Burger King)
      expect(result).toHaveLength(2);
      // McDonald's should be the highest-rated one (4.2)
      const mcdonalds = result.find(r => r.name.toLowerCase().includes('mcdonald'));
      expect(mcdonalds?.rating).toBe(4.2);
    });
  });

  describe('isRestaurantType', () => {
    it('should return true for "restaurant" type', () => {
      expect(RestaurantSearchService.isRestaurantType('restaurant')).toBe(true);
    });

    it('should return true for types ending in "_restaurant"', () => {
      expect(RestaurantSearchService.isRestaurantType('mexican_restaurant')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('italian_restaurant')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('fast_food_restaurant')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('seafood_restaurant')).toBe(true);
    });

    it('should return true for other food establishments (cafe, bar, bakery)', () => {
      expect(RestaurantSearchService.isRestaurantType('cafe')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('coffee_shop')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('bar')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('pub')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('bakery')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('food_court')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('meal_takeaway')).toBe(true);
      expect(RestaurantSearchService.isRestaurantType('meal_delivery')).toBe(true);
    });

    it('should return false for non-food types', () => {
      expect(RestaurantSearchService.isRestaurantType('golf_course')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('supermarket')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('gas_station')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('grocery_store')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('shopping_mall')).toBe(false);
    });

    it('should return false for blocked venue types that may serve food', () => {
      // Entertainment venues
      expect(RestaurantSearchService.isRestaurantType('bowling_alley')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('movie_theater')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('amusement_park')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('casino')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('stadium')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('night_club')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('event_venue')).toBe(false);
      // Accommodation
      expect(RestaurantSearchService.isRestaurantType('hotel')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('lodging')).toBe(false);
      // Health/wellness
      expect(RestaurantSearchService.isRestaurantType('gym')).toBe(false);
      expect(RestaurantSearchService.isRestaurantType('spa')).toBe(false);
      // Retail
      expect(RestaurantSearchService.isRestaurantType('convenience_store')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(RestaurantSearchService.isRestaurantType(undefined)).toBe(false);
    });
  });

  describe('normalizeRestaurantName', () => {
    it('should lowercase name', () => {
      expect(RestaurantSearchService.normalizeRestaurantName("McDonald's")).toBe('mcdonalds');
    });

    it('should remove apostrophes', () => {
      expect(RestaurantSearchService.normalizeRestaurantName("Wendy's")).toBe('wendys');
    });

    it('should remove location suffixes with dash', () => {
      expect(RestaurantSearchService.normalizeRestaurantName('Burger King - Airport')).toBe('burger king');
    });

    it('should remove location suffixes with parentheses', () => {
      expect(RestaurantSearchService.normalizeRestaurantName('Subway (Downtown)')).toBe('subway');
    });

    it('should remove store numbers', () => {
      expect(RestaurantSearchService.normalizeRestaurantName('Taco Bell #4521')).toBe('taco bell');
    });

    it('should handle special characters', () => {
      expect(RestaurantSearchService.normalizeRestaurantName("P.F. Chang's")).toBe('pf changs');
    });

    it('should collapse multiple spaces', () => {
      expect(RestaurantSearchService.normalizeRestaurantName('Five   Guys')).toBe('five guys');
    });

    it('should extract brand name for known chains with embedded locations', () => {
      // McDonald's with various location formats
      expect(RestaurantSearchService.normalizeRestaurantName("McDonald's mt waverly")).toBe('mcdonalds');
      expect(RestaurantSearchService.normalizeRestaurantName("McDonald's Balwyn")).toBe('mcdonalds');
      expect(RestaurantSearchService.normalizeRestaurantName("McDonald's Glen Waverley")).toBe('mcdonalds');
    });

    it('should extract brand name for other known chains', () => {
      expect(RestaurantSearchService.normalizeRestaurantName("Subway Box Hill")).toBe('subway');
      expect(RestaurantSearchService.normalizeRestaurantName("KFC Doncaster")).toBe('kfc');
      expect(RestaurantSearchService.normalizeRestaurantName("Domino's Mt Waverley")).toBe('dominos');
    });

    it('should extract brand name for multi-word chains', () => {
      expect(RestaurantSearchService.normalizeRestaurantName('Burger King Box Hill')).toBe('burger king');
      expect(RestaurantSearchService.normalizeRestaurantName('Pizza Hut East')).toBe('pizza hut');
      expect(RestaurantSearchService.normalizeRestaurantName('Guzman y Gomez - Box Hill')).toBe('guzman y gomez');
    });

    it('should NOT strip location from non-chain restaurants (conservative)', () => {
      // Non-chain restaurants should keep their full name to avoid false deduplication
      expect(RestaurantSearchService.normalizeRestaurantName('Local Cafe Mt Waverley')).toBe('local cafe mt waverley');
      expect(RestaurantSearchService.normalizeRestaurantName('The Pancake Parlour Doncaster')).toBe('the pancake parlour doncaster');
      expect(RestaurantSearchService.normalizeRestaurantName('Haidilao Hotpot Glen Waverley')).toBe('haidilao hotpot glen waverley');
    });
  });

  describe('deduplicateRestaurants', () => {
    it('should keep highest rated duplicate', () => {
      const restaurants = [
        { placeId: '1', name: "McDonald's", rating: 3.5, priceLevel: 1 },
        { placeId: '2', name: "McDonald's - Downtown", rating: 4.2, priceLevel: 1 },
      ];
      const result = RestaurantSearchService.deduplicateRestaurants(restaurants as any);
      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(4.2);
    });

    it('should preserve unique restaurants', () => {
      const restaurants = [
        { placeId: '1', name: "McDonald's", rating: 3.5, priceLevel: 1 },
        { placeId: '2', name: 'Burger King', rating: 4.0, priceLevel: 1 },
      ];
      const result = RestaurantSearchService.deduplicateRestaurants(restaurants as any);
      expect(result).toHaveLength(2);
    });

    it('should handle restaurants with no rating', () => {
      const restaurants = [
        { placeId: '1', name: "McDonald's", rating: undefined, priceLevel: 1 },
        { placeId: '2', name: "McDonald's - Airport", rating: 3.8, priceLevel: 1 },
      ];
      const result = RestaurantSearchService.deduplicateRestaurants(restaurants as any);
      expect(result).toHaveLength(1);
      expect(result[0].rating).toBe(3.8); // Should keep the one with a rating
    });

    it('should return empty array for empty input', () => {
      const result = RestaurantSearchService.deduplicateRestaurants([]);
      expect(result).toEqual([]);
    });
  });
});
