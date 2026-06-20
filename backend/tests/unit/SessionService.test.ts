import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as SessionService from '../../src/services/SessionService.js';
import * as RestaurantSearchService from '../../src/services/RestaurantSearchService.js';
import { redis } from '../../src/redis/client.js';
import * as ParticipantModel from '../../src/models/Participant.js';

describe('SessionService', () => {
  const testSessionCode = 'TEST123';
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const createdSessionCodes: string[] = [];

  afterEach(async () => {
    // Clean up test data
    await redis.del(`session:${testSessionCode}`);
    await redis.del('session:NOHST1');
    await redis.del('session:NOHST1:participants');
    await redis.del('session:AAAAAA');
    await redis.del(`session:${testSessionCode}:restaurant_ids`);
    await redis.del(`session:${testSessionCode}:restaurants`);
    for (const sessionCode of createdSessionCodes.splice(0)) {
      const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
      const keys = [
        `session:${sessionCode}`,
        `session:${sessionCode}:participants`,
        `session:${sessionCode}:restaurant_ids`,
        `session:${sessionCode}:restaurants`,
        ...participantIds.flatMap((participantId) => [
          `participant:${participantId}`,
          `session:${sessionCode}:${participantId}:selections`,
        ]),
      ];
      await redis.del(...keys);
    }
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
    vi.restoreAllMocks();
  });

  describe('createSession code generation', () => {
    it('should fail after repeated session code collisions', async () => {
      await redis.hset('session:AAAAAA', {
        hostId: 'existing-host',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(SessionService.createSession('Alice')).rejects.toThrow(
        'Failed to generate unique session code'
      );
    });
  });

  describe('getSession', () => {
    it('should return null when the session has no TTL', async () => {
      await redis.hset(`session:${testSessionCode}`, {
        hostId: 'host-1',
        hostName: 'Alice',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });

      await expect(SessionService.getSession(testSessionCode)).resolves.toBeNull();
    });

    it('should prefer the joined host participant display name', async () => {
      delete process.env.FRONTEND_URL;
      const result = await SessionService.createSession('Original Host');
      createdSessionCodes.push(result.sessionCode);
      await ParticipantModel.addParticipant(
        result.sessionCode,
        'host-participant',
        'Joined Host',
        true
      );

      const session = await SessionService.getSession(result.sessionCode);

      expect(session?.hostName).toBe('Joined Host');
      expect(session?.shareableLink).toBe(`http://localhost:3000/join?code=${result.sessionCode}`);
    });

    it('should use an unknown host fallback and custom frontend URL', async () => {
      process.env.FRONTEND_URL = 'https://frontend.example.test';
      await redis.hset('session:NOHST1', {
        hostId: 'host-1',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      await redis.expire('session:NOHST1', 1800);

      const session = await SessionService.getSession('NOHST1');

      expect(session?.hostName).toBe('Unknown Host');
      expect(session?.shareableLink).toBe('https://frontend.example.test/join?code=NOHST1');
    });
  });

  describe('joinSession', () => {
    it('should reject missing sessions', async () => {
      await expect(
        SessionService.joinSession(testSessionCode, 'participant-1', 'Bob')
      ).rejects.toThrow('SESSION_NOT_FOUND');
    });
  });

  describe('createSession with location', () => {
    it('should create a shareable link from default and custom frontend URLs', async () => {
      delete process.env.FRONTEND_URL;

      const defaultResult = await SessionService.createSession('Alice');
      createdSessionCodes.push(defaultResult.sessionCode);

      expect(defaultResult.shareableLink).toBe(
        `http://localhost:3000/join?code=${defaultResult.sessionCode}`
      );

      process.env.FRONTEND_URL = 'https://frontend.example.test';

      const customResult = await SessionService.createSession('Bob');
      createdSessionCodes.push(customResult.sessionCode);

      expect(customResult.shareableLink).toBe(
        `https://frontend.example.test/join?code=${customResult.sessionCode}`
      );
    });

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
        maxResults: 20,
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
        maxResults: 20,
      });
    });
  });
});
