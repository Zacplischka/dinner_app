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
  supabase: {
    url: process.env.SUPABASE_URL || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

/** Canonical join link for a session, built on the configured frontend URL. */
export function shareableLink(sessionCode: string): string {
  return `${config.frontendUrl}/join?code=${sessionCode}`;
}

