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
  spoonacular: {
    apiKey: process.env.SPOONACULAR_API_KEY,
    // The recipe supply (#232): a shared per-Craving pool dealt as per-Session
    // Decks. The TTL is config precisely so it can be cut to the compliant 1 h
    // with a redeploy if Spoonacular objects to cross-user caching (#237).
    poolTtlMs: parseInt(process.env.RECIPE_POOL_TTL_MS || `${24 * 3_600_000}`, 10),
    poolSize: parseInt(process.env.RECIPE_POOL_SIZE || '60', 10),
    deckSize: parseInt(process.env.RECIPE_DECK_SIZE || '15', 10),
  },
  woolworths: {
    // The store Woolworths serves to production's egress (1101 Mayfield NSW,
    // ADR 0010); the cache self-heals onto whatever store responses name.
    defaultStoreId: parseInt(process.env.WOOLWORTHS_STORE_ID || '1101', 10),
    // Price-cache Freshness Windows (#253 story 44): success min(cap,
    // Wednesday 6 am AEST rollover); a failure retries after ~1 h.
    successWindowCapMs: parseInt(process.env.WOOLWORTHS_PRICE_WINDOW_MS || `${24 * 3_600_000}`, 10),
    failureWindowMs: parseInt(process.env.WOOLWORTHS_PRICE_FAILURE_WINDOW_MS || `${3_600_000}`, 10),
  },
};

/** Canonical join link for a session, built on the configured frontend URL. */
export function shareableLink(sessionCode: string): string {
  return `${config.frontendUrl}/join?code=${sessionCode}`;
}
