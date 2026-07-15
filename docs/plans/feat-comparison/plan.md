# Price Comparison feature — v1 plan

Standalone feature (no coupling to Sessions/matching): the user shares their location and radius, sees nearby Venues, taps one, and gets a side-by-side Comparison of its DoorDash and Uber Eats Storefronts. Vocabulary is in `CONTEXT.md` (§ Price comparison); the data-source decision and its constraints are in `docs/adr/0004`; the snapshot-persistence decision is `docs/adr/0005`.

## Decisions (grilled 2026-07-13)

| Question | Decision |
|---|---|
| Data source | Apify actors (see ADR 0004) — validated with real AU data |
| Comparison unit | Per-Venue summary; no cart totals, no ranked list |
| Discovery | Existing Google Places search produces the nearby Venue list (cheap, platform-neutral); actors run only on an explicit per-Venue "Compare" press, resolving each platform by name+location + ~100m geo check (UX grilling 2026-07-13) |
| What's compared | Full menus, Matched Items by normalized name; Deals shown as-is; delivery/service fees out of v1 (unobtainable — ADR 0004) |
| Membership pricing | Ignored; quotes are non-member, footnoted |
| Placement | New route in existing frontend + new Express endpoints; Apify token stays server-side |
| Freshness | ~20-min policy: newest Snapshot younger than that is served as-is; older → fresh fetch appends a new Snapshot. "Fetched N min ago" stamp in UI |
| Access | Guests allowed; per-IP rate limit on comparison endpoints |
| One-platform Venues | Shown with "Only on X" badge, single-column view |
| Persistence | Supabase `comparison_snapshots` — immutable Snapshots double as cache (newest fresh row) and price history (all rows). No Redis for this feature (ADR 0005). Refetches reuse the last Snapshot's storefront URLs, skipping name-resolution actors unless they fail |
| Extensibility | No adapter architecture; the aggregator client module is the seam. HungryPanda (or any platform outside actor coverage) is a future decision, not a scaffold |

## Validated actors (July 2026)

- Uber Eats search + menus: `borderline/uber-eats-scraper-ppr` — address + `addressCountry: AU` + `storeType: RESTAURANTS`; full menus, prices in cents AUD, item-level `promo` strings plus popularity `tags`
- DoorDash search + URL reuse + menus: `abotapi/doordash-scraper` — name/location or stored URL in, metadata + lat/lng + full menu out (`A$` prices)

Actor IDs are config (env or a constants module), not architecture — expect churn.

Real captured payloads from these actors (Melbourne, July 2026) live in `backend/tests/fixtures/comparison/` — moved out of this plan's folder because tests must not depend on an archivable plans dir. Use them as fixtures when building. Provenance (actor + exact input per file) is in the `AGENTS.md` beside them.

### Invoking actors

- `POST https://api.apify.com/v2/acts/<owner>~<actor>/run-sync-get-dataset-items?token=<APIFY_TOKEN>&timeout=280` with a JSON input body. Responses are JSON arrays of items; an `{"error": ...}` **object** instead means auth/input failure — check for it explicitly.
- Observed run times: ~1–3 min for Uber Eats and ~6–8s for DoorDash. HTTP client timeouts ≥300s; run the two platforms in parallel.
- Cost discipline: actor pricing is per start/result. Keep `maxRows`/`maxStores`/`maxItems` minimal (≤5), cap every run at US$0.10 in the shared client, and never call Apify outside `ComparisonService` — one choke point for rate limiting and tests. The US$5/month account cap is fine for dev + personal prod use, not load testing.

### Payload parsing facts (verified against the captured fixtures)

- UE menu: `menu[]` sections → `catalogItems[]`; `price` is an **integer in AUD cents** (the venue-name fixture's Margherita is 2300 = $23.00); deals are per-item `promo` strings while `tags` carries popularity labels; store-level `url` is the outbound link; `currencyCode: "AUD"` confirms market. The captured venue slims to 51 unique items after duplicate UUIDs in promotional sections are merged.
- UE search relevance: even with `storeType: RESTAURANTS`, expect groceries/odd stores in results — the geo+name acceptance check is what filters, not the actor.
- DD (`abotapi`): `latitude`/`longitude` floats and `currency: "AUD"` at Storefront level; `menu.items[]` carries `category`, `name`, and `price` as a **string** `"A$23.00"` — parse to cents. The actor exposes item badges, but v1 still renders the Storefront Deals cell as "—".

## Storefront resolution recipes

**Uber Eats** (validated): `borderline/uber-eats-scraper-ppr` with `query=<venue name>`, `address=<user location>`, `addressCountry: "AU"`, `storeType: "RESTAURANTS"`, small `maxRows` — then accept on ~100m geo proximity + name similarity. Name similarity uses the same dumb normalization as item matching, then a token-subset check (all tokens of the shorter name appear in the longer) — one rule for both steps 0 and 3.

**DoorDash** (validated): `abotapi/doordash-scraper`. In order:

1. Newest Snapshot for the placeId has a DD `storeUrl` → actor `mode: "url"` with that URL and `includeMenu: true`.
2. Otherwise actor `mode: "search"` with `search: [venue.name]`, the Google address as `location`, `storeType: "restaurant"`, `maxStores: 1`, `maxPages: 1`, and `includeMenu: true`; accept only an AUD result passing the same ~100m geo + token-subset name check.
3. No acceptable hit → `status: not_found` for DoorDash; the UX renders that honestly.

## Build order

0. **Validate the DoorDash discovery recipe by hand for ~3 known venues. Complete 2026-07-13:** Google Custom Search was rejected because its [JSON API is closed to new customers](https://developers.google.com/custom-search/v1/overview). The replacement `abotapi/doordash-scraper` resolved 11 Inch Pizza, Stalactites Restaurant, and Universal Restaurant by exact name at 5m, 42m, and 8m from their Google coordinates. Search and stored-URL modes both returned the same 60-item 11 Inch Pizza menu; all raw captures and exact inputs are under `backend/tests/fixtures/comparison/`. UE venue-name and `urls` modes are likewise validated there.
1. Venue list endpoint: reuse `RestaurantSearchService` (Google Places) for nearby Venues — no actors involved
2. Backend `ComparisonService` + Apify client: the compare flow starts with a **server-side Google Place Details lookup by placeId** (name + coords — the client never supplies them, which also gives cold-opened URLs a real venue name immediately) → one actor run per Platform in parallel → ~100m geo verify → insert Snapshot (Supabase migration for `comparison_snapshots` comes first in this step). Shape: `createComparisonService(deps)` with plain function deps — `runActor(actorId, input)`, `fetchPlaceDetails`, `snapshotStore`, plus `freshnessMs`/`settleCapMs` constants — same DI pattern as `createFriendsService(deps)`; tests pass inline fakes
3. Item matching: **v1 normalization is deliberately dumb** — lowercase, strip punctuation, collapse whitespace, exact match on the result; no fuzzy matching until real menus prove the need (unmatched items have a home in the UI by design). Matching is one-to-one so repeated actor rows do not reuse the same item across multiple pairs. "Menu ~X% cheaper" = **median** signed per-item percentage over matched pairs, using each pair's higher price as the denominator so the figure is symmetric whichever Platform wins (median resists one weird outlier item); omit below 3 matches rather than showing noise
4. Express endpoints + transport:
   - `GET /api/comparison/venues` — Google-backed list; ordinary limiter (~30/min/IP)
   - `GET /api/comparison/:placeId/stream` — **Server-Sent Events** (native `EventSource`; ~20 lines of Express, no new dependency; don't reuse Socket.IO — that's session-room machinery). Events: `venue` (name from Place Details, allowing a cold-opened page to label itself immediately), `storefront` (one per platform as its chain settles), `comparison` (final merged result incl. matched items + fetched_at), `error`. Fresh-Snapshot case: emit `venue`, both `storefront` events, then `comparison` immediately from the stored row and close — identical client path for cached and cold. Server writes the Snapshot once when both chains settle, **even if the client disconnects** (the spend already happened — keep the data). Rate limit ~5 cold compares/min/IP; streams served from a fresh Snapshot shouldn't count
   - Chain robustness: settle cap is **per actor run** (~300s, aligned with `timeout=280`). A run exceeding its cap settles that platform as `status: 'failed'`, so the Snapshot always gets written and the skeleton never hangs forever. **Concurrent compares of the same Venue dedupe** through an in-memory in-flight map keyed by placeId — a second subscriber attaches to the running chain's stream instead of spawning new actor runs (AC3's "exactly one Snapshot"; fine on the single Railway instance — multi-instance would need a shared lock, note the ceiling with a `ponytail:` comment). `EventSource` auto-reconnects; on reconnect mid-flight the server re-emits already-settled `storefront` events from the in-flight state
   - `EventSource` lifecycle: `comparison` and `error` are **terminal events — the client must `close()` on receiving either**, or auto-reconnect re-opens the stream after every completed compare (chewing the rate limit, and eventually triggering a real re-compare once the Snapshot goes stale). Auto-reconnect is *only* for mid-flight drops — the terminal-event rule is what lets the two behaviors coexist. Rate-limit rejections must be delivered **as an SSE `error` event on a 200 response**, not an HTTP 429 — `EventSource.onerror` carries no status, so a raw 429 is indistinguishable from a network blip and AC8's friendly message would be unreachable
   - Rate limiters: in-memory per-IP counters — no new dependency, none exists in the repo today
   - **Exit gate**: `backend/scripts/compare-smoke.ts` (see Test strategy) passes against the local backend with real keys — the one paid live checkpoint before any frontend work
5. Frontend: `/compare` route — location/radius (ask once, remember in localStorage) → Venue list with per-card Compare button → Comparison view. One new Zustand store for the feature (location/radius mirrored to localStorage, venue list + scroll restore, per-platform stream state); don't touch `sessionStore`. SSE consumption lives in one wrapper — `services/comparisonStream.ts`, `subscribeToComparison(placeId, handlers) → unsubscribe` — owning the EventSource lifecycle including the terminal-event `close()` from step 4; pages never construct `EventSource` directly (repo convention: IO in `services/`, `vi.mock`ed in page tests)

## UX flow (grilled 2026-07-13)

Entry: standalone `/compare` route via a HomePage quick-action card, plus a `NavigationHeader` link if it fits (an earlier flows doc described a FloatingNav — that component doesn't exist).

1. **Location**: explicit "Use my location" tap + 1–15 mi radius slider (CreateSessionPage pattern), persisted in localStorage — return visits skip straight to the list ("near <suburb> · change"). Geolocation denied → explainer + retry, no manual entry (consistent with rest of app).
2. **Venue list**: powered by the existing Google Places search — cards show name/photo/cuisine/rating/distance and a **Compare** button. No cross-platform claims on cards; actors never run during browsing.
3. **Compare press** → navigate immediately to `/compare/:placeId` (shareable URL). Two Storefront columns render as skeletons with live status per platform, each filling independently as its resolution chain completes. Venues with a Snapshot younger than the 20-min freshness window render instantly.
4. **Comparison view**: summary header (per-platform deals, item counts, "menu ~X% cheaper on matched items", fetched-N-min-ago stamp) above ONE merged list of Matched Item rows — dish name with both prices, cheaper highlighted. Unmatched items in two collapsible "Only on X" sections. Outbound "Open in Uber Eats / DoorDash" links close the loop.
5. **Staleness**: stamp only, no refresh control — the freshness policy decides (with the 2-min exception for failed platforms, see Schema). Edge states distinguish **failed from not-found**: `not_found` → "Not on DoorDash" / both `not_found` → "couldn't find this venue on either delivery app" (definitive); `failed` → "Couldn't reach DoorDash — try again in a couple of minutes" (transient, and the short freshness window means a revisit actually retries). Zero matched items → header + unmatched sections plus a menus-too-different note; one platform → single column + "Only on X" badge.

## Schema (grilled 2026-07-13)

Supabase currently holds only the social graph (`profiles`, `friendships`, `session_invites`) — nothing comparison-shaped. This feature adds exactly one table:

```sql
create table comparison_snapshots (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,          -- Google Places ID (Venue identity, per ADR 0002 convention)
  venue_name text not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null           -- per-platform Storefront captures, see below
);
create index on comparison_snapshots (place_id, fetched_at desc);
alter table comparison_snapshots enable row level security;  -- no policies: service-role only
```

Rules:
- **Immutable**: rows are only ever inserted. Newest row younger than the ~20-min freshness policy = the current Comparison; all rows = price history. No eviction, no updates.
- **Freshness exception for failures**: a Snapshot where any platform has `status: 'failed'` counts as stale after ~2 min instead of 20 — transient actor failures self-heal on the next visit instead of bricking the venue for the full window. Note the heal re-runs the whole compare, UE search included; acceptable at hobby scale. `not_found` is a definitive result, not a failure — it gets the full 20 min.
- **Payload = captures, not conclusions.** Per-platform Storefront captures only: `{ ubereats: { status, storeUrl, deals, menu: [{name, price_cents, section, tags}] }, doordash: { ... } }`. Slimmed from actor output (not raw dumps). Matched Items are computed by a pure function at read time, so matcher improvements retroactively apply to all history.
- One Snapshot per compare-resolution, written once when both platform chains settle; per-platform failure recorded in `status`. In-flight progressive state is in-memory only.
- Refetch of a stale Venue reuses the newest Snapshot's `storeUrl`s, skipping resolution actors unless they 404/fail.
- Retention: keep everything for now; revisit if the table ever matters against the 500MB free tier.
- Migration mechanism: Supabase MCP `apply_migration` against project `hcjuqvicwuszwqkreklc` — that's how this repo manages schema; there is no local migrations directory.

Shared TS types (in `@dinder/shared`): `StorefrontCapture`, `SnapshotPayload`, `Comparison` (the served shape: storefronts + derived `matchedItems`/`unmatched`), mirroring the CONTEXT.md terms.

## Navigation map

| From | To | Via |
|---|---|---|
| HomePage (`/`) | `/compare` | "Compare delivery prices" quick-action card |
| Any page | `/compare` | `NavigationHeader` link |
| `/compare` | `/compare/:placeId` | Compare button (or tapping anywhere on a venue card — one action, bigger target) |
| `/compare` | `/` | NavigationHeader home/back |
| `/compare/:placeId` | `/compare` | Back button — restores the previous list from the store, no Google refetch |
| `/compare/:placeId` | Uber Eats store page | "Open in Uber Eats" button → `url` from the UE payload, new tab; universal-links into the UE app on mobile |
| `/compare/:placeId` | DoorDash store page | "Open in DoorDash" button → store URL from the DD payload, same behavior |
| Anywhere (external) | `/compare/:placeId` | Shareable URL — cold open runs the normal resolution flow; venue name fills immediately from the server-side Place Details lookup, storefront columns stream in |

## Per-screen interactions

**ComparePage (`/compare`)**
- No stored location: explainer + "Use my location" button (browser prompt fires on the tap). Denied → retry explainer, nothing else (matches CreateSessionPage).
- Location known: venue list renders; header chip "near \<suburb\> · change" reopens the location + radius controls. Radius: 1–15 mi slider, persisted with location in localStorage.
- Venue card: photo, name, cuisine, rating, distance, **Compare** button. Whole card is one tap target for Compare. No other card actions.
- List scroll position and results are kept in the store so back-navigation from a comparison doesn't refetch or lose the user's place.

**ComparisonViewPage (`/compare/:placeId`)**
- Header: venue name, per-platform summary cells (deals, item count, "menu ~X% cheaper"), fetched-N-min-ago stamp.
- Each platform cell carries its **Open in \<Platform\>** button once that platform resolves — enabled per-platform, so the user can jump to Uber Eats while DoorDash is still loading. Unresolved/failed platform: cell shows its status ("Searching…" / "Not found on DoorDash") and no button.
- Matched Item rows: dish name + both prices, cheaper highlighted. Rows are display-only in v1 (no per-item outbound deep link — platform store URLs don't anchor to items).
- Bottom: the two "Only on X" collapsible sections, then the outbound buttons repeated as a footer so the payoff is reachable after scrolling a long menu.

## Definition of done (grilled 2026-07-13)

Merged to main · Railway deploy green with `APIFY_TOKEN` set on the backend service · Apify account max-spend cap set · all CI tests green · the live E2E spec has passed · one genuine Compare performed on a phone against prod (own suburb, real Venue, both Platforms resolved, Snapshot row visible in Supabase).

### Acceptance criteria

1. Sharing location+radius renders nearby Venues (name/photo/rating/distance + Compare button) with **zero actor runs during browsing**
2. Compare on a both-platform Venue → Comparison: per-Platform Deals, Matched Item rows with both prices (cheaper highlighted), unmatched "Only on X" sections, outbound store links, fetched-N-min-ago stamp
3. That Compare inserts exactly one Snapshot; re-Compare within the freshness window serves it with **no actor runs and no new row**
4. Stale re-Compare reuses the prior Snapshot's platform store URLs: DoorDash uses validated `mode: "url"` and Uber Eats uses validated `urls` mode instead of new name searches
5. One-Platform Venue → single column + "Only on X" badge
6. Neither Platform resolves → "couldn't find this venue" state
7. Geolocation denied → explainer + retry (no crash, no blank page)
8. Per-IP rate limit on a cold compare → HTTP 200 SSE `error` event with a friendly UI message; fresh-Snapshot streams do not count
9. Cold-opening a shared `/compare/:placeId` URL works end-to-end
10. Everything above works as a guest — no auth anywhere in the flow

### Test strategy (grilled 2026-07-13 — no paid calls in CI)

Sequencing: backend steps 1–4 are built test-first against fixtures and fakes; the smoke script is the single paid live-local checkpoint before any frontend work; the live E2E runs last, pre-merge. "Working locally against real services" is a mid-build gate, not the first act.

- **Backend unit** (vitest, fixtures from `backend/tests/fixtures/comparison/`): full captures are imported only for whole-payload tests (the slimmer ingests the entire real UE capture without throwing, produces 51 unique menu items, and preserves the Margherita price of 2300 cents); matcher, normalization, median, geo-verify, and freshness-boundary semantics use small inline literals — no fixture spelunking to read a failure. Orchestration (ACs 3–6) drives `createComparisonService(deps)` with inline fakes: dedupe (two concurrent compares → one chain's actor runs, one row), settle cap (`settleCapMs: 10` + a never-resolving `runActor` — tiny real timeouts, no fake timers anywhere), snapshot-written-even-if-subscribers-vanish, and fresh/stale/cold paths via `fetched_at` offsets from real `Date.now()` (including the 2-min failed-platform exception).
- **Contract** (supertest, thin): venues endpoint with `global.fetch` mocked like the Google Places tests; the stream endpoint mounted with a fake-deps service — one SSE happy path (the server closes after the terminal event, so the buffered body parses as `data:` lines), the rate-limit-as-SSE-`error` path, and guest access (ACs 1, 8, 10).
- **Frontend unit** (vitest): pages `vi.mock('services/comparisonStream')` — the repo convention; apiClient/socketBindings are mocked the same way — and drive the handlers directly: location gate, list, columns filling independently, badges, error states (ACs 2, 5–7, 9). The wrapper itself gets one focused test over a `FakeEventSource` stub on `globalThis` (jsdom has none), mirroring the existing `FakeSocket`.
- **Live smoke** (`backend/scripts/compare-smoke.ts`, tsx; ~2 actor chains per run): real HTTP+SSE against `BASE_URL` (default localhost:3001) — venues search near a hardcoded Melbourne point → stream a chosen venue → assert both `storefront` events + terminal `comparison` → assert exactly one new Snapshot row (service-role key) → re-run and assert the fresh Snapshot serves with no new row and no actor runs. Pointed at the Railway URL later, it doubles as the prod diagnostic and the DoD phone-test precursor.
- **Live E2E** (Playwright, `tests/e2e/compare-live.spec.ts` inside the existing suite): `test.skip(!process.env.RUN_LIVE_COMPARE, …)` + `test.setTimeout(600_000)` (suite default is 30s); `npm run test:e2e:live` sets the flag and pins the spec. Double-gated against accidental spend — CI runs `home.spec.ts` only, and the guard stops a local full-suite run from burning actor money. One spec, one real Melbourne venue, real Apify + Supabase through the real UI — list → Compare → both Storefronts render → Snapshot row exists.
- **CI**: dummy `APIFY_TOKEN` joins the existing dummy-env block in `ci-cd.yml`; config reads it as an optional string (the `googlePlaces.apiKey` pattern). No network kill-switch — the deps seam means mocked tests never construct real URLs, and the Apify account spend cap is the money backstop.
- Supabase access sits behind an injectable SnapshotStore (`createSessionStore(redis)` pattern); the real store is exercised only by the smoke script and the live E2E. Their rows — and local dev's — land in the prod table by design: real price data either way, single-digit MB at hobby volume, timestamp-filterable if a history UI ever cares.

## Environment & deploy

- `APIFY_TOKEN` has been copied from the repo-root experiment file into ignored `backend/.env`; add it to the Railway backend service before production. `SUPABASE_SERVICE_ROLE_KEY` is already in `backend/.env`.
- DoorDash uses the same `APIFY_TOKEN`; no second provider account or credential is required. Actor IDs remain optional config with validated defaults.
- Railway deploys are watch-pattern-filtered per service (see `DEPLOY_GUIDE.md`) — backend and frontend changes each trigger their own deploy. Set the Railway env var before calling the DoD met.
- **Set the Apify account-level max-spend cap** (console setting, pure config) before prod deploy — it's the real backstop against a shared-link stampede, independent of the app's own rate limiting.

## Out of scope for v1 (decided — don't re-litigate)

No fees, no membership pricing, no HungryPanda, no history UI (data accrues silently), no refresh button, no adapter architecture, no Redis.

## Known risks

- Name+geo resolution from a Google Places Venue to each platform's Storefront is the invented part — false negatives ("not found on X" when it is there under a different name) will happen; shown honestly, and each is one bounded per-Venue lookup, not a list-wide cost
- Actor churn (two actors 404'd during research); mitigated by config-level actor IDs and the cache
- The DoorDash actor is young and community-maintained (no reviews at validation time); fixtures, strict name/geo checks, short failure freshness, and the US$0.10 per-run cap contain that risk
- ToS exposure documented in ADR 0004
