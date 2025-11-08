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

    it('should call Google Places API with correct parameters', async () => {
      const mockResponse = {
        places: [
          {
            id: 'place1',
            displayName: { text: 'Restaurant 1' },
            rating: 4.5,
            priceLevel: 'PRICE_LEVEL_MODERATE',
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

      expect(fetchMock).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchNearby',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': expect.any(String),
            'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.priceLevel,places.primaryTypeDisplayName,places.formattedAddress',
          },
          body: JSON.stringify({
            includedTypes: ['restaurant'],
            maxResultCount: 50,
            locationRestriction: {
              circle: {
                center: {
                  latitude: 37.7749,
                  longitude: -122.4194,
                },
                radius: 8046.72,
              },
            },
          }),
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Restaurant 1');
    });

    it('should sort results by rating descending', async () => {
      const mockResponse = {
        places: [
          { id: '1', displayName: { text: 'R1' }, rating: 3.5, priceLevel: 'PRICE_LEVEL_MODERATE' },
          { id: '2', displayName: { text: 'R2' }, rating: 4.8, priceLevel: 'PRICE_LEVEL_MODERATE' },
          { id: '3', displayName: { text: 'R3' }, rating: 4.2, priceLevel: 'PRICE_LEVEL_MODERATE' },
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
  });
});
