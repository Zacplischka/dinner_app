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

**This is the 50-Recipe pilot batch ([#319](https://github.com/Zacplischka/dinner_app/issues/319)),
re-gated through the rebuilt pipeline and committed by
[#338](https://github.com/Zacplischka/dinner_app/issues/338).** It replaces the
provisional seed of 10 the blend ticket
([#331](https://github.com/Zacplischka/dinner_app/issues/331)) shipped, which
had been through no gate layer at all and is gone.
[#341](https://github.com/Zacplischka/dinner_app/issues/341) grows this to
~1,160.

## Where the batch stands against the four-layer gate

| Layer | State |
| --- | --- |
| Structural — shape | **50/50 pass.** `node scripts/corpus/gate.mjs check backend/recipes --structural` |
| Structural — image | **Not passing.** No record carries a `photoUrl`; the R2 bucket does not exist ([#355](https://github.com/Zacplischka/dinner_app/issues/355), a human ticket) and a committed URL that 404s reads worse on a card than no photo. `check` reports the gap on all 50 until then. |
| Culinary | **Half-run.** The Google judge read all 50 and the batch answers it; the OpenAI judge has not run — no `OPENAI_API_KEY` exists in this environment, and `gate.mjs` refuses a one-family pair by design. One family is not this layer. |
| Tally at store 1101 | **Not run.** `tally.mjs check` measures inside the production container over `railway ssh`, and the Railway CLI here is unauthenticated (`railway login` is a browser flow). |
| Human | **Not run.** `node scripts/corpus/human.mjs sample backend/recipes` names the 12 Recipes to read. |

Only the first line is a pass. The batch ships because it is strictly better
than the ungated seed it replaces, not because it has cleared the gate.

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

Growing or replacing this batch cannot break a test: `OWNED_RECIPES_DIR`
overrides the directory the store loads (`config.ownedRecipesDir`), and the
integration and contract suites — every suite that boots the app — point it at
`tests/fixtures/owned-recipes/` so their counts are about the blend rather than
about what ships here.
