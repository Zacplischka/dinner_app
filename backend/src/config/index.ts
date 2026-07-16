import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const config = {
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
  },
  apify: {
    token: process.env.APIFY_TOKEN,
    uberEatsActorId: process.env.APIFY_UBER_EATS_ACTOR_ID || 'borderline/uber-eats-scraper-ppr',
    doorDashActorId: process.env.APIFY_DOORDASH_ACTOR_ID || 'abotapi/doordash-scraper',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

/** Canonical join link for a session, built on the configured frontend URL. */
export function shareableLink(sessionCode: string): string {
  return `${config.frontendUrl}/join?code=${sessionCode}`;
}
