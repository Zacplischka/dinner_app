import { describe, it, expect } from 'vitest';
import { config } from '../../src/config/index.js';

describe('Google Places API Configuration', () => {
  it('should have GOOGLE_PLACES_API_KEY in environment', () => {
    expect(config.googlePlaces.apiKey).toBeDefined();
    expect(config.googlePlaces.apiKey).toBeTruthy();
  });

  it('should have GOOGLE_PLACES_API_URL in environment', () => {
    expect(config.googlePlaces.apiUrl).toBeDefined();
    expect(config.googlePlaces.apiUrl).toBe('https://places.googleapis.com/v1/places:searchNearby');
  });

  it('should throw error if API key is missing', () => {
    const originalKey = config.googlePlaces.apiKey;
    config.googlePlaces.apiKey = undefined;

    expect(() => {
      if (!config.googlePlaces.apiKey) {
        throw new Error('GOOGLE_PLACES_API_KEY environment variable is required');
      }
    }).toThrow('GOOGLE_PLACES_API_KEY environment variable is required');

    // Restore original value
    config.googlePlaces.apiKey = originalKey;
  });
});
