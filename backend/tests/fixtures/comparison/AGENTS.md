# Comparison feature — captured actor payloads

Raw, unedited responses from the validated Apify actors (run 2026-07-13, `run-sync-get-dataset-items` API). Use as fixtures when building `ComparisonService`.

| File | Actor | Input |
|---|---|---|
| `ubereats-search-melbourne.json` | `borderline/uber-eats-scraper-ppr` | `{"address": "Melbourne VIC 3000, Australia", "addressCountry": "AU", "query": "pizza", "storeType": "RESTAURANTS", "maxRows": 5, "locale": "en-AU"}` |
| `doordash-menu-melbourne-pizza-factory.json` | `crawlerbros/doordash-restaurant-scraper` | `{"storeUrls": ["https://www.doordash.com/store/melbourne-pizza-factory-melbourne-843606/"], "maxItems": 1}` |
| `doordash-details-melbourne-pizza-factory.json` | `tri_angle/doordash-store-details-scraper` | `{"startUrls": [{"url": "https://www.doordash.com/store/melbourne-pizza-factory-melbourne-843606/"}]}` |

Notes:
- Uber Eats menu item prices are integers in **AUD cents** (`785` = $7.85); DoorDash menu prices are strings (`"A$23.00"`).
- Item-level deals appear only in the Uber Eats payload, as `tags` (e.g. `"30% off"`).
- Gotcha: the `alizarin_refrigerator-owner/doordash-scraper` actor's search mode silently returns fake data when `demoMode` is unset and 0 results with it off — that's why it was rejected (see ADR 0004 / plan.md).
