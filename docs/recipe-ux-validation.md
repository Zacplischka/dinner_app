# Recipe UX validation — epic #434

Recorded 2026-09-07. Covers #446–#449.

## Recipe details (#446)

The dealt Recipe now carries available cuisine, description, cooking time, ingredient text, servings and source credit. Spoonacular summary markup is converted to display text; the method is untouched. Source diet labels are validated against Dinder's vocabulary. Owned Recipes provide their validated cuisine and ingredient text; the 50 current Owned records contain no authored description or total-time field, so those details explicitly say unavailable. No times are inferred by adding instruction durations and no descriptions are invented.

Sourced, Owned and older Recipe payloads pass the existing actual Details-sheet interaction tests, including dismissal, focus return and no accidental Selection. The shared source-credit component retains Spoonacular's fallback and omits credit only for Owned content (ADR 0012). Opening details never prices a Recipe.

## Reading during pricing (#447)

The chosen Recipe and scaled Ingredient Lines are snapshotted before pricing starts, on the Shopping List's seven-day clock. `GET /api/lists/:id?includePending=true` returns them immediately. Legacy requests keep waiting for the finished price record. A separate snapshot key keeps the stored contract compatible with old backend readers during a rolling deployment.

New clients display `Prices are still loading` and no total while pending. The method can be opened from the list or read at its own Cook View URL. Cook View polls until pricing settles; it does not remount its steps on completion. Stable line ids and the existing separate Claims hash preserve Claims when the finished price record replaces the pending view. Reads never start pricing.

If the worker fails or its two-minute marker expires, the Recipe stays available with `Prices are unavailable`. Ingredient links let the Shopper check Woolworths directly. The same Recipe keeps the same list id; there is no automatic second mint or retry spend. A late successful completion remains readable from that URL. The final price record uses only the remaining lifetime from the original snapshot time. Session expiry does not affect this work.

Focused checks cover delayed success, reopening on a second service instance, duplicate reads, Session expiry while pricing, timeout, failed persistence, one mint, Claims during pricing, and the normal frozen-price/claim/swap paths. The public HTTP check verifies opt-in and legacy reads. UI checks verify pending/failed access without a final total and Cook polling stopping on completion.

### Latency evidence

A bounded real local run used the committed `owned:penne-arrabbiata` Recipe: six Ingredient Lines, five non-Staples. It ran through the real ProductMatchService, shared local Redis price cache, default 500 ms politeness queue and quantity ladder. Local Redis had no Sessions before the run. No cache was cleared to manufacture a miss; all five product terms were cold. Each HTTP request was bounded at ten seconds, and the probe would stop on its first provider failure.

| Real local boundary (store 3221) | Recipe readable | Full list readable |    Woolworths HTTP requests |
| -------------------------------- | --------------: | -----------------: | --------------------------: |
| Cold                             |        53.29 ms |        3,275.06 ms | 6 (one seed, five searches) |
| Warm                             |         2.13 ms |           31.28 ms |                           0 |

Two extra reads after each completion added zero requests. Both lists contained four Priced lines, one Unpriced Matched garlic line, and the olive-oil Staple. The quantity ladder's Spoonacular client explicitly refused calls, so the one conversion needed in each run degraded normally rather than spending source points. This limitation affects garlic's tally, not the observed Woolworths/cache wait. Probe-only list keys were deleted afterward; shared price-cache entries retain their normal lifetime.

These are **real local egress measurements at store 3221, not current Railway/store-1101 measurements**. ADR 0010 records why the store follows egress. The difference between cold and warm confirms that provider searches and their politeness queue dominate this small Recipe's wait; the chosen Recipe is now readable before that work finishes. No change to provider rate limits or caching is justified by these results.

A separate local measurement at the ShoppingListService boundary used twelve different non-Staple ingredients and an injected Matcher, with no external provider calls. Cold lookups each took a simulated 500 ms; the warm boundary returned immediately. Both runs used the actual snapshot, pricing loop and read code. Two extra reads after completion left the Matcher count unchanged at twelve.

| Boundary                          | Recipe readable | Full list readable |
| --------------------------------- | --------------: | -----------------: |
| Simulated cold, 12 × 500 ms       |         2.35 ms |        6,010.02 ms |
| Simulated warm, immediate Matcher |         0.53 ms |            1.47 ms |

These are local scheduling measurements with injected latency, **not current Woolworths/network measurements**. They demonstrate that access to the Recipe is no longer coupled to the price wait. ADR 0010's earlier production measurement reports roughly 7–9 seconds for a cold twelve-line list. The existing shared cache and global 500 ms politeness floor remain unchanged; removing that floor would violate the provider budget. No Spoonacular/corpus budget was spent; the real local run used the six Woolworths requests recorded above. New completion logs include actual `pricingMs` so deployment measurements can use ordinary Shopping List traffic.

## Reported instruction spacing/order (#448)

**Unconfirmed; no speculative text correction.** Inspected all 50 committed Owned Recipe records (391 steps), the sourced fetch-boundary fixtures, the Recipe pool mapping, ShoppingListService snapshot and Cook View renderer. A bounded scan for a lower-case letter followed by a full stop and upper-case letter without whitespace found no example in the Owned methods. This heuristic does not prove every instruction is correct. The local Redis instance had zero `recipes:pool:*` keys, so there was no cached real sourced payload to examine.

Spoonacular analyzed instructions are retained in source order, pooled, snapshotted and rendered as separate numbered steps. That path does not remove sentence spaces or reorder steps. The new description-only HTML conversion never touches these steps. Existing tap-to-dim and source credit remain intact. A regression check preserves sample decimals, an abbreviation and a temperature through the source boundary.

To resolve the actual report, retain the affected Recipe `placeId`/source URL or Shopping List URL, a screenshot or exact problematic instruction text, and the source payload (or Owned Fact Record) for the disputed order. Without that evidence, changing punctuation or step order could change valid quantities or culinary meaning.

## Reported Armenian stew image (#449)

**Unconfirmed; no arbitrary image replacement.** Searched the repository's committed Recipe records, fixtures and references for Armenian/stew identity; none of the 50 Owned titles matches either term. The local Redis instance had no sourced pools. A public search scoped to Spoonacular for Armenian stew returned no result. The reported Recipe and image therefore could not be identified or inspected in a rendered card.

The current mapping carries each Recipe's own `photoUrl` directly to its Deck Entry; the shared photo component retains its fallback/retry behavior. This does not establish whether the report was a wrong image, an unfortunate crop, or subjective source-image quality. Keep the original image and all ownership/source metadata until the exact Recipe `placeId`, image/source URL, or a screenshot identifying the card is available. No corpus assets, licensed source images or image-generation gates were changed.
