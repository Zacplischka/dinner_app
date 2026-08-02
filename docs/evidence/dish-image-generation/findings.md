# Generating 1000 Recipe hero images: model, cost, card fit, hosting, posture

Research for [#313](https://github.com/Zacplischka/dinner_app/issues/313) on map [#310](https://github.com/Zacplischka/dinner_app/issues/310). Verified against official provider documentation, official pricing pages, first-party terms, and this repo's own code on **2026-08-02**. Every price and every terms quote below carries the URL it came from. Prices and model line-ups are mutable — reverify before the run is paid for. No images were generated and nothing was purchased to produce this document.

A note on vocabulary: `CONTEXT.md:41-43` bans "dish" and "card" as nouns for the thing — the term is **Recipe**, and a **Deck Entry** is what the swipe UI draws as a card. The directory name `dish-image-generation` is inherited from the ticket and conflicts with that; the prose below uses the ubiquitous language.

## Recommendation in one paragraph

Generate with **`gpt-image-2` at `quality: "medium"`, size `1536x1024`, through the Batch API**, crop centre to 4:3 and encode one **1200x900 WebP** per Recipe. Host on **Cloudflare R2 behind a custom domain on the existing `dinder.it.com` zone**. One-time build cost **US$21–27** for a clean 1000, **~US$30–38** with a 40% regeneration allowance for quality-gate rejects. Ongoing hosting **US$0.00/month**, inside R2's free tier with roughly 80x headroom on every metered dimension. Neither number moves the fixed monthly floor, so [#228](https://github.com/Zacplischka/dinner_app/issues/228)'s $120/mo reopen trigger is untouched.

## The model

Per-image prices, all from official pricing pages on 2026-08-02, x1000:

| Model | Documented per-image | x1000 | Batch x1000 | Human-preference rank |
| --- | --- | --- | --- | --- |
| `gpt-image-2` medium, 1536x1024 | $0.041 | $41.00 | **$20.50** | **1st (1381±5)** |
| `gpt-image-2` medium, 1024x1024 | $0.053 | $53.00 | $26.50 | 1st |
| `gpt-image-2` high, 1536x1024 | $0.165 | $165.00 | $82.50 | 1st |
| `gpt-image-2` low, 1536x1024 | $0.005 | $5.00 | $2.50 | 1st |
| `gemini-3.1-flash-image` 1K | $0.067 | $67.00 | $33.50 | 5th (1263±6) |
| `gemini-3.1-flash-lite-image` 1K | $0.0336 | $33.60 | $16.80 | 8th (1251±6) |
| `gemini-3-pro-image` 1K/2K | $0.134 | $134.00 | $67.00 | 9th (1246±3) |
| `gemini-2.5-flash-image` | $0.039 | $39.00 | $19.50 | not listed |
| `FLUX.2 [pro]` text-to-image | "from $0.03" | from $30.00 | n/a | not listed |
| `FLUX.2 [max]` | "from $0.07" | from $70.00 | n/a | not listed |
| `FLUX1.1 [pro]` Ultra | $0.06 | $60.00 | n/a | not listed |
| `imagen-4.0-generate-001` | $0.04 | $40.00 | n/a | **shut down 2026-08-17** |

Sources: OpenAI per-image table by quality and size ([Image generation guide, Calculating costs](https://developers.openai.com/api/docs/guides/image-generation)); Gemini per-image equivalents and the Imagen shutdown warning ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)); FLUX per-image prices and the "1 credit equals $0.01 USD" rate ([BFL pricing docs](https://docs.bfl.ai/quick_start/pricing)); rankings and vote counts from the text-to-image arena leaderboard dated 2026-07-31, 5,833,736 total votes across 74 models ([arena.ai text-to-image leaderboard](https://arena.ai/leaderboard/text-to-image)).

**Imagen 4 is off the table.** The pricing page carries a hard warning: *"Imagen 4 models (`imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`) are deprecated and will be shut down on August 17, 2026; migrate to Gemini 2.5 Flash Image to avoid service disruption"* ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). That is 15 days from this document's date. Any plan naming Imagen is dead on arrival.

**Batch halves the price.** OpenAI's batch image-output rate is exactly half the standard rate — `gpt-image-2` image output is `$30.00` per 1M tokens standard and `$15.00` batch ([OpenAI API pricing, Image generation models](https://developers.openai.com/api/docs/pricing)) — so every documented per-image cell halves under the Batch API. Gemini publishes an explicit Batch tier per image with the same 50% relationship ([Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). A 1000-image corpus build has no latency requirement whatsoever, so paying the synchronous rate is pure waste.

**Input tokens are noise.** OpenAI's guide states the cost is *"input text tokens + input image tokens if using the edits endpoint + image output tokens"* ([Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)). A 250-token prompt x 1000 at the batch text-input rate of `$2.50` per 1M tokens is $0.63 for the entire run.

**Why the leader rather than the cheapest.** `gpt-image-2 (medium)` sits 81 Elo clear of second place and 130 clear of `gemini-3.1-flash-lite-image` on 66,665 human votes ([arena leaderboard](https://arena.ai/leaderboard/text-to-image)). The two Google Flash variants are 12 points apart with ±6 error bars — effectively tied, so within Google the Lite model is the only rational pick. But the whole span from cheapest to best on this corpus is about US$4–10 of batch spend, **paid once, ever**. Map [#310](https://github.com/Zacplischka/dinner_app/issues/310) makes "must not read as second-class in the same Deck" a standing constraint; trading it for the price of a coffee is not a trade.

**What documentation cannot settle.** Arena Elo is aggregate human preference over general prompts. It is not evidence about food-photography realism at 384 CSS px, and it is not evidence about adherence to *"Malaysian beef rendang"* versus *"a bowl of curry"*. No vendor publishes a named-dish adherence benchmark. This is decidable only by generating, and the map already mandates a pilot batch. See the protocol below — it costs about US$1.50.

**Resolution and aspect ratio.** `gpt-image-2` *"accepts any resolution in the `size` parameter when it satisfies the constraints"* — maximum edge 3,840px, both edges multiples of 16px, total pixels between 655,360 and 8,294,400 ([Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)). 4:3 sizes such as 1200x896 are therefore legal, but they are not in the published price table ("Additional sizes available") and their token cost cannot be derived — the guide warns that *"A larger non-square resolution can sometimes produce fewer output tokens than a smaller or square resolution at the same quality setting"*, which the table bears out (1024x1024 medium is $0.053 while the larger 1536x1024 is $0.041). **Generate at the priced 1536x1024 cell and crop to 4:3 locally.** The discarded 11% of width is not waste; it is the safety margin the Match hero's 3.8:1 crop needs anyway.

Gemini's equivalent, for the record, exposes 4:3 directly: `gemini-3.1-flash-image` at 1K/4:3 is 1200x896 for 1120 tokens, and *"All generated images include a SynthID watermark"* ([Gemini image generation docs](https://ai.google.dev/gemini-api/docs/image-generation)).

## What the Deck Entry and the Match hero actually need

The photo box is bounded by two stock Tailwind caps and never exceeds them on any viewport. The Deck Entry card stack is `w-full max-w-sm flex-1 min-h-0 max-h-[30rem]` (`frontend/src/pages/SelectionPage.tsx:514-517`) — 384 x 480 CSS px maximum — and the photo region inside it is `relative h-[62%] flex-shrink-0` (`frontend/src/components/SwipeCard.tsx:216`), rendered `object-cover` (`SwipeCard.tsx:240`). No custom sizing tokens are involved; `frontend/tailwind.config.ts` extends only colours, fonts, `borderRadius`, `boxShadow` and animations.

| Surface | Viewport | Rendered CSS px | Ratio | Device px at DPR 3 |
| --- | --- | --- | --- | --- |
| Deck photo region | 390x844, emulated | 356 x 296 | 1.20 | 1068 x 889 |
| Deck photo region | 390x844, real iOS safe areas | 356 x 243 | 1.46 | 1068 x 730 |
| Deck photo region | desktop, tall (global maximum) | 382 x 296 | 1.29 | n/a |
| Match hero | under 640 wide | 326 x 128 | 2.55 | 978 x 384 |
| Match hero | 672 or wider | 608 x 160 | 3.80 | DPR 2: 1216 x 320 |

The Match hero is `w-full h-32 sm:h-40 object-cover rounded-market-md mb-3` (`frontend/src/pages/ResultsPage.tsx:30-35`) inside a `max-w-2xl` page column with `px-4` plus the card's own `p-4` (`ResultsPage.tsx:487`, `:55`, `:118`).

**Required aspect ratio: 4:3.** The Deck photo region's ratio moves between 1.20 and 1.46 as the viewport and OS insets change. A 4:3 (1.333) master sits in the middle of that band and loses at most ~11% to `object-cover` at either extreme; a 3:2 master would lose 20% at the narrow end. Spoonacular's own default is 312x231 = 1.351, so 4:3 is also what the Deck is already tuned to.

**Required dimensions: 1200 x 900.** That covers the largest real demand — the desktop Match hero at 608 CSS px x DPR 2 = 1216 device px — and the mobile Deck photo at DPR 3 (1068 device px) with margin. There is no second variant: `RetryingPhoto` renders exactly one `<img>` with no `srcset` and no `<picture>` (`frontend/src/components/RetryingPhoto.tsx:35-58`), so one file per Recipe is the shape the frontend already wants.

**Composition constraint, not a second asset.** The same 4:3 file is centre-cropped to 3.80:1 in the desktop Match hero. Whatever identifies the Recipe must live in the middle horizontal third with generous headroom, or the crowned Recipe's hero shows a plate rim and a tablecloth. This is a prompt rule, not a pipeline branch.

**File-size budget: 110 KB target, 150 KB hard cap, WebP.** WebP is in Cloudflare's default cached-extension list alongside JPG, JPEG, PNG and AVIF ([Cloudflare default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)), and the repo has no CSP to amend for a new image host. At 110 KB the corpus is ~110 MB; at the cap, 150 MB — matching the ticket's estimate. The number that budget defends is Deck weight: `deckSize` is 15 (`backend/src/config/index.ts:37`), so a half-owned Deck is roughly 7 x 110 KB + 8 x 18 KB = 0.9 MB of imagery. **Archive the raw PNG masters outside the repo**, so a future re-encode (say to 900x675 at ~60 KB if Deck weight ever bites) costs nothing but CPU rather than a second generation run.

## What Spoonacular's images actually look like

Spoonacular's documented URL pattern is `https://img.spoonacular.com/recipes/{ID}-{SIZE}.{TYPE}` with available sizes **90x90, 240x150, 312x150, 312x231, 480x360, 556x370, 636x393** ([spoonacular: show images](https://spoonacular.com/food-api/docs/show-images)). The `complexSearch` response returns `"image": "https://img.spoonacular.com/recipes/716429-312x231.jpg"` — **312x231 is the default** ([spoonacular API docs](https://spoonacular.com/food-api/docs)).

This repo takes that string raw. `backend/src/services/spoonacularClient.ts:95` is the whole of it:

```ts
photoUrl: text(result.image),
```

`RecipePoolService.ts:105` passes it through to the Deck Entry unchanged. No size suffix is ever chosen, `imageType` is never read, and no `img.spoonacular.com` URL is ever assembled anywhere in the repo. Recipe photos are also **not proxied** — the only photo proxy, `/api/comparison/photo` (`backend/src/api/comparison.ts:47-83`), hard-rejects anything that is not a Google Places photo name at `comparison.ts:52`. The browser fetches Spoonacular's CDN cross-origin, directly, uncached by us.

Measured bytes over the wire on 2026-08-02, four recipe IDs, all sizes returning HTTP 200:

| Size | Ratio | Observed bytes |
| --- | --- | --- |
| 312x231 (default) | 1.35 | 14,161 – 17,885 |
| 480x360 | 1.33 | 28,518 – 37,914 |
| 556x370 | 1.50 | 32,333 – 40,340 |
| 636x393 | 1.62 | 36,746 – 46,773 |

**The finding that inverts the ticket's premise.** Spoonacular's default image is 312 px wide, rendered into a photo region up to 384 CSS px wide — a 2.8x upscale at DPR 3 (1068 device px). Owned Recipes at 1200x900 will not look second-class next to that; **they will look conspicuously sharper**, and uniform sharpness across a subset of a blended Deck is itself a tell. The production risk is not "our images look worse", it is "our images look like a different product". Two consequences: (a) the prompt set must deliberately vary framing, lighting, surface and crop across the corpus so 1000 images do not share one visual signature; (b) matching Spoonacular's *style* — overhead or 45 degrees, domestic table settings, no studio gloss, no garnish theatre — matters more than matching its resolution.

**A cheap adjacent win, out of scope here.** Rewriting the `-312x231` suffix to `-636x393` at `spoonacularClient.ts:95` is a one-line change that would roughly triple the Spoonacular side's resolution for ~25 KB more per image. All four sampled recipes served all four sizes, but that is a sample of four; per-recipe availability needs checking before anything depends on it. Filed here as an observation, not a recommendation — it belongs to a different ticket.

## Hosting

The starting state matters. The zone `dinder.it.com` is on the **Cloudflare Free plan**, Cloudflare is authoritative, and both frontend hosts are proxied (`docs/evidence/cloudflare/*.json`, issues #149/#153). The **backend is explicitly never proxied** — `cloudflare/zone-manifest.json` lists `"backend"` in `neverProxyCategories`. Exactly one cache rule exists, `Dinder HTML cache`, and it matches only `Accept: text/html` on the two frontend hosts, so it does not touch anything image-shaped. Free plan allows 10 cache rules; 1 is used (`docs/evidence/cloudflare/provider-capabilities.md:32`). There is **no Railway volume anywhere** in the repo, and Railway custom-domain slots on the frontend service are already exhausted at 2 of 2 on Hobby (`provider-capabilities.md:8`). The Supabase project `hcjuqvicwuszwqkreklc` is `dinner-decider-live` in region **`ap-southeast-2`** (Sydney) on the **Free** plan, and Storage is entirely unused today — the only hits repo-wide are commented-out stanzas in `supabase/config.toml`.

The ticket cites `docs/production-cold-load-cdn-plan.md`. **That file does not exist**, on disk or in git history. The equivalent authority is `docs/evidence/cloudflare/` plus `cloudflare/*.json`, used above.

| Dimension | Cloudflare R2 | Supabase Storage | Railway volume |
| --- | --- | --- | --- |
| Storage cost, 0.15 GB | **$0.00** (10 GB-month free) | $0.00 on Free (1 GB), $0.00 on Pro (100 GB) | $0.15/GB/mo, ~$0.02 |
| Egress | **Free** | 5 GB/mo Free, 250 GB/mo Pro, then $0.03–0.09/GB | $0.05/GB, uncapped |
| Plan cost to use in production | $0 | $0 on Free, **$25/mo** for Pro | $5–20/mo Railway plan (already paid) |
| Reads | 10M Class B/mo free | counted as egress | counted as egress |
| Edge presence for Australia | Cloudflare PoP (MEL confirmed live) | Basic CDN on Free, Smart CDN is Pro-only | none, origin only |
| Cold-miss origin | R2, `oc` location hint available | **Sydney (`ap-southeast-2`)** | Railway region, undeclared in repo |
| Cache behaviour | default-cached extensions + 9 spare cache rules | `cf-cache-status` on a Cloudflare-fronted origin | whatever Caddy sets; **no CDN in front** |

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) — Standard storage `$0.015 / GB-month`, Class A `$4.50 / million requests`, Class B `$0.36 / million requests`, egress `Free`, free tier `10 GB-month / month`, `1 million` Class A and `10 million` Class B requests per month; [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/) — location hints include `apac` and `oc` (Oceania), *"a best effort and not a guarantee"*; [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) — a custom domain enables *"WAF custom rules, caching, access controls, or Bot Management"* while *"Public access through r2.dev subdomains is rate-limited and should only be used for development purposes"*; [Supabase pricing](https://supabase.com/pricing) — Free `1 GB included` storage and `5 GB included` cached egress with Basic CDN, Pro at $25/mo with `100 GB included, then $0.0213 per GB` and `250 GB included, then $0.03 per GB` cached egress plus Smart CDN; [Supabase Storage CDN](https://supabase.com/docs/guides/storage/cdn/fundamentals) — a cache miss *"pings the origin server in the same region as your project"*; [Railway pricing](https://docs.railway.com/reference/pricing/plans) — `$0.15 / GB / month` volume storage and `$0.05 / GB` network egress.

**Railway volume: reject.** It is the only option with metered per-GB egress, there is no volume in the repo to extend, and — decisively — the backend is excluded from Cloudflare by policy, so every image byte would be an unproxied origin fetch from a Railway region to Australia. The measured value of edge presence here is not theoretical: document TTFB from Melbourne went from ~190–254 ms direct-to-Railway to ~19–23 ms via Cloudflare (`docs/evidence/route-performance/`). Serving 1000 images off the origin discards exactly that.

**Supabase Storage: rejectable, but the runner-up.** The Sydney origin is genuinely the best cold-miss story of the three, and 150 MB fits the Free tier's 1 GB. Against it: the org is on **Free**, where Supabase *"may pause applications on the Free Plan that exhibit low activity in a 7-day period"* and explicitly recommends *"Upgrade to Pro to guarantee that we won't pause your project for inactivity"* ([going into prod](https://supabase.com/docs/guides/platform/going-into-prod)); Smart CDN is Pro-only; and Free's 5 GB/mo cached egress is only ~45,000 image loads at 110 KB. Buying Pro to host 150 MB of static bytes is **$25/mo, 21% of the entire #228 reopen trigger, for a capability R2 gives away**. There is also an architectural cost: ADR 0001 draws a strict Redis/Supabase boundary (*"session state never touches Supabase, and the social graph never touches Redis"*), and ADR 0008 says *"The browser uses Supabase Auth only; all application-table access belongs to backend stores and reaches the frontend through backend contracts."* Public image bytes fetched straight from the browser fit neither side of that line and would need the boundary re-argued. R2 needs no ADR amendment because it is not in the boundary at all.

**Cloudflare R2 behind a custom domain: recommended.** At 0.15 GB and 1000 objects it is free with about 80x headroom on storage and roughly 300x on Class B operations, egress is free by policy rather than by allowance, and *"R2 is free to get started with included free monthly usage"* with no paid Workers plan required ([R2 get started](https://developers.cloudflare.com/r2/get-started/)). Binding it to `img.dinder.it.com` on the existing zone adds a proxied record to a zone Cloudflare already controls, consumes **no Railway custom-domain slot**, and puts the bytes on the same Melbourne edge already measured at ~20 ms TTFB. Concretely:

- Bind the bucket to a custom domain, not `r2.dev` — the r2.dev subdomain is rate-limited and documented as development-only.
- Set `Cache-Control: public, max-age=31536000, immutable` as object metadata at upload, and use content-hashed object keys. This mirrors the contract the frontend's fingerprinted `/assets/*` already has in `Caddyfile:41-44`, so a changed image is a new key, never a purge.
- Add **one** cache rule for the images host with a long edge TTL. The existing `Dinder HTML cache` rule sets `edge_ttl.mode: "bypass_by_default"` but only within its own expression, which images cannot match; the default extension list would cache WebP anyway. The explicit rule costs 1 of 9 remaining Free-plan slots and removes the ambiguity.
- Consider the `oc` location hint at bucket creation. It only affects cold misses, which after the first week are nearly nonexistent.

**No frontend change is needed.** `resolvePhotoUrls` only rewrites paths beginning with `/` (`frontend/src/services/apiClient.ts:206-210`); an absolute `https://img.dinder.it.com/...` passes through untouched. There is no CSP in the repo to amend.

**The repo itself, for completeness.** 150 MB of images committed to git would in fact be served through Cloudflare today (the frontend origin is proxied and Caddy serves `frontend/dist`) at $0. It is rejected for the reason the ticket gives — every clone, every CI checkout and every Railway build image carries the 150 MB forever, and git has no delete — and because map [#310](https://github.com/Zacplischka/dinner_app/issues/310) already settled that images live in object storage while the corpus data lives in the repo.

## Posture: disclosure, ownership, commercial use

**Ownership, Google (quotable in full).** Under *Use of Generated Content*: *"Some of our Services allow you to generate original content. Google won't claim ownership over that content. You acknowledge that Google may generate the same or similar content for others and that we reserve all rights to do so. As required by the API Terms, you'll comply with applicable law in using generated content, which may require the provision of attribution to your users when returned as part of an API call."* ([Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms)). Note the second sentence: output is not exclusive, so a Recipe image is not a defensible asset, only a usable one.

**Ownership, OpenAI: could not be quoted from the primary source.** Every relevant page — `openai.com/policies/business-terms/`, `.../row-terms-of-use/`, `.../usage-policies/`, and `help.openai.com` — returned HTTP 403 to non-browser clients on 2026-08-02, and the first-party PDF at `cdn.openai.com/osa/openai-services-agreement.pdf` uses subset font encoding that does not extract to text. Search result snippets consistently describe an *"Ownership of Content"* clause assigning OpenAI's right, title and interest in Output to the customer, but **a snippet is not a primary source and this document will not pass one off as one.** This is a one-minute browser check, and it is a hard gate before the run is paid for — see the open items at the end.

**Data use is a real difference between the two vendors, and it favours paid tiers.** Gemini's free tier says plainly *"Used to improve our products: Yes"*, and under Unpaid Services *"Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services"*, while for Paid Services *"Google doesn't use your prompts... or responses to improve our products"* ([Gemini API terms](https://ai.google.dev/gemini-api/terms), [pricing](https://ai.google.dev/gemini-api/docs/pricing)). No image model has a free tier at all, so this is academic for generation — but the prompt set encodes the corpus's re-authoring work and is worth keeping on a paid tier regardless.

**Commercial use is permitted and unremarkable.** Gemini's Use Restrictions scope the API to *"developers building with Google AI models for professional or business purposes, not for consumer use"* — which describes exactly this use, an offline build run by a developer whose *output* ships in a consumer app. One clause to note if the app ever ships into Europe: *"You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom"* ([Gemini API terms](https://ai.google.dev/gemini-api/terms)). It does not bite here — no API client is exposed to end users; images are generated once, offline, and served as static files.

**Disclosure: yes, one line, once — not a badge on every card.** Three sources point the same way and none of them demands per-image labelling.

1. Google's Prohibited Use Policy forbids *"Misrepresenting the provenance of generated content by claiming it was created solely by a human, in order to deceive"* ([Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy)). The prohibition is on the affirmative false claim. Saying nothing is not a violation; captioning a generated image as a photograph of the finished dish would be.
2. Australian Consumer Law is the binding regime for this app's users. The ACCC states that *"Any information or claim that a business provides about its products or services must be accurate, truthful and based on reasonable grounds"* and that *"Any statement that creates a false impression about goods and services can be breaking the law"*, and treats misleading **images** as capable of creating that impression ([ACCC: false or misleading claims](https://www.accc.gov.au/business/advertising-and-promotions/false-or-misleading-claims); the underlying provisions are ss 18 and 29 of the Australian Consumer Law, Schedule 2 to the [Competition and Consumer Act 2010](https://www.legislation.gov.au/C2004A00109/latest/text)). The exposure here is not "the image is synthetic", it is "the image shows something the Recipe does not produce". A generated image of a dish the method actually makes is not misleading; a generated image that flatters the outcome is, synthetic or not.
3. EU AI Act Article 50 does not bite. Paragraph 2's obligation that synthetic output be *"marked in a machine-readable format and detectable as artificially generated or manipulated"* sits on the **provider** of the generative system, not on us, and Google satisfies it — *"All generated images include a SynthID watermark"* ([Gemini image generation docs](https://ai.google.dev/gemini-api/docs/image-generation)). Paragraph 4's deployer disclosure duty is scoped to **deep fakes** ([Article 50](https://artificialintelligenceact.eu/article/50/)). A generated plate of rendang is not a deep fake.

**Recommended posture, cheapest version that holds.** Extend the existing Cook credit line (#247) with one honest sentence — *"Recipe photography is AI-generated"* — and nothing else. Do not badge individual Deck Entries: a per-card marker would visually separate owned Recipes from Spoonacular ones, which is precisely the second-class outcome map [#310](https://github.com/Zacplischka/dinner_app/issues/310) chose the blend to avoid. The substantive obligation is not the label; it is the **quality gate rejecting any image that does not depict what the Recipe actually produces**, which is an ACL requirement, not an AI one, and which the layered gate can carry as one more structural check.

**Two operational notes.** Preserve the raw generated masters — SynthID and any C2PA metadata live in them, and re-encoding to WebP may not carry either through (unverified, see below). And because generated output is explicitly non-exclusive under Google's terms, an owned image is not an asset that can be defended; it is only one that can be used.

## Cost against the #228 trigger

[#228](https://github.com/Zacplischka/dinner_app/issues/228) fixed the reopen trigger as *"Fixed monthly cost crosses $120/mo — roughly double the current floor"*, the floor being the *"~$58/mo fixed floor (Spoonacular Cook $29 + Apify Starter $29)"*.

| Line | Amount | Kind |
| --- | --- | --- |
| 1000 images, `gpt-image-2` medium 1536x1024, Batch | $20.50 | one-time |
| Prompt input tokens, ~250 x 1000, batch rate | $0.63 | one-time |
| 40% regeneration allowance for gate rejects | $8.20 | one-time |
| Pilot batch, ~30 images x 2 models, synchronous | $2.50 | one-time |
| **One-time build total** | **~$32** | **capex** |
| R2 storage, 0.15 GB of 10 GB free | $0.00 | monthly |
| R2 egress | $0.00 | monthly |
| R2 Class A (1000 uploads of 1,000,000 free) | $0.00 | monthly |
| R2 Class B (cache misses, of 10,000,000 free) | $0.00 | monthly |
| **Ongoing hosting total** | **$0.00/mo** | **fixed cost** |

The fixed monthly floor stays at ~$58/mo. The build is capital expenditure paid once and is not a fixed monthly cost at all. **The $120/mo trigger is not approached, and this decision does not move it.** For contrast, the runner-up host would: Supabase Pro at $25/mo takes the floor to ~$83/mo, consuming 21% of the headroom between the current floor and the trigger to host 150 MB of static bytes.

The trigger that would matter later is R2's free tier, and it is far away: storage would need 66x growth (10 GB is roughly 66,000 images at this budget) and Class B operations would need ~10 million monthly cache misses.

## The pilot protocol this document cannot substitute for

Map [#310](https://github.com/Zacplischka/dinner_app/issues/310) already requires a pilot batch taken end to end. Attach the model decision to it rather than to this document:

1. Pick 10 Recipes that stress named-dish adherence — dishes with a specific, recognisable, non-generic plated form (rendang, okonomiyaki, shakshuka, bibimbap, cacio e pepe) rather than "chicken pasta".
2. Generate each at 1536x1024 medium on `gpt-image-2` and at 1K 4:3 on `gemini-3.1-flash-lite-image`, synchronous, one attempt per Recipe, no cherry-picking. Cost: 10 x ($0.041 + $0.0336) = **$0.75**; run it twice for a seed-variance read and it is still about **$1.50**.
3. Crop, downscale to 1200x900, encode WebP, and **render them in a real Deck interleaved with Spoonacular cards on a 390-wide phone**. Judge at card size, next to the real neighbours, not at full resolution in an image viewer.
4. Score three things and nothing else: (a) is it recognisably *that named dish*; (b) does it survive the 3.80:1 Match-hero centre crop; (c) placed among Spoonacular cards, can a stranger point at the generated ones.
5. Record the observed per-image byte size after encode, and confirm the 110 KB budget survives real food photography.

Criterion (c) is the one this ticket exists for, and it is the one no leaderboard can answer.

## Items not confirmable from documentation alone

- **OpenAI's output-ownership clause was not read from a primary source.** All `openai.com` policy pages and `help.openai.com` returned HTTP 403 to non-browser clients on 2026-08-02, and the first-party services-agreement PDF does not extract to text. Open `openai.com/policies/business-terms/` in a browser and confirm the *Ownership of Content* clause before paying for a `gpt-image-2` run. If it does not say what the snippets say, `gemini-3.1-flash-lite-image` at $16.80 batch is the fallback and its terms are quoted in full above.
- **`gpt-image-2` token cost at non-tabulated sizes is unknown.** Only 1024x1024, 1024x1536 and 1536x1024 are priced. The recommendation avoids the question by generating at a priced cell, but if a native 4:3 generation is ever preferred, measure the actual billed tokens on the pilot rather than interpolating by pixel count — the published table is explicitly non-monotonic in pixels.
- **Gemini's own docs and pricing page disagree on 2K/4K token counts.** The pricing footnote gives 2K = 1680 and 4K = 2520 tokens for `gemini-3.1-flash-image`; the image-generation aspect-ratio table gives 1120 and 2000 for the same model. Immaterial at 1K, which both agree is 1120 tokens, but do not build a budget on the 2K/4K figures without resolving it.
- **Whether SynthID and C2PA metadata survive a WebP re-encode is untested.** Assume they do not; keep the raw masters.
- **Spoonacular per-recipe size availability is a sample of four.** All four IDs served all four sizes tested, but nothing in the documentation guarantees every recipe has every size.
- **Railway's deployment region is not declared anywhere in the repo** — it is dashboard-only state. The Railway-volume rejection does not depend on it, but any future latency claim about the origin would.
- **Real encoded byte size at 1200x900 is an estimate** (90–130 KB) until the pilot measures it on actual generated food photography.
- **Verbatim text of Australian Consumer Law ss 18 and 29 was not extracted.** The Federal Register of Legislation serves the Act through a client-rendered shell and AustLII blocks non-browser clients; the regulator's own statement of the rule is quoted instead. Immaterial to the recommendation, which does not turn on the exact wording.
- **Cloudflare Images** ([pricing](https://developers.cloudflare.com/images/pricing/): `$5 / 100,000 images stored / month`, `$1 / 100,000 images delivered / month`, `First 5,000 unique transformations included + $0.50 / 1,000 unique transformations / month`) was evaluated and not recommended: it would cost roughly $0.05/mo to store and adds a transformation pipeline to solve a problem — multiple variants — that a single 1200x900 file and one `<img>` tag do not have.
