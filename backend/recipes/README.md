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

| Layer               | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural          | **50/50 pass.** `node scripts/corpus/gate.mjs check backend/recipes --structural` prints `50/50 pass structural` — record shape, AU vocabulary, authoring amendments, and the image sub-check: every record's `photoUrl` against its `.corpus-images/<slug>.webp`. The run is `structural-2026-09-03.txt` in [`docs/evidence/owned-recipe-corpus/`](../../docs/evidence/owned-recipe-corpus/).                                                                                                                                                                                                                   |
| Images              | **Served from R2.** Every record carries `photoUrl` `https://img.dinder.it.com/<slug>.webp`, and the object behind it is in the `dinder-recipe-images` bucket, stood up 2026-09-03 ([#355](https://github.com/Zacplischka/dinner_app/issues/355)). The 50 images are the ones the pilot generated on `prototype/corpus-pipeline`, four of them re-encoded with the pipeline's `-size 115000 -pass 6` target so all sit under the 150 KB cap; `images.mjs generate` has not been run on this batch. The real GET is recorded in [`docs/evidence/owned-recipe-images/`](../../docs/evidence/owned-recipe-images/). |
| Culinary            | **50/50 pass, both families.** The Google judge as shipped; the OpenAI judge through `codex exec` on the operator's ChatGPT subscription, since no `OPENAI_API_KEY` exists here — same rubric, same strict-JSON verdict, both through the gate's own `culinaryFailures`. First pass 41/50: eight sent back for diets claimed on unlabelled ingredients and three method faults, all rewritten; the re-gate sent one back again (baking paper under a grill), rewritten and passed. Runs in [`docs/evidence/owned-recipe-corpus/`](../../docs/evidence/owned-recipe-corpus/).                                     |
| Tally at store 1101 | **50/50 in tally.** Measured where production runs, over `railway ssh`, on 2026-09-02. The batch as ported measured 25/50; every failure was the Retailer's answer to the pilot's store-3221 terms and pack forms, rewritten line by line below, and the re-run measured 50/50. The runs are in [`docs/evidence/owned-recipe-corpus/`](../../docs/evidence/owned-recipe-corpus/).                                                                                                                                                                                                                                |
| Human               | **12/12 pass, every stratum.** `node scripts/corpus/human.mjs sample backend/recipes` named the 12, stratified by cuisine; the operator read them on 2026-09-03 and passed all 12, so no stratum escalated. The verdicts and `human.mjs verdict`'s report are `human-2026-09-03.json` and `.txt` in [`docs/evidence/owned-recipe-corpus/`](../../docs/evidence/owned-recipe-corpus/).                                                                                                                                                                                                                            |

**All four layers pass.** Against #338's six acceptance criteria:

| #   | Criterion                                                                                  |                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | All 50 through the four-layer gate, tally at 1101                                          | **Done** — all four layers, see the table above                                                                                                                          |
| 2   | The final record shape, with per-ingredient search terms                                   | **Done** — 71 `searchTerm`s across 44 records, every one now a term store 1101 answered                                                                                  |
| 3   | Images generated and served from R2                                                        | **Done** — the pilot's 50 in `dinder-recipe-images` behind `img.dinder.it.com`, stamped into every record ([#355](https://github.com/Zacplischka/dinner_app/issues/355)) |
| 4   | The blend ticket's provisional seed gone, unreferenced                                     | **Done**                                                                                                                                                                 |
| 5   | A matching Craving deals these, one crowned and cooked with a fully in-tally Shopping List | **Done** — dealt, crowned and minted offline below; every line of every Recipe in tally at store 1101 by the run above                                                   |
| 6   | Every failure rewritten or dropped, and which recorded                                     | **Done** — nothing dropped; "What the re-gate changed"                                                                                                                   |

Nothing stays open on the batch: merging it closes #338. The one thing still
owed nearby is [#355](https://github.com/Zacplischka/dinner_app/issues/355)'s
R2 API token, which `images.mjs publish` needs for the next batch and today's
upload did not.

### What the tally sent back

The pilot's 52 `searchTerm`s and `g`/`ml` pack forms were measured against
**store 3221**; the first run at store 1101 measured 25/50. Every failure was a
line the Retailer answered differently from 3221, and every one was rewritten in
the record rather than in the Matcher — the cook's wording stays in `name` and
`original`, the store's in `searchTerm` and the unit:

- **`lemon`, 11 records.** Store 1101 ranks lemon soda and iced tea above the
  fruit, and the Matcher scores on name coverage, so "1 lemon" bought a 330 mL
  drink. `searchTerm: "lemon loose"` — its two identity words outscore any
  drink's one — and the count line then buys the each-priced fruit.
- **`sour cream`** (beef-tacos): stated in grams against a 300 mL tub. Restated
  in millilitres.
- **`taco shells`** (beef-tacos): the pilot's `taco kit` term found a 350 g kit
  that a count of shells cannot buy. `searchTerm: "taco shells"` finds the
  12-pack.
- **`tartare sauce`** (fish-and-chips): 250 ml against a 220 g jar. Restated as
  the jar.
- **`sweet potato`, `zucchini`**: grams against each-priced produce, which the
  ladder has no bridge for. Restated as counts, grams kept in `original`.
- **`apple cider vinegar`, 2 records**: outranked by vinegar gummies.
  `searchTerm: "cornwells apple cider vinegar"`.
- **`bay leaves`, 2 records**: by the leaf against a 15 g pack. Restated in
  grams, as the batch's other spices already are.
- **Not ranged under those words, 4 records**: `basa fillets` for the white
  fish, `lamb chops` for the loin chops, `corn kernels` for the can, and
  `roasted cashews` — the cooking-aisle pack, where `cashews unsalted` only
  found a produce-aisle line the snack blocklist hides.
- **Four transient search failures** (`ground cumin` ×7 records, `vegetable
liquid stock` ×3, `leg ham`, `lebanese cucumbers`): Woolworths answered those
  four searches with an error once, and the hour-long failure cache made every
  Recipe sharing the term unmeasured. The four cached failures were deleted and
  the terms fetched fresh; all four priced.

The Matcher's share of this — drinks and supplements outranking food, a produce
aisle blocked as snacks — is
[#367](https://github.com/Zacplischka/dinner_app/issues/367), because a Sourced
Recipe saying "1 lemon" gets the same iced tea and no `searchTerm` can reach it.

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

**Cuisine tag withheld (15).** The pilot tagged these `modern australian`, which
is not a value `shared/types/cook.ts` carries — the chip is
[#340](https://github.com/Zacplischka/dinner_app/issues/340) and the bucket is
[#339](https://github.com/Zacplischka/dinner_app/issues/339). An Owned Recipe
with no cuisine answers only a Craving that names none, so until the chip ships
these deal on a plain meal-type Craving and nowhere else — 18 of the 50 now
carry no cuisine, and the largest bucket in AU dinner is unreachable from any
cuisine-named Craving in this batch.

**The 15 slugs are in [`pending-cuisine.json`](pending-cuisine.json), not in
this paragraph**, so #339 re-tags by lookup rather than by parsing prose.
Nothing at runtime reads it; `tests/unit/shippedCorpus.test.ts` holds it honest,
and fails the day `modern australian` joins `CUISINES` — stamp the slugs then
and delete the entry. caesar-salad, garlic-butter-steak-with-creamed-spinach and
paleo-chicken-tray-bake are the other three untagged records: they carried no
cuisine in the pilot either, and are not pending anything.

**Culinary rewrites (10).** beef-casserole cooked with two bay leaves that no
Ingredient Line carried — a hole a shopper would find at the stove. The pilot
treated bay leaves as a Staple; `staples.ts` does not, so the line is listed.
The two-family run then sent back eight more, all of the kind the pilot warned
about: a diet claimed on an ingredient not labelled for it — fish sauce
(beef-massaman-curry, vietnamese-chicken-vermicelli-bowl), tamari
(san-choy-bow) and curry paste (beef-massaman-curry) now named gluten-free with
the plain term kept in `searchTerm`; zucchini-slice's cheddar named for
vegetarian rennet; pumpkin-soup's thickened cream, which can carry gelatine,
replaced by pure cream — plus three method faults: chicken-katsu-curry's rice
had no water or time, bangers-and-mash left the potatoes boiling while the rest
cooked, and garlic-butter-steak dropped butter and garlic into a smoking pan.
The re-gate sent paleo-chicken-tray-bake back once more for baking paper under
a grill. Beef-pho, separately, cooked without the spring onions every source
garnishes with; they are listed and on the bowl.

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
credential lives. The runs behind the numbers above are in
[`docs/evidence/owned-recipe-corpus/`](../../docs/evidence/owned-recipe-corpus/).

Growing or replacing this batch cannot break a blend test: `OWNED_RECIPES_DIR`
overrides the directory the store loads (`config.ownedRecipesDir`), and the
integration and contract suites — every suite that boots the app — point it at
`tests/fixtures/owned-recipes/` so their counts are about the blend rather than
about what ships here. It can break `tests/unit/ownedRecipeStore.test.ts` and
`tests/unit/shippedCorpus.test.ts`, which is the point of them: those two read
the shipped directory, and a batch that will not load, will not deal, or will
not mint should say so here rather than in production.
