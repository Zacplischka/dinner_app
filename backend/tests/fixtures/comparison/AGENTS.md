# Comparison feature — captured actor payloads

Raw, unedited responses from the validated Apify actors (run 2026-07-13, `run-sync-get-dataset-items` API). Use as fixtures when building `ComparisonService`.

| File | Actor | Input |
|---|---|---|
| `ubereats-search-melbourne.json` | `borderline/uber-eats-scraper-ppr` | `{"address": "Melbourne VIC 3000, Australia", "addressCountry": "AU", "query": "pizza", "storeType": "RESTAURANTS", "maxRows": 5, "locale": "en-AU"}` |
| `ubereats-search-11-inch-pizza.json` | `borderline/uber-eats-scraper-ppr` | `{"address": "Melbourne VIC 3000, Australia", "addressCountry": "AU", "query": "11 Inch Pizza", "storeType": "RESTAURANTS", "maxRows": 1, "locale": "en-AU", "getMenuCustomizations": false}` |
| `ubereats-url-11-inch-pizza.json` | `borderline/uber-eats-scraper-ppr` | `{"urls": ["https://ubereats.com/au/store/11-inch-pizza/BGKvxIwATuWgM-xVHJE2lA"], "locale": "en-AU", "getMenuCustomizations": false}` |
| `doordash-search-11-inch-pizza.json` | `abotapi/doordash-scraper` | `{"mode":"search","search":["11 Inch Pizza"],"location":"Melbourne VIC 3000, Australia","storeType":"restaurant","maxStores":1,"maxPages":1,"includeMenu":true,"includeBusiness":false,"includeReviews":false,"proxy":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"AU"}}` |
| `doordash-search-stalactites.json` | `abotapi/doordash-scraper` | `{"mode":"search","search":["Stalactites Restaurant"],"location":"177/183 Lonsdale St, Melbourne VIC 3000, Australia","storeType":"restaurant","maxStores":1,"maxPages":1,"includeMenu":false,"includeBusiness":false,"includeReviews":false,"proxy":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"AU"}}` |
| `doordash-search-universal-restaurant.json` | `abotapi/doordash-scraper` | `{"mode":"search","search":["Universal Restaurant"],"location":"141 Lygon St, Carlton VIC 3053, Australia","storeType":"restaurant","maxStores":1,"maxPages":1,"includeMenu":false,"includeBusiness":false,"includeReviews":false,"proxy":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"AU"}}` |
| `doordash-url-11-inch-pizza.json` | `abotapi/doordash-scraper` | `{"mode":"url","urls":["https://www.doordash.com/store/30221303/"],"includeMenu":true,"includeBusiness":false,"includeReviews":false,"proxy":{"useApifyProxy":true,"apifyProxyGroups":["RESIDENTIAL"],"apifyProxyCountry":"AU"}}` |
| `doordash-menu-melbourne-pizza-factory.json` | `crawlerbros/doordash-restaurant-scraper` | `{"storeUrls": ["https://www.doordash.com/store/melbourne-pizza-factory-melbourne-843606/"], "maxItems": 1}` |
| `doordash-details-melbourne-pizza-factory.json` | `tri_angle/doordash-store-details-scraper` | `{"startUrls": [{"url": "https://www.doordash.com/store/melbourne-pizza-factory-melbourne-843606/"}]}` |

DoorDash discovery cross-check:

| Venue | Google Place / coords | DoorDash Store / coords | Distance |
|---|---|---|---:|
| 11 Inch Pizza | `ChIJqTG_7bRC1moR7Dykdhg81HA` · `-37.8157253, 144.9631023` | `30221303` · `-37.815756, 144.963146` | 5m |
| Stalactites Restaurant | `ChIJn2OLfMlC1moRMo8rw0Az54c` · `-37.8110808, 144.9670491` | `924955` · `-37.810735, 144.966847` | 42m |
| Universal Restaurant | `ChIJa2v1BNJC1moR_XGbXwcSoAg` · `-37.8038454, 144.9661208` | `968993` · `-37.803856, 144.96603` | 8m |

Notes:
- Uber Eats menu item prices are integers in **AUD cents** (the venue-name fixture's Margherita is `2300` = $23.00); DoorDash menu prices are strings (`"A$23.00"`).
- Uber Eats `urls` mode works for the captured Australian Storefront and returns the same Venue, coordinates, URL, and 10 menu sections as the venue-name search. Stale re-Compares can therefore reuse the stored Uber Eats URL.
- Uber Eats promotions are in each item's `promo` field; `tags` contains popularity labels. The slim capture merges both into item tags and deduplicates `promo` values into Storefront deals.
- The venue-name fixture contains 51 unique menu items after duplicate UUIDs from `Featured items` and `Offers` are merged into their canonical sections.
- The replacement DoorDash actor resolved all three Google-confirmed Venues by exact name and within the plan's 100m bound: 11 Inch Pizza (5m), Stalactites Restaurant (42m), and Universal Restaurant (8m). Each discovery run cost US$0.082 under a US$0.10 run cap.
- Its 11 Inch Pizza search and URL modes both returned the same Storefront and 60-item AUD menu; Margherita is `"A$23.00"`. One actor now covers both cold discovery and stale stored-URL reuse.
- Melbourne Pizza Factory was deliberately excluded from the three-Venue pass: DoorDash resolves that name, but current Google Places identifies 271 King St as House Of Kebabs, so the cross-provider name gate rejects it.
- The DoorDash menu fixture contains 59 rows. Preserve them all: repeated names include both promotional duplicates and genuinely different prices (for example, Combo Deals across traditional and gourmet sections), and the payload exposes no stable item ID.
- The older Melbourne Pizza Factory details/menu fixtures document the superseded two-actor recipe. Google Custom Search was rejected because its JSON API is closed to new customers and scheduled for discontinuation on 2027-01-01.
- Gotcha: the `alizarin_refrigerator-owner/doordash-scraper` actor's search mode silently returns fake data when `demoMode` is unset and 0 results with it off — that's why it was rejected (see ADR 0004 / plan.md).
