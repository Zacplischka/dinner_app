# The Owned Recipe Store's corpus

One directory per Owned Recipe, named for its frozen slug, holding `recipe.json`
— the layout `scripts/corpus/images.mjs` reads and stamps `photoUrl` into, and
the one `src/services/ownedRecipeStore.ts` loads at boot — beside the
`fact.json` it was authored from. Reference data (ADR 0011): reviewed in a pull
request, shipped with the deploy, read in memory. A bad batch is one revert from
gone.

The Fact Record is the audit trail ADR 0012 requires: the sources the reading
stage was allowed to read, the observations it took from them, and nothing the
author ever saw as prose. Nothing at runtime reads it. It is here because it is
the demonstration that the rules held for this Recipe.

These fifty were read by the pilot's own reading stage, so they carry no
`skipped` list — the candidates it refused, and why, were not written down.
That is a gap in this batch's audit trail rather than a gap in the record
shape; every Fact Record `read-dish.mjs` writes from here on carries one.

**This is the 50-Recipe pilot batch ([#319](https://github.com/Zacplischka/dinner_app/issues/319)),
re-gated through the rebuilt pipeline and committed by
[#338](https://github.com/Zacplischka/dinner_app/issues/338).** It replaces the
provisional seed of 10 the blend ticket
([#331](https://github.com/Zacplischka/dinner_app/issues/331)) shipped, which
had been through no gate layer at all and is gone.
[#341](https://github.com/Zacplischka/dinner_app/issues/341) grows this to
~1,160.

## Where the batch stands against the four-layer gate

| Layer               | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural          | **0/50 pass.** `node scripts/corpus/gate.mjs check backend/recipes --structural` prints `0/50 pass structural`. Every one of the 100 failure lines is the image sub-check, so the rest of the layer — the record shape, the AU vocabulary, the authoring amendments — is clean on all 50; but the layer is one gate and it does not pass.                                                                                                                                                                                             |
| Images              | **Neither generated nor served.** No record carries a `photoUrl` and there is no `.corpus-images/<slug>.webp` to stamp one from: `images.mjs generate` has not run, and the R2 bucket behind `img.dinder.it.com` does not exist ([#355](https://github.com/Zacplischka/dinner_app/issues/355), a human ticket). A committed URL that 404s reads worse on a card than no photo, so the field stays absent until both happen — and landing #355 plus one `generate`/`collect` pass is the whole distance from 0/50 to 50/50 structural. |
| Culinary            | **Half-run.** The Google judge read all 50 and the batch answers it; the OpenAI judge has not run — no `OPENAI_API_KEY` exists in this environment, and `gate.mjs` refuses a one-family pair by design. One family is not this layer.                                                                                                                                                                                                                                                                                                 |
| Tally at store 1101 | **Not run.** `tally.mjs check` measures inside the production container over `railway ssh`, and the Railway CLI here is unauthenticated (`railway login` is a browser flow).                                                                                                                                                                                                                                                                                                                                                          |
| Human               | **Not run.** `node scripts/corpus/human.mjs sample backend/recipes` names the 12 Recipes to read.                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**No layer passes, so #338 does not close on this branch.** The batch ships
because it is strictly better than the ungated seed it replaces, not because it
has cleared the gate. Against #338's six acceptance criteria:

| #   | Criterion                                                                                  |                                                                                    |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | All 50 through the four-layer gate, tally at 1101                                          | **Open** — see the table above                                                     |
| 2   | The final record shape, with per-ingredient search terms                                   | **Shape done, terms carried forward** — below                                      |
| 3   | Images generated and served from R2                                                        | **Open** — blocked on [#355](https://github.com/Zacplischka/dinner_app/issues/355) |
| 4   | The blend ticket's provisional seed gone, unreferenced                                     | **Done**                                                                           |
| 5   | A matching Craving deals these, one crowned and cooked with a fully in-tally Shopping List | **Dealt, crowned and cooked; "in tally" open** — below                             |
| 6   | Every failure rewritten or dropped, and which recorded                                     | **Done** — "What the re-gate changed"                                              |

Every open half sits behind a credential or a bucket that is not an agent's to
mint: an `OPENAI_API_KEY`, an authenticated `railway`, and the R2 bucket. Closing
#338 wants those runs; committing this batch does not.

### What is carried forward rather than measured

The 52 `searchTerm`s across 37 records, and the `g`/`ml` pack forms the re-gate
restated, are the pilot's — measured against **store 3221**, which is the store
[#338](https://github.com/Zacplischka/dinner_app/issues/338) exists to move off,
because the two stores stock differently. They are in the right shape and they
route (`tests/unit/shippedCorpus.test.ts`), but no run has established that
these are the terms 1101 answers. When the tally layer does run, let it name the
lines that miss and correct `searchTerm` from that run — do not read the present
set as a 1101 measurement.

## What the re-gate changed, Recipe by Recipe

Nothing was dropped. Every defect the rebuilt gate found was a rewrite, as the
layer's own rule requires.

**Restated in pack form (19).** The rebuilt structural layer enforces the
authoring amendments the pilot's brief only asked for: dried spices and packet
goods are weighed in `g`/`ml`, and the cook's own phrasing moves into
`original`. `1 tsp ground cumin` became `2 g`, written `1 tsp (2 g) ground
cumin` — beef-massaman-curry, beef-pho, beef-tacos, butter-chicken,
chana-masala, chicken-burrito-bowl, chicken-satay-skewers,
chicken-shawarma-bowl, chilli-con-carne, fish-and-chips, lamb-rogan-josh,
moussaka, pad-thai, paleo-chicken-tray-bake, penne-arrabbiata,
pork-chops-with-apple-sauce, red-lentil-dhal, shepherds-pie,
spaghetti-bolognese.

**Fresh herb restated in `bunch` (1).** roast-chicken-and-vegetables carried
thyme in `tbsp`; #241's static herb table owns `bunch` end to end.

**AU vocabulary (1).** beef-pho said "broth" in two steps; Australia says stock.

**Cuisine tag dropped (15).** The pilot tagged these `modern australian`, which
is not a value `shared/types/cook.ts` carries — the chip is
[#340](https://github.com/Zacplischka/dinner_app/issues/340) and the bucket is
[#339](https://github.com/Zacplischka/dinner_app/issues/339). An Owned Recipe
with no cuisine answers only a Craving that names none, so until the chip ships
these deal on a plain meal-type Craving and nowhere else: bangers-and-mash,
beef-casserole, chicken-parmigiana, chicken-schnitzel-with-salad,
chocolate-self-saucing-pudding, fish-and-chips,
grilled-steak-with-chips-and-salad, lamb-chops-with-mash-and-peas,
pork-chops-with-apple-sauce, pumpkin-soup, rissoles-with-gravy,
roast-chicken-and-vegetables, shepherds-pie, tuna-mornay, zucchini-slice.
caesar-salad, garlic-butter-steak-with-creamed-spinach and
paleo-chicken-tray-bake carried no cuisine in the pilot either.

**Culinary rewrites (1).** beef-casserole cooked with two bay leaves that no
Ingredient Line carried — a hole a shopper would find at the stove. The pilot
treated bay leaves as a Staple; `staples.ts` does not, so the line is listed.

`readyInMinutes` and the pilot's local `image` path are gone: neither is a field
of the shipped record.

## The batch dealt and cooked

`tests/unit/shippedCorpus.test.ts` is the only test that reads _these_ records:
every suite that boots the app is pointed at `tests/fixtures/owned-recipes/` by
`OWNED_RECIPES_DIR`, deliberately, so those tests state what the blend does
rather than what ships this week. It deals a Deck for a plain `main course`
Craving — plain because 18 of the 50 now carry no cuisine and a cuisine-named
Craving cannot reach them — crowns the first Owned card on it, and mints its
Shopping List through the real service off the corpus.

With the shuffle stubbed for a repeatable run, the Deck of 15 carries the blend's
floor of three: bangers-and-mash, beef-and-black-bean-stir-fry, beef-casserole.
Crowning the first mints **Bangers and Mash with Onion Gravy**, stated for 4 and
scaled to a Headcount of 6: 9 Ingredient Lines, 1 Staple out of the tally, and 8
Retailer lookups — one per shoppable line, `potatoes` searched as the
`potatoes 2kg` the record authored rather than by the name on the card.

What that does **not** show is the Retailer's own answer. The stub matches every
term, so "8 of 8 priced" is a fact about the routing and the scale, not about
whether store 1101 stocks these — "fully in-tally" is the tally layer's
measurement and nothing offline can stand in for it.

## Running the remaining layers

```bash
node scripts/corpus/gate.mjs check backend/recipes --structural   # free, instant
node scripts/corpus/gate.mjs check backend/recipes                # + both judges
node scripts/corpus/tally.mjs check backend/recipes               # store 1101, via railway ssh
node scripts/corpus/human.mjs sample backend/recipes
```

The tally run spends the shared Woolworths politeness budget and half the day's
Spoonacular points, so it must not run while anyone is using the app — it
refuses to start while a Session is live. See `AGENTS.md` for where each
credential lives.

Growing or replacing this batch cannot break a blend test: `OWNED_RECIPES_DIR`
overrides the directory the store loads (`config.ownedRecipesDir`), and the
integration and contract suites — every suite that boots the app — point it at
`tests/fixtures/owned-recipes/` so their counts are about the blend rather than
about what ships here. It can break `tests/unit/ownedRecipeStore.test.ts` and
`tests/unit/shippedCorpus.test.ts`, which is the point of them: those two read
the shipped directory, and a batch that will not load, will not deal, or will
not mint should say so here rather than in production.
