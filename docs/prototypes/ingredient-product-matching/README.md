# Prototype: ingredient → grocery product matching

Throwaway artifact for [#231](https://github.com/Zacplischka/dinner_app/issues/231), on the
[cook-branch v1 map](https://github.com/Zacplischka/dinner_app/issues/225). Not production
code and not a design — something concrete to react to.

**The question:** does ingredient→product matching work well enough to build a priced
shopping list on?

**The answer:** the matching is better than expected, the *quantities* are not, and no
recipe in the sample produced a fully correct, fully priced list — before or after a cheap
improvement pass.

---

## What was actually measured, and against what

10 real recipes spanning 10 cuisines (Italian, Thai, Indian, Mexican, Chinese, Middle
Eastern, Greek, Japanese, Vietnamese, Australian), 87 ingredient lines, **68 distinct
non-staple ingredients** after excluding the ~30 hardcoded pantry staples the map already
puts on the list unticked and out of the total.

Two caveats that matter before reading any number below:

1. **The headline numbers are Woolworths, not Coles.** Coles blocked every automated route
   part-way through (see [Availability](#availability-the-thing-that-nearly-stopped-this)).
   Woolworths answered all 68 terms without complaint, so the full sample is Woolworths.
   **On the 10 terms where both retailers answered, Coles ranked noticeably better** —
   9 exact / 1 plausible / 0 wrong, against Woolworths' 6 / 2 / 2. So the 16% wrong-match
   rate below is probably pessimistic for Coles. The *failure taxonomy* transfers cleanly:
   both retailers return `approx. 1.2kg`, `1 Each`, and `700g` for a dozen eggs.
2. **The recipes are hand-transcribed, not pulled from Spoonacular.** No API key exists yet
   ([#236](https://github.com/Zacplischka/dinner_app/issues/236) is still open). Ingredient
   strings are written in the structured `name` / `amount` / `unit` shape Spoonacular
   returns, in AU English. A separate pass tested what happens when the words are US
   English, which is what Spoonacular will actually send.

## Hit rate

The naive matcher is deliberately dumb: search the ingredient name, take the retailer's
top-ranked available product, parse its pack size, divide.

| Grade | Naive top-1 | After cheap re-ranker |
|---|---|---|
| **exact** — the product IS the ingredient | 42 (62%) | 48 (71%) |
| **plausible** — right thing, wrong variant | 15 (22%) | 15 (22%) |
| **wrong** — a different product entirely | 11 (16%) | **5 (7%)** |
| **none** — no result | 0 | 0 |
| *usable (exact + plausible)* | *57 (84%)* | *63 (93%)* |

Nothing returned zero results. Every failure is a **confident wrong answer**, which is the
dangerous kind — there is no signal in the response saying "this is a guess".

The wrong ones are worth reading, because they are funny in a way that is also the whole
risk:

| Ingredient | Naive top-1 pick |
|---|---|
| `500g beef mince` | Continental **recipe-base sachet**, 50g → ×10 = **$18.00** |
| `800g beef brisket` | Chief beef **jerky bar**, 40g → ×20 = **$96.00** |
| `200g sour cream` | Grain Waves **sour cream & chives chips** → ×10 = **$60.00** |
| `1 avocado` | Avofresh **guacamole** |
| `1 lime` / `2 lemons` | Fever-Tree **lime soda** / Remedy **yuzu soft drink** |
| `500g pumpkin` | La Zuppa **pumpkin soup pouch** |
| `2 potatoes` | **duck-fat roast potatoes** |
| `400ml coconut milk` | MILKLAB **barista coconut drink** |

**The critical structural finding: in 10 of those 11 cases the correct product was sitting
at rank 2–5.** Recall@5 is effectively 100%. The catalogue is not the problem — the
*ranking* is. That is what makes a cheap fix viable at all.

## Pack sizes, which is where it actually breaks

Matching the product is the easy half. Turning "needs 250g → buy 1 × 400g tin" into a
number failed on **25 of 68 ingredients (37%)** naively, improving to 14 of 68 (21%) after
the re-ranker.

| Failure | Count | Example |
|---|---|---|
| count vs mass | 9 | `4 chicken breasts` → a 600g pack. How many breasts is 600g? |
| vague unit | 9 | `a handful of Thai basil`, `1 bunch coriander`, `3 sprigs rosemary`, `1 packet` |
| volume vs mass | 4 | `2 tbsp tomato paste` → a 140g tube |
| count vs volume | 2 | `2 lemons` → a 250mL bottle |

And when a number *was* produced it was often nonsense, because a wrong match multiplies:
8 lines priced at ≥$15 for a single ingredient, topping out at $96 of beef jerky.

Retailer pack-size strings are themselves hostile: `approx. 170g`, `per 190g`,
`750g - 2.2kg`, `1 Each`, `12 pack`, `Bunch`. Anything variable-weight or per-unit defeats
a regex, and `per 190g` silently parsed as a 190g pack — which is how 600g of chicken thigh
became **$62.00**.

## What a cheap improvement buys

`rerank.py` — no synonym table, no LLM, no per-ingredient knowledge. Four generic rules:

1. **Require a SAP category.** Real supermarket lines carry one; third-party marketplace
   junk (a garlic *press* returned for "garlic cloves") carries `null`. Cheapest, highest-value filter here.
2. **Small section blocklist** — chips, confectionery, soft drink, pet, hair/beauty, kitchenware.
3. **Keyword survival** — the product name must retain the ingredient's own words, or
   `chicken stock` quietly becomes *vegetable* stock.
4. **Shape and scale** — pack size must parse to the same kind of measurement the recipe
   asked for, within a sane multiple, treating **1g = 1mL** (which is what rescues
   `200g sour cream` from being unmatchable against a 300mL tub).

It changed 15 of 68 picks: **8 clear fixes** (mince, brisket, potatoes, sour cream,
avocado, lime, chicken stock, naan), a few lateral swaps, and **2 regressions** — grated
Parmigiano Reggiano ($4.80/100g) became Grana Padano ($11.90/200g), and lemons went from
one wrong answer (soda) to a different wrong answer (Mr Kipling lemon cake slices).

Cheap gets you: wrong 16% → **7%**, priceable lines 63% → **79%**.

Cheap does **not** get you the residue, and the residue is coherent: `4 chicken breasts`,
`6 eggs`, `3 garlic cloves`, `1 head of broccoli`, `1 bunch coriander`, `a handful of Thai
basil`. Every one needs a fact no regex holds — *what does one chicken breast weigh, what
is in a bunch* — i.e. an ingredient knowledge base or a model call. That is the expensive
class, and it is cleanly separable from the cheap class.

Worth noting for the spec: **Spoonacular may already supply much of it.** Its ingredient
data carries gram weights and unit conversions, so part of this "expensive" residue may be
purchasable from the recipe side rather than built.

## US vocabulary (Spoonacular is American, Coles is not)

12 US ingredient words asked of AU search. **8 of 12 resolved correctly** — the retailer's
own search does more dialect work than expected (`cilantro` → coriander bunch, `bell
pepper` → capsicum, `scallions` → spring onion, `arugula` → rocket, `shrimp` → tiger prawns).

The 4 failures are the dangerous kind:

| US term | Returned |
|---|---|
| `ground beef` | a **meat masher** (kitchen utensil) |
| `heavy cream` | **Redken All Soft Heavy Cream** hair treatment |
| `cornstarch` | **baby powder** with cornstarch |
| `napa cabbage` | nothing at all (0 results) |

Only `napa cabbage` fails loudly. The rest fail silently, confidently, from an entirely
different department. Note Coles handled `heavy cream` correctly (Double Cream Extra Thick)
where Woolworths returned hair product.

## Availability: the thing that nearly stopped this

Not what the ticket asked, but it dominated the session and bears on
[#233](https://github.com/Zacplischka/dinner_app/issues/233).

- **The Apify actor costs ~3.5× what [#227](https://github.com/Zacplischka/dinner_app/issues/227) recorded.**
  Real model is pay-per-event: **$0.10 × memory GB per run start + $0.01 per result**
  ($10/1,000), not $2.80/1,000. Cold 12-item list ≈ **$0.80**, not $0.27.
- **The actor scrapes sequentially and aborts the entire run on the first failed URL**,
  despite `ignore_url_failures: true`. One blocked term kills every term behind it, and the
  $0.10 start fee is spent either way.
- **The actor is just scraping the public search page.** `coles.com.au/search/products?q=…`
  embeds the whole result set in `__NEXT_DATA__`. The middleman buys bot-block absorption,
  nothing else.
- **Every Coles route got blocked.** Apify datacenter IPs first, then a residential IP after
  ~5 rapid lookups, then a real logged-in browser session after ~21. Apify's residential AU
  proxy did work but took **>7 minutes for a single term**.
- **Woolworths has a real JSON API** (`POST /apis/ui/Search/products`) behind one session
  cookie. 80 terms straight through, no proxy, no rate limiting, no cost — and it returns
  richer data than the Coles scrape, including the category signal the re-ranker depends on.

The operative constraint is **throughput, not cost**. Any synchronous per-user cold lookup
against Coles is not viable; the map's shared national SKU-keyed cache is doing more
load-bearing work than "an optimisation".

## Verdict

**Matching alone does not carry a priced shopping list, but it is close enough to be worth
carrying.**

- 93% usable matches after a cheap pass is a workable base.
- 0/10 recipes yielding a clean priced list is not, and quantity semantics — not product
  matching — is what breaks them.
- The pack-priced tally as specified ("needs 250g · buy 1 × 400g tin — $1.40") is
  **not safely shippable on this evidence** for count-unit and vague-unit ingredients,
  which are ~⅓ of every list.

The honest v1 shapes are: price what can be priced and degrade the rest visibly, or buy the
quantity knowledge. Both are decisions, not findings — see the follow-up tickets.

## The launch gate re-run (#245)

The corpus was re-run for [#245](https://github.com/Zacplischka/dinner_app/issues/245)
against **store 1101** (search results captured from inside the Railway container) through
the full [#241](https://github.com/Zacplischka/dinner_app/issues/241) resolution ladder,
grading every non-staple line into [#234](https://github.com/Zacplischka/dinner_app/issues/234)'s
four states. **Median recipe in-tally: 89.4% — the ≥ 80% gate passes.** See the #245
resolution comment for the full report.

| File | What |
|---|---|
| `gate.py` | match → re-rank → #241 ladder → #234 states, per line |
| `woolies_products_1101.json` | top-5 per term as served to Railway's egress (store 1101) |
| `grades_1101.json` | match grades at 1101 (46 carried from #231, 22 freshly judged) |
| `gate_lines_1101.json` | per-line resolution: state, rung, packs, price |
| `spoon_cache.json` | cached Spoonacular convert/consistency answers |

Reproduce offline: `python3 gate.py` (Spoonacular answers come from the cache).

## Files

| File | What |
|---|---|
| `recipes.json` | the 10 recipes, Spoonacular-shaped |
| `us_terms.json` | 12 US↔AU ingredient word pairs |
| `woolies.py` | Woolworths fetcher (cookie jar + JSON API) |
| `direct.py` | Coles fetcher via `__NEXT_DATA__` (partial — blocked) |
| `match.py` | Coles-via-Apify fetcher, pack-size and unit parsing |
| `wgrade.py` | naive matcher → per-ingredient list rows |
| `rerank.py` | the cheap improvement |
| `grades.json`, `grades_reranked.json` | hand-applied match grades + reasons |
| `summary.py` | the tables above |
| `woolies_products.json`, `products_direct.json` | raw captured results |

Reproduce: `python3 woolies.py && python3 summary.py && python3 rerank.py`
