# Apify actors are the price-comparison data source

The price-comparison feature sources DoorDash and Uber Eats data from Apify marketplace actors, called from the backend behind a single client module. We chose this over licensed aggregators and managed scraper vendors after empirically testing the field (July 2026): MealMe — the only licensed-style aggregator — covers US/Canada only; Nextract's advertised food-delivery endpoints do not exist (the API server 404s them, the app domain serves its login page for every path); managed vendors with real AU coverage either start at $3,000/month (Food Data Scrape) or are sales-gated. Apify actors were the only option validated with real Australian data at hobby cost: Uber Eats address-search returns Melbourne storefronts with full AUD menus and item-level promo tags; DoorDash name/location search and stored-URL modes return full AUD menus plus store lat/lng.

The validated shape has two consequences we accepted rather than fought:

- **Actors never power discovery.** The nearby Venue list comes from the existing Google Places search (already integrated, cheap, platform-neutral); actors run only when the user explicitly requests a Comparison for one Venue. Each platform's Storefront is then resolved by name+location search and verified by geo proximity (~100m); a failed resolution renders as "not found on X", which can be a false negative when names diverge.
- **No fee data in v1.** Delivery and service fees are computed at cart/checkout time with an address attached; no scraper-class source produces them (every vendor claiming otherwise failed verification). v1 compares menu prices and Deals; fees are "confirm at checkout".

## Consequences

- Actors are commodities from individual maintainers: they churn, break, and get delisted. The backend treats the actor IDs as swappable config, and the Snapshot cache (~20-min freshness policy — see ADR 0005) absorbs transient failures.
- Scraping DoorDash's AU site violates their consumer terms even via a vendor. Acceptable at personal/hobby scale; revisit with legal advice before any public launch at scale.
- Cold fetches chain multiple actor runs (seconds, not ms). The cache makes repeat views fast; the first tap on a Venue is slow by design.
- If a licensed aggregator ever covers Australia, this decision should be revisited — the single client module is the seam.
