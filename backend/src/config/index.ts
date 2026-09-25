import { logger } from '../logger.js';

// Load .env with Node's own loader: no override of what is already set, and
// no file is not an error — the environment is the configuration.
try {
  process.loadEnvFile();
} catch {
  // No .env file.
}

/**
 * A paid-budget ceiling (#502). Anything but a count would switch its guard off
 * silently (`spent > NaN` is never true), so it falls back to the default, loudly.
 */
function budgetCeiling(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const ceiling = Number(raw);
  if (Number.isFinite(ceiling) && ceiling >= 0) return ceiling;
  logger.error(
    { variable: name, value: raw, fallback },
    'Paid-budget ceiling is not a count; using the default'
  );
  return fallback;
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
    uberEatsActorId: 'borderline/uber-eats-scraper-ppr',
    doorDashActorId: 'abotapi/doordash-scraper',
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
    // Decks. Cut the TTL to the compliant 1 h if Spoonacular objects to
    // cross-user caching (#237).
    poolTtlMs: 24 * 3_600_000,
    // A Craving that matches nothing is a fact about the catalogue, not about
    // the app, so it caches too — but briefly (#260). Long enough that a Host
    // fiddling with chips costs one lookup, short enough that a Craving the
    // source learns about tonight is swipeable within the hour.
    emptyPoolTtlMs: 3_600_000,
    poolSize: 60,
    deckSize: 15,
    // The daily-points ceiling the guard fails closed at (#261). Spoonacular's
    // Cook tier includes 1,500 points a day and its console has no spend cap:
    // past that it keeps answering and bills $0.005/pt silently. The default
    // stops short of the included quota, and the gap absorbs the in-flight
    // calls whose points only land on the counter once they answer.
    dailyPointCeiling: 1400,
    // The deal-time budget on a vendor fetch (#333). A slow source is a source
    // failure for that deal: past this the deal gives up on it and deals owned
    // alone, so a hanging Spoonacular can never hold a Host at setup.
    dealBudgetMs: 2500,
  },
  // The global paid-API budget (#502): calls per quota period per paid SKU,
  // app-wide, each kept under the vendor's quota or bill with headroom for
  // calls that never pass through it (local runs, e2e and verify-live share
  // the Places key).
  paidBudget: {
    // The only cap: Google's Text Search quota is its 75,000-a-day default (no override on
    // mypickle-486702). 30 a day is ~930 a month, inside the 1,000 free Enterprise calls with room
    // for local, e2e and verify-live runs on the same key; past that it bills toward the A$10
    // kill switch, which detaches billing and takes search and photos down together.
    placesTextSearch: budgetCeiling('PLACES_TEXT_SEARCH_DAILY_CEILING', 30),
    // Place Photo media is quota-capped at 200 a day; 20 spare.
    placePhoto: budgetCeiling('PLACE_PHOTO_DAILY_CEILING', 180),
    // No vendor quota: ~1,200 cold Woolworths lookups at ~12 lines a list keeps one politeness queue ours.
    shoppingListMint: budgetCeiling('SHOPPING_LIST_MINT_DAILY_CEILING', 100),
    // A month, not a day: Apify's free plan stops at $5 a month, ~83 cold Comparisons at ~$0.06; the
    // rest is headroom for the extra actor runs a stale stored store URL costs.
    coldComparison: budgetCeiling('COLD_COMPARISON_MONTHLY_CEILING', 60),
  },
  woolworths: {
    // The store Woolworths serves to production's egress (1101 Mayfield NSW,
    // ADR 0010); the cache self-heals onto whatever store responses name.
    defaultStoreId: 1101,
    // Price-cache Freshness Windows (#253 story 44): success min(cap,
    // Wednesday 6 am AEST rollover); a failure retries after ~1 h.
    successWindowCapMs: 24 * 3_600_000,
    failureWindowMs: 3_600_000,
  },
};

/** Canonical join link for a session, built on the configured frontend URL. */
export function shareableLink(sessionCode: string): string {
  return `${config.frontendUrl}/join?code=${sessionCode}`;
}
