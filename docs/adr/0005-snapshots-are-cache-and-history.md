# Snapshots are cache and history

Price-comparison data lives in one Supabase table, `comparison_snapshots`, as immutable inserts — not in Redis, despite Redis being right there caching sessions. The newest Snapshot younger than the freshness policy (~20 min) is served as the current Comparison; the full set of a Venue's Snapshots is its price history. We chose this because the two things we want — not wasting paid Apify actor runs, and keeping price history — are both answered by "check for a fresh Snapshot before fetching", and Redis's only additions (sub-ms reads, automatic eviction) are respectively imperceptible next to minute-long actor runs and actively harmful (evicting a Snapshot deletes history).

Payloads store per-platform Storefront captures, never computed comparisons: Matched Items are derived at read time by a pure function, so matcher improvements retroactively apply to all stored history. Snapshots also carry resolved store URLs, letting stale refetches skip the name-resolution actors — a Venue pays that cost roughly once, ever.

## Consequences

- Rows are insert-only. Anything that updates or deletes a Snapshot is a bug; schema changes must be additive or re-derivable from payloads.
- Freshness is a query-time policy, not a storage property — changing the TTL is a one-line constant, and history is unaffected.
- Storage grows forever by design; revisit retention only if the free tier ever objects.
- If comparison read traffic ever becomes hot enough that Postgres reads matter, add Redis *in front of* Snapshots — never instead of them.
