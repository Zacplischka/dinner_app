// Load .env with Node's own loader: no override of what is already set, and
// no file is not an error — the environment is the configuration.
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

export const config = {
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  // The Owned Recipe corpus on disk (ADR 0011): `<dir>/<frozen-slug>/recipe.json`,
  // one level under the package root from `src/` and from `dist/` alike, so the
  // built server and `tsx` read the same directory. Overridable so a test can
  // point the app at a fixed fixture corpus rather than assert against whatever
  // the shipped batch holds this week (#338) — an absolute path wins outright,
  // a relative one resolves from here.
  ownedRecipesDir: new URL(
    // The trailing slash is what makes `<dir>/<slug>/recipe.json` resolve, so
    // it is added rather than demanded of whoever sets the variable.
    process.env.OWNED_RECIPES_DIR?.replace(/\/?$/, '/') ?? '../../recipes/',
    import.meta.url
  ),
  // The Movie corpus on disk (ADR 0014): one JSON file beside the recipes,
  // resolved the same way so `src/` and `dist/` read the same file and a test
  // can point the app at a fixture instead of the batch that ships.
  moviesFile: new URL(process.env.MOVIES_FILE ?? '../../movies/movies.json', import.meta.url),
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
    // Attribution follows the tier (#288): on paid tiers the obligation is to
    // credit the ORIGINATING recipe site — name + backlink, which is what the
    // cook view's credit line does. A backlink to Spoonacular itself is a
    // Free-tier-only condition; downgrade this key to Free and that
    // obligation returns, and nothing else in the code would catch it.
    apiKey: process.env.SPOONACULAR_API_KEY,
    // The recipe supply (#232): a shared per-Craving pool dealt as per-Session
    // Decks. The TTL is config precisely so it can be cut to the compliant 1 h
    // with a redeploy if Spoonacular objects to cross-user caching (#237).
    poolTtlMs: parseInt(process.env.RECIPE_POOL_TTL_MS || `${24 * 3_600_000}`, 10),
    // A Craving that matches nothing is a fact about the catalogue, not about
    // Dinder, so it caches too — but briefly (#260). Long enough that a Host
    // fiddling with chips costs one lookup, short enough that a Craving the
    // source learns about tonight is swipeable within the hour.
    emptyPoolTtlMs: parseInt(process.env.RECIPE_EMPTY_POOL_TTL_MS || `${3_600_000}`, 10),
    poolSize: parseInt(process.env.RECIPE_POOL_SIZE || '60', 10),
    deckSize: parseInt(process.env.RECIPE_DECK_SIZE || '15', 10),
    // The daily-points ceiling the guard fails closed at (#261). Spoonacular's
    // Cook tier includes 1,500 points a day and its console has no spend cap:
    // past that it keeps answering and bills $0.005/pt silently. The default
    // stops short of the included quota, and the gap absorbs the in-flight
    // calls whose points only land on the counter once they answer.
    dailyPointCeiling: parseInt(process.env.SPOONACULAR_DAILY_POINT_CEILING || '1400', 10),
    // The deal-time budget on a vendor fetch (#333). A slow source is a source
    // failure for that deal: past this the deal gives up on it and deals owned
    // alone, so a hanging Spoonacular can never hold a Host at setup.
    dealBudgetMs: parseInt(process.env.RECIPE_DEAL_BUDGET_MS || '2500', 10),
  },
  // The global paid-API budget (#502): calls a day per paid SKU, app-wide,
  // each the vendor's quota less headroom for calls that never pass through
  // it (local runs, e2e and verify-live share the Places key).
  paidBudget: {
    // Text Search is quota-capped at 100 a day (GCP mypickle-486702); 20 spare.
    placesTextSearch: parseInt(process.env.PLACES_TEXT_SEARCH_DAILY_CEILING || '80', 10),
    // Place Photo media is quota-capped at 200 a day; 20 spare.
    placePhoto: parseInt(process.env.PLACE_PHOTO_DAILY_CEILING || '180', 10),
    // No vendor quota: ~1,200 cold Woolworths lookups at ~12 lines a list keeps one politeness queue ours.
    shoppingListMint: parseInt(process.env.SHOPPING_LIST_MINT_DAILY_CEILING || '100', 10),
    // Apify's free plan stops at $5 a month; a cold Comparison is at most ~$0.06, so a day drains an eighth.
    coldComparison: parseInt(process.env.COLD_COMPARISON_DAILY_CEILING || '10', 10),
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
