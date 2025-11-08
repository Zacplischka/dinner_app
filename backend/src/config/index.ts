import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
    apiUrl: process.env.GOOGLE_PLACES_API_URL || 'https://places.googleapis.com/v1/places:searchNearby',
  },
};

// Validate required environment variables
export function validateConfig(): void {
  if (!config.googlePlaces.apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY environment variable is required');
  }

  if (!config.googlePlaces.apiUrl) {
    throw new Error('GOOGLE_PLACES_API_URL environment variable is required');
  }
}
