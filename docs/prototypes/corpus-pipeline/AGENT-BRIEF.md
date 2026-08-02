# Corpus pipeline agent brief (#319 pilot)

Throwaway prototype for [#319](https://github.com/Zacplischka/dinner_app/issues/319). Two agent roles with a hard wall between them — the wall IS the re-authoring standard ([#315](https://github.com/Zacplischka/dinner_app/issues/315)).

## Research agent (reading stage)

Input: one dish from `dishes.json`. Output: `records/<slug>/fact.json` + transient source captures.

Rules — each one is load-bearing, none are optional:

1. **≥3 independent sources** (different publishers, not different pages of one site). Find them by searching for the dish by name — **never** by walking a site's index, category page, or sitemap.
2. **Robots**: before fetching any domain, check its `/robots.txt` for AI-agent disallows (`anthropic-ai`, `claude`, `GPTBot`, `*`). Skip disallowed domains entirely. Known-disallowed, never fetch: `taste.com.au`, `delicious.com.au` (People Inc). Prefer AU and US publishers; avoid UK/EU sites (database right — see #311).
3. **Emit no prose.** `fact.json` holds only: the dish identity; the canonical ingredient set with per-source quantity observations; the causal step sequence as terse functional clauses ("brown mince", "add stock, simmer 30 min") — never sentences from a source; technique facts; per-source metadata (url, publisher, accessed date, robots_ok).
4. Save each source page's **plain text** to `sources-transient/<slug>/<n>.txt` — gitignored, exists ONLY for the overlap check, deleted after the dish passes.

`fact.json` shape:

```json
{
  "slug": "spaghetti-bolognese",
  "dish": "Spaghetti bolognese",
  "cell": {"mealType": "main course", "cuisine": "italian", "diets": []},
  "sources": [{"url": "…", "publisher": "…", "accessed": "2026-08-02", "robots_ok": true}],
  "canonicalIngredients": [
    {"name": "beef mince", "essential": true, "observations": ["500 g (s0)", "1 lb (s1)", "750 g (s2)"]}
  ],
  "causalSequence": ["brown mince in batches", "soften onion garlic carrot celery", "add tomato, stock; simmer 45+ min", "cook spaghetti; combine"],
  "techniqueFacts": ["two sources hold longer simmer (45-90 min) is the flavour lever", "milk splash is a traditional richness step (1 source)"],
  "servingsObserved": [4, 6, 4]
}
```

## Author agent (writing stage)

Input: **`fact.json` ONLY.** The author must never see source text, source URLs' content, or the transient captures — do not open them. Output: `records/<slug>/recipe.json`.

Standard (#315, #314, #318):

- Author the method **from the dish**, in Dinder's own voice: plain Australian English, metric, direct imperative steps. No source's sentence architecture — you never saw one.
- **Amounts are your own**: sane AU-metric numbers informed by the observation ranges — never one source's full set. Round to what a Woolworths shopper buys (500 g mince, not 437 g).
- **AU vocabulary**: capsicum, coriander, beef mince, thickened cream, plain flour, spring onions, chicken stock, cornflour, icing sugar, caster sugar, bicarbonate of soda.
- Units from: `g`, `kg`, `ml`, `l`, `tsp`, `tbsp`, `cup`, or `""` with a countable name ("2 eggs", "1 brown onion"). Fresh herbs use `bunch` (see amendments); no handfuls, no "to taste" in amounts (a pinch of salt goes in the step text, not the ingredient list).
- Ingredient `name`s are what you'd type into Woolworths search ("beef mince", not "lean premium ground beef").
- Every ingredient must appear in some step; every step references only listed ingredients (salt, pepper, water, olive oil are assumed staples and may appear freely).
- Title = the plain dish name. `servings` mandatory (default 4). `readyInMinutes` honest.

`recipe.json` shape:

```json
{
  "placeId": "owned:spaghetti-bolognese",
  "title": "Spaghetti Bolognese",
  "servings": 4,
  "readyInMinutes": 60,
  "mealType": "main course",
  "cuisine": "italian",
  "diets": [],
  "image": "images/spaghetti-bolognese.webp",
  "extendedIngredients": [
    {"name": "beef mince", "amount": 500, "unit": "g", "original": "500 g beef mince"}
  ],
  "steps": ["Heat a splash of olive oil in a large pot over high heat. Brown the beef mince in two batches, breaking it up as it cooks.", "…"]
}
```

## Authoring amendments (from the spike, 2026-08-03)

- **`searchTerm`** (optional, per ingredient): when `name` is diet-qualified or otherwise unmatchable as a search ("gluten free cornflour"), add a plain matchable `searchTerm` ("cornflour gluten free" → or the simplest term that surfaces the right product). Display stays cook-honest; search stays matchable.
- **Packet goods get structured metric amounts**: small quantities of packet-bought dry/liquid goods use `g`/`ml` in `amount`/`unit`; the cook-friendly phrasing lives in `original` ("1 tbsp (10 g) gluten free cornflour").
- **Pack-form-aware quantities**: author quantities in the form the product is sold ("1 kg potatoes", not "800 g potatoes").
- **Fresh herbs are authored in `bunch`** (fractions fine: 0.5 bunch coriander) — #241's static herb table owns that unit end to end.
- **Tiny dried aromatics (bay leaves) are Staples** for the pilot — excluded from the tally like all Staples; flagged for the spec to review the Staples set.

## Gates (run by the orchestrator, not agents)

`overlap_check.py` (vs transient sources, then sources deleted) → `structural_gate.py` → GPT + Gemini culinary judges (both must pass) → tally check. Failures return to the author with reasons, max 2 rewrites, then the dish is dropped.
