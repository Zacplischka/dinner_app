import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SessionService from '../../src/services/SessionService.js';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';
import { redis } from '../../src/redis/client.js';

describe('SessionService', () => {
  const testSessionCode = 'TEST123';

  afterEach(async () => {
    // Clean up test data
    await redis.del(`session:${testSessionCode}`);
    await redis.del(`session:${testSessionCode}:restaurant_ids`);
    await redis.del(`session:${testSessionCode}:restaurants`);
    vi.restoreAllMocks();
  });

  describe('createSession with location', () => {
    it('should search for nearby restaurants', async () => {
      const mockRestaurants = [
        { placeId: 'place1', name: 'Restaurant 1', rating: 4.5, priceLevel: 2, cuisineType: 'Italian', address: '123 Main St' },
        { placeId: 'place2', name: 'Restaurant 2', rating: 4.2, priceLevel: 3, cuisineType: 'Chinese', address: '456 Oak Ave' },
      ];

      const searchSpy = vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      expect(searchSpy).toHaveBeenCalledWith({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: expect.closeTo(8046.7, 1), // 5 miles in meters (allow 1 meter tolerance)
        maxResults: 50,
      });

      expect(result.restaurantCount).toBe(2);
    });

    it('should store restaurant Place IDs in Redis Set', async () => {
      const mockRestaurants = [
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ];

      vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const placeIds = await redis.smembers(`session:${result.sessionCode}:restaurant_ids`);
      expect(placeIds).toContain('place1');
    });

    it('should store full restaurant data in Redis Hash', async () => {
      const mockRestaurants = [
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2, cuisineType: 'Italian' },
      ];

      vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const restaurantData = await redis.hget(
        `session:${result.sessionCode}:restaurants`,
        'place1'
      );

      const restaurant = JSON.parse(restaurantData!);
      expect(restaurant.name).toBe('R1');
      expect(restaurant.rating).toBe(4.5);
    });

    it('should throw error if no restaurants found', async () => {
      vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue([]);

      await expect(
        SessionService.createSession(
          'Alice',
          { latitude: 37.7749, longitude: -122.4194 },
          5
        )
      ).rejects.toThrow('NO_RESTAURANTS_FOUND');
    });

    it('should set TTL on restaurant keys', async () => {
      const mockRestaurants = [
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ];

      vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const ttl = await redis.ttl(`session:${result.sessionCode}:restaurant_ids`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1800); // 30 minutes
    });

    it('should convert miles to meters correctly', async () => {
      const mockRestaurants = [
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ];

      const searchSpy = vi.spyOn(RestaurantSearchService, 'searchNearbyRestaurants')
        .mockResolvedValue(mockRestaurants);

      await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        10
      );

      expect(searchSpy).toHaveBeenCalledWith({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: expect.closeTo(16093.4, 1), // 10 miles in meters (allow 1 meter tolerance)
        maxResults: 50,
      });
    });
  });
});
