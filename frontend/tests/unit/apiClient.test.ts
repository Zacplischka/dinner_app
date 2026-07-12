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
          sessionCode: 'ABC123',
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
          sessionCode: 'ABC123',
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

      await apiClient.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
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
          sessionCode: 'ABC123',
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
        apiClient.createSession(
          'Alice',
          { latitude: 37.7749, longitude: -122.4194 },
          5
        )
      ).rejects.toThrow('No restaurants found in the specified area');
    });

    it('should use fallback error message when create session response has no message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error', code: 'UNKNOWN', message: '' }),
      });

      await expect(apiClient.createSession('Alice')).rejects.toThrow('Failed to create session');
    });

    it('should use configured API base URL when provided', async () => {
      vi.resetModules();
      vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/v1');
      const freshApiClient = await import('../../src/services/apiClient');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await freshApiClient.getSession('ABC123');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.example.test/v1/sessions/ABC123',
        expect.objectContaining({ method: 'GET' })
      );
      vi.unstubAllEnvs();
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
          sessionCode: 'ABC123',
        }),
      });
      global.fetch = mockFetch;

      const result = await apiClient.getRestaurants('ABC123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/options/ABC123'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockRestaurants);
    });

    it('should throw error for invalid session code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: 'Not Found',
          code: 'SESSION_NOT_FOUND',
          message: 'Session ABC123 not found',
        }),
      });
      global.fetch = mockFetch;

      await expect(apiClient.getRestaurants('ABC123')).rejects.toThrow(
        'Session ABC123 not found'
      );
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

      await expect(apiClient.getRestaurants('ABC123')).rejects.toThrow(
        'No restaurants found for this session'
      );
    });

    it('should use fallback error message for restaurant failures without a message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Bad Request', code: 'BAD' }),
      });

      await expect(apiClient.getRestaurants('ABC123')).rejects.toThrow('Failed to fetch restaurants');
    });
  });

  describe('getSession', () => {
    it('should fetch session details', async () => {
      const session = {
        sessionCode: 'ABC123',
        hostName: 'Alice',
        participantCount: 2,
        state: 'waiting',
        expiresAt: new Date().toISOString(),
        shareableLink: 'http://localhost:3000/join?code=ABC123',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => session,
      });

      await expect(apiClient.getSession('ABC123')).resolves.toEqual(session);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sessions/ABC123'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should use fallback error message for session lookup failures', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Bad Request', code: 'BAD' }),
      });

      await expect(apiClient.getSession('ABC123')).rejects.toThrow('Failed to get session');
    });
  });


  describe('handleApiError', () => {
    it('should return Error messages and a generic fallback for unknown values', () => {
      expect(apiClient.handleApiError(new Error('Readable'))).toBe('Readable');
      expect(apiClient.handleApiError('bad')).toBe('An unexpected error occurred');
    });
  });
});
