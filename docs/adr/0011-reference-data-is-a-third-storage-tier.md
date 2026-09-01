# Reference data is a third storage tier

ADR 0001 drew a strict two-sided boundary: ephemeral session state in Redis, the social graph in Supabase. The owned recipe corpus fits neither side — it is durable, versioned reference data that ships with the code. Rather than amending 0001, whose boundary stays strict for its two kinds, this record names the third kind, following the precedent ADR 0010 set over ADR 0004. Settled in [#320](https://github.com/Zacplischka/dinner_app/issues/320) on map [#310](https://github.com/Zacplischka/dinner_app/issues/310).

**The tier.** Reference data is committed to the repository as reviewed data assets, versioned with the code, shipped with the deploy, and read at runtime through an interface — in memory, no network hop, no schema, no migrations, no RLS. Changes move through code review and arrive by redeploy; a bad batch is one revert from gone.

**What belongs here:**

- The **Owned Recipe Store** (~1,160 records at target) behind its store interface — images excepted: they live in object storage (Cloudflare R2, [#313](https://github.com/Zacplischka/dinner_app/issues/313)), referenced by URL.
- `usToAuTerms.ts` — the tier's precedent member ([#243](https://github.com/Zacplischka/dinner_app/issues/243)).
- The hardcoded **Staples** set.
- The cuisine groupings the **Nearest Craving** ladder walks ([#317](https://github.com/Zacplischka/dinner_app/issues/317)).

**What does not:**

- Anything a Session writes — Redis (ADR 0001).
- The social graph, Profiles, anything user-generated — Supabase (ADR 0001, ADR 0008).
- Anything needing edit-without-a-deploy. That need arising for real is the trigger to promote the asset behind its interface to Postgres — a swap, not a rewrite.

**Why Supabase was rejected despite being provisioned**, and despite ADR 0008 already owning schema through migrations: ~1,160 rows filtered in memory need no schema, no migrations, no RLS, and no network hop on a cold pool fill — and a human-reviewed corpus moving through code review means changes get diffed, not silently `UPDATE`d in a live table.

**Identity inside the tier** ([#314](https://github.com/Zacplischka/dinner_app/issues/314)): an Owned Recipe's `placeId` is `owned:<frozen-slug>` — authored once, committed with the record, never re-derived from the title. Owned Recipes never age out, so a slug regenerated from a retitled dish would silently break Shopping Lists minted months earlier. Readable-in-a-diff beat an opaque ULID because the storage *is* a repo file precisely so changes get reviewed.

**A known asymmetry, deliberately not load-bearing** ([#316](https://github.com/Zacplischka/dinner_app/issues/316)): an Owned Recipe never ages out, so a Shopping List could in principle be minted from it months later — which a Sourced Recipe past its pool TTL cannot. The capability is banked, not spent: nothing suppresses it, nothing builds on it, and the 7-day Shopping List TTL does not vary by source. A capability that works for 3 cards in 15 and silently fails for 12 is a coin flip, and the blend is deliberately invisible.

## Consequences

- A third tier exists; ADR 0001's boundary is unchanged for its two kinds and stays strict.
- The corpus adds zero marginal cost per cook decision and no new fixed cost line.
- Promotion to Postgres is a recorded escape hatch with a named trigger — real evidence the file is failing — not an open question.
