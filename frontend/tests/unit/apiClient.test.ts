// API Client Tests - TDD for Google Places API integration
// Phase 2.1: Update API Client to support location and restaurants

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiClient from '../../src/services/apiClient';

describe('apiClient', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('createSession with location', () => {
    it('should send location and radius to backend', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionCode: 'AB123',
          hostName: 'Alice',
          restaurantCount: 10,
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
            address: 'SF',
          },
          searchRadiusMiles: 5,
        }),
      });
      global.fetch = mockFetch;

      await apiClient.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194, address: 'SF' },
        5
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Alice',
            location: {
              latitude: 37.7749,
              longitude: -122.4194,
              address: 'SF',
            },
            searchRadiusMiles: 5,
          }),
        })
      );
    });

    it('should handle location without address', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionCode: 'AB123',
          hostName: 'Alice',
          restaurantCount: 5,
          location: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          searchRadiusMiles: 5,
        }),
      });
      global.fetch = mockFetch;

      await apiClient.createSession('Alice', { latitude: 37.7749, longitude: -122.4194 }, 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Alice',
            location: {
              latitude: 37.7749,
              longitude: -122.4194,
            },
            searchRadiusMiles: 5,
          }),
        })
      );
    });

    it('should allow creating session without location (backward compatibility)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionCode: 'AB123',
          hostName: 'Alice',
        }),
      });
      global.fetch = mockFetch;

      await apiClient.createSession('Alice');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            hostName: 'Alice',
          }),
        })
      );
    });

    it('should throw error if no restaurants found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Bad Request',
          code: 'NO_RESTAURANTS_FOUND',
          message: 'No restaurants found in the specified area',
        }),
      });
      global.fetch = mockFetch;

      await expect(
        apiClient.createSession('Alice', { latitude: 37.7749, longitude: -122.4194 }, 5)
      ).rejects.toThrow('No restaurants found in the specified area');
    });

    it('should use fallback error message when create session response has no message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error', code: 'UNKNOWN', message: '' }),
      });

      await expect(apiClient.createSession('Alice')).rejects.toThrow('HTTP error 500');
    });

    it('should use configured API base URL when provided', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1');
      const freshApiClient = await import('../../src/services/apiClient');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await freshApiClient.getSession('AB123');

      expect(fetch).toHaveBeenCalledWith('https://api.example.test/v1/sessions/AB123');
      vi.unstubAllEnvs();
    });
  });

  describe('error normalization', () => {
    it('preserves code, message, and status from a canonical { code, message } body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'SESSION_NOT_FOUND', message: 'Session AB123 not found' }),
      });

      await expect(apiClient.getSession('AB123')).rejects.toMatchObject({
        name: 'ApiClientError',
        code: 'SESSION_NOT_FOUND',
        message: 'Session AB123 not found',
        status: 404,
      });
    });

    it('carries a legacy error-only body value verbatim as the code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'validation_error', message: 'Valid email is required' }),
      });

      await expect(apiClient.sendFriendRequest('nope')).rejects.toMatchObject({
        name: 'ApiClientError',
        code: 'validation_error',
        message: 'Valid email is required',
        status: 400,
      });
    });

    it('falls back to UNKNOWN and an HTTP message for body-less failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      });

      await expect(apiClient.getSession('AB123')).rejects.toMatchObject({
        name: 'ApiClientError',
        code: 'UNKNOWN',
        message: 'HTTP error 502',
        status: 502,
      });
    });
  });

  describe('204 No Content success', () => {
    it('resolves without parsing a body', async () => {
      const json = vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json });

      await expect(apiClient.declineFriendRequest('req-1')).resolves.toBeUndefined();
      expect(json).not.toHaveBeenCalled();
    });
  });

  describe('getVenues', () => {
    it('fetches nearby Venues without authentication', async () => {
      const venues = [
        {
          placeId: 'place-1',
          name: '11 Inch Pizza',
          distanceMiles: 0.2,
          photoUrl: '/api/comparison/photo?name=places%2Fplace-1%2Fphotos%2Fone',
        },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ venues, suburb: 'Melbourne' }),
      });

      await expect(
        apiClient.getVenues({ latitude: -37.81, longitude: 144.96 }, 5)
      ).resolves.toEqual({
        venues: [
          {
            ...venues[0],
            photoUrl:
              'http://localhost:3001/api/comparison/photo?name=places%2Fplace-1%2Fphotos%2Fone',
          },
        ],
        suburb: 'Melbourne',
      });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/comparison/venues?latitude=-37.81&longitude=144.96&radiusMiles=5')
      );
    });
  });

  describe('getRestaurants', () => {
    it('should fetch restaurants for session code', async () => {
      const mockRestaurants = [
        {
          placeId: 'ChIJplace1',
          name: 'Pizza Palace',
          rating: 4.5,
          priceLevel: 2,
          cuisineType: 'Italian',
          address: '123 Main St',
          photoUrl:
            'https://places.googleapis.com/v1/places/place1/photos/one/media?key=old-secret&maxHeightPx=400',
        },
        {
          placeId: 'ChIJplace2',
          name: 'Sushi Spot',
          rating: 4.8,
          priceLevel: 3,
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          restaurants: mockRestaurants,
          sessionCode: 'AB123',
        }),
      });
      global.fetch = mockFetch;

      const result = await apiClient.getRestaurants('AB123');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/options/AB123'));
      expect(result).toEqual([
        {
          ...mockRestaurants[0],
          photoUrl:
            'http://localhost:3001/api/comparison/photo?name=places%2Fplace1%2Fphotos%2Fone',
        },
        mockRestaurants[1],
      ]);
    });

    it('should throw error for invalid session code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Not Found',
          code: 'SESSION_NOT_FOUND',
          message: 'Session AB123 not found',
        }),
      });
      global.fetch = mockFetch;

      await expect(apiClient.getRestaurants('AB123')).rejects.toThrow('Session AB123 not found');
    });

    it('should throw error for session with no restaurants', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Not Found',
          code: 'NO_RESTAURANTS',
          message: 'No restaurants found for this session',
        }),
      });
      global.fetch = mockFetch;

      await expect(apiClient.getRestaurants('AB123')).rejects.toThrow(
        'No restaurants found for this session'
      );
    });

    it('should use fallback error message for restaurant failures without a message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request', code: 'BAD' }),
      });

      await expect(apiClient.getRestaurants('AB123')).rejects.toThrow('HTTP error 400');
    });
  });

  describe('getSession', () => {
    it('should fetch session details', async () => {
      const session = {
        sessionCode: 'AB123',
        hostName: 'Alice',
        participantCount: 2,
        state: 'waiting',
        expiresAt: new Date().toISOString(),
        shareableLink: 'http://localhost:3000/join?code=AB123',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => session,
      });

      await expect(apiClient.getSession('AB123')).resolves.toEqual(session);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/sessions/AB123'));
    });

    it('should use fallback error message for session lookup failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad Request', code: 'BAD' }),
      });

      await expect(apiClient.getSession('AB123')).rejects.toThrow('HTTP error 400');
    });
  });
});
