# Comparison feature — captured actor payloads

Responses from the validated Apify actors (run 2026-07-13, `run-sync-get-dataset-items` API),
trimmed to the fields the Storefront Resolvers read. Values are unedited; keys the Resolvers
ignore were dropped so a capture refresh is reviewable.

| File | Actor | Input |
|---|---|---|
| `ubereats-search-11-inch-pizza.json` | `borderline/uber-eats-scraper-ppr` | `{"address": "Melbourne VIC 3000, Australia", "addressCountry": "AU", "query": "11 Inch Pizza", "storeType": "RESTAURANTS", "maxRows": 1, "locale": "en-AU", "getMenuCustomizations": false}` |
| `doordash-search-11-inch-pizza.json` | `abotapi/doordash-scraper` | `{"mode":"search","search":["11 Inch Pizza"],"location":"Melbourne VIC 3000, Australia","storeType":"restaurant","maxStores":1,"maxPages":1,"includeMenu":true,"includeBusiness":false,"includeReviews":false,"proxy":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"AU"}}` |

Refreshing a capture: re-run the actor with the input above, then keep only the keys its Resolver
reads — `uberEatsStorefront.resolve` and `doorDashStorefront.resolve` in `backend/src/services/`
are the authority, including the fields they only check for absence. Don't restate the list here;
it drifts.

Notes:
- Uber Eats menu item prices are integers in **AUD cents** (Margherita is `2300` = $23.00);
  DoorDash menu prices are strings (`"A$23.00"`).
- Uber Eats promotions are in each item's `promo` field; `tags` contains popularity labels. The
  Resolver merges both into item tags and deduplicates `promo` values into Storefront deals.
- The Uber Eats fixture yields 51 unique menu items after duplicate UUIDs from `Featured items`
  and `Offers` are merged into their canonical sections. The DoorDash fixture's 60 rows yield 48
  after `Most Ordered` duplicates are merged.
- Every row in the DoorDash fixture carries an `id`, so the name+price fallback in
  `doorDashStorefront.ts` is not exercised by it. A capture that omits ids would be new evidence.
- Uber Eats `urls` mode returns the same Venue, coordinates, URL, and 10 menu sections as the
  venue-name search, so stale re-Compares can reuse the stored URL. `abotapi/doordash-scraper`
  behaves the same way across its search and URL modes. Both were confirmed by captures that are
  no longer kept here; see git history before 2026-07-26 if you need the raw evidence.

Actor selection (evidence for ADR 0004):

| Venue | Google Place / coords | DoorDash Store / coords | Distance |
|---|---|---|---:|
| 11 Inch Pizza | `ChIJqTG_7bRC1moR7Dykdhg81HA` · `-37.8157253, 144.9631023` | `30221303` · `-37.815756, 144.963146` | 5m |
| Stalactites Restaurant | `ChIJn2OLfMlC1moRMo8rw0Az54c` · `-37.8110808, 144.9670491` | `924955` · `-37.810735, 144.966847` | 42m |
| Universal Restaurant | `ChIJa2v1BNJC1moR_XGbXwcSoAg` · `-37.8038454, 144.9661208` | `968993` · `-37.803856, 144.96603` | 8m |

- `abotapi/doordash-scraper` resolved all three Google-confirmed Venues by exact name and inside
  the 100m bound, at US$0.082 per discovery run under a US$0.10 cap.
- Melbourne Pizza Factory was deliberately excluded from that pass: DoorDash resolves the name,
  but current Google Places identifies 271 King St as House Of Kebabs, so the cross-provider name
  gate rejects it. The superseded two-actor recipe (`crawlerbros/doordash-restaurant-scraper` plus
  `tri_angle/doordash-store-details-scraper`) was captured against that venue.
- Google Custom Search was rejected for discovery: its JSON API is closed to new customers and is
  scheduled for discontinuation on 2027-01-01.
- Gotcha: the `alizarin_refrigerator-owner/doordash-scraper` actor's search mode silently returns
  fake data when `demoMode` is unset and 0 results with it off — that's why it was rejected.
