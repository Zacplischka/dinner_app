# What Australians actually cook for dinner, and how ~1000 Recipes should be allocated

Research for [#312](https://github.com/Zacplischka/dinner_app/issues/312), on map
[#310](https://github.com/Zacplischka/dinner_app/issues/310) (Owned Recipe Store).
Investigated 2026-08-02.

Every claim is cited to the source that owns it. Numbers taken from trade-press reports of
a first-party survey, rather than from the survey release itself, are labelled
**[secondary]**. Numbers that are my own judgement rather than measured evidence are
labelled **[extrapolated]**, with the basis given. Section 11 is a full register of both.

---

## 1. The three answers that matter

**1. `1000` is the wrong target for the promise the chip vocabulary implies, by 4–5×.**
For a single-cuisine, single-diet, main-course Craving to *always* deal a full 15-card
Deck across the vocabulary costs **~4,400 dishes at an absolute authored-to-spec floor**,
and **~5,250 for main course alone at natural diet yields** — before dessert, salad, soup,
side dish, breakfast or snack exist at all. Section 6 works the arithmetic honestly.

**2. `~1,160` is the right target, for a promise that is honestly narrower:** *main course
× any single cuisine deals a full 15 and survives one Restart; diet always relaxes;
non-main meal types relax on cuisine.* That is 915 main courses across 15 cuisine buckets
plus 245 across the other six meal types. Section 8 allocates it, cell by cell.

**3. The premise that Spoonacular is "the breadth answer" is false for narrow Cravings.**
Measured live against the API using the app's own query shape, **76 of the 84
(cuisine × diet) main-course cells return fewer than 15 recipes today, with the vendor
fully healthy** — and 5 of the 14 bare cuisine chips do too. Spoonacular returns **zero**
results for *spaghetti bolognese*, *pad thai*, *laksa*, *roast lamb* and *fish and chips*.
For most of the chip vocabulary the owned corpus is not a fallback. It is the only supply
there has ever been. That is a live product defect the corpus fixes before Spoonacular ever
goes dark. Section 5.

---

## 2. Method, and how sources are graded

Three kinds of source were used, in descending trust.

1. **Measured directly.** The Spoonacular catalogue was probed live through the same
   `/recipes/complexSearch` query shape the app builds in
   `backend/src/services/spoonacularClient.ts` — `type`, `cuisine`, `diet`,
   `instructionsRequired=true`, `addRecipeInformation=true`, `fillIngredients=true` —
   reading `totalResults`. Deck and pool mechanics were read out of
   `backend/src/services/RecipePoolService.ts` and `backend/src/config/index.ts`. These are
   facts, not estimates.
2. **First-party statistical and survey releases.** ABS, peer-reviewed analysis of ABS
   microdata, MJA, CSIRO, MLA, McCrindle fieldwork, platform year-in-review order data,
   live meal-kit menus counted by hand.
3. **Trade-press reports of first-party surveys**, used only where the release itself is
   not public, and always labelled **[secondary]**.

### Two source classes were deliberately rejected

**Google's *Year in Search* recipe list.** It is the obvious thing to reach for and it is
the wrong instrument. Google states its own methodology plainly: *"The 'trending' queries
are the searches that had the highest spike in traffic over a sustained period in 2025 as
compared to 2024."*
([Google Australia, Year in Search 2025](https://blog.google/intl/en-au/products/explore-get-answers/australia-year-in-search-2025/))
It ranks **acceleration, not volume**. Australia's 2025 list reads: hot cross bun recipe,
pink salt trick recipe, Dubai chocolate recipe, Easter recipes, pornstar martini recipe,
Japanese mounjaro recipe, bacon dessert recipes, cloud cake recipe, ninja slushie recipes,
Turkish pasta recipe. Not one is a weeknight dinner. A demand-weighted corpus built from
that list would be a corpus of novelties.

**Supermarket "most popular recipe" lists, unless the methodology is checked.** Woolworths'
"most popular recipes of 2023" is explicitly **Google search-trend data, not Woolworths
sales data** — which is why it is topped by *Coronation quiche* and the *Grimace shake*
([Woolworths](https://www.woolworths.com.au/shop/articles/most-popular-recipes-of-2023)).
Woolworths' separate list of recipes most *viewed on woolworths.com.au* is the usable
signal and reads completely differently: cob loaf dip, beef stroganoff, chicken pesto
pasta, baked feta pasta.

### One gap that shapes everything below

**No Australian statistical agency reports food consumption by eating occasion.** Both the
2011–12 and the 2023 ABS nutrition releases were checked. There is no ABS table of "what
Australians ate at dinner". Dish-level dinner evidence therefore comes from exactly one
place — a peer-reviewed analysis of the ABS microdata (§3.1) — and everything else in this
document triangulates around it.

---

## 3. What Australians actually cook at dinner

### 3.1 Dish level — the only national, occasion-level dinner evidence there is

> Sui Z, Raubenheimer D, Rangan A. "Exploratory analysis of meal composition in Australia:
> meat and accompanying foods." *Public Health Nutrition* 2017;20(12):2157–2165.
> doi:[10.1017/S1368980017000982](https://doi.org/10.1017/S1368980017000982) —
> [PMC10261568](https://pmc.ncbi.nlm.nih.gov/articles/PMC10261568/)

An analysis of the ABS **2011–12 National Nutrition and Physical Activity Survey** microdata
(n = 12,153 respondents aged 2+, first 24-hour recall). Dinner dishes consumed by more than
1.0% of the population (Table 5):

| Rank | Dish category | % of population | Nearest chip |
|---:|---|---:|---|
| 1 | Chicken meal | 8.8% | *(none)* |
| 2 | Beef steak / grilled meal | 8.4% | *(none)* |
| 3 | Beef pasta dish | 4.7% | italian |
| 4 | Lamb steak / grilled meal | 3.3% | *(none)* |
| 5 | Sausage grilled meal | 2.4% | *(none)* |
| 6 | Beef casserole meal | 2.2% | *(none)* |
| 7 | Pork steak / grilled meal | 2.2% | *(none)* |
| 8 | Pizza with ham | 2.1% | italian |
| 9 | Pizza with bacon | 2.1% | italian |
| 10 | Chicken curry meal | 2.0% | indian |
| 11 | Chicken stir-fry meal | 2.0% | chinese |

Composition facts from the same paper: **75.2% of the population ate meat/poultry/fish at
dinner**, so **24.8% of dinner occasions contained none**. By meat type — beef 26.8%,
chicken 24.0%, processed meat 14.8%, fish/seafood 10.7%, lamb 5.9%. Accompaniments at
dinner — non-starchy vegetables 74.1%, grains 56.2%, starchy vegetables 45.6%.

**This is the most important table in the document, and it has a hole in it.** Ranks 1, 2,
4, 5, 6 and 7 — **27.3% of the population's dinner occasions** — are the
grill-roast-and-casserole Australian/British-derived home cooking that **maps to no cuisine
chip at all**. Italian, the largest chipped cuisine, accounts for 8.9%.

The survey is 2011–12 and no newer occasion-level release exists. Treat the *ranking* as
durable and the *absolute percentages* as dated — but note that every independent source in
§3.2–§3.5, running to 2026, points the same way.

### 3.2 The current national picture — ABS 2023

The ABS nutrition survey has since been re-run and released. It corroborates the shape
without breaking it out by occasion.

**ABS, *National Nutrition and Physical Activity Survey, 2023*** (nutrition component of
the Intergenerational Health and Mental Health Study; fieldwork Jan 2023 – Mar 2024;
released 5 Sep 2025) —
https://www.abs.gov.au/statistics/health/food-and-nutrition/national-nutrition-and-physical-activity-survey/latest-release
· **ABS, *Food and nutrients, 2023*** —
https://www.abs.gov.au/statistics/health/food-and-nutrition/food-and-nutrients/latest-release

**"Cereal-based mixed dishes" is the dinner-shaped category, and 52.0% of Australians aged
2+ ate one on the survey day.** Within it: **sandwiches and filled rolls 23.8%, pasta and
noodle dishes 13.0%, burgers 8.3%, pizza 6.8%.** (In 2011–12 the same parent category was
35%, with pasta/noodle 14%, burgers 7%, pizza 6% —
[ABS 2011-12](https://www.abs.gov.au/statistics/health/food-and-nutrition/food-and-nutrients/2011-12).)
Meat and poultry products and dishes were eaten by 62.2%; fish and seafood by only 14.3%.

**Chicken is the dominant dinner protein by every independent measure.** Three sources, one
conclusion:

| Source | Measure | Poultry | Red meat |
|---|---|---:|---:|
| ABS, *Apparent Consumption of Selected Foodstuffs, 2023-24* ([release](https://www.abs.gov.au/statistics/health/food-and-nutrition/apparent-consumption-selected-foodstuffs-australia/latest-release)) | g/capita/day, retail scanner | **50.6** | 48.0 (beef+lamb+pork) |
| ABS, *Consumption of food groups from the ADG, 2023* ([release](https://www.abs.gov.au/statistics/health/food-and-nutrition/consumption-food-groups-australian-dietary-guidelines/2023)) | share of lean-meat serves | **30.1%** | 33.9% (all unprocessed red) |
| ACMF / ABARES Dec Q 2025 ([facts](https://chicken.org.au/our-product/facts-and-figures/)) vs MLA *State of the Industry 2023-24* ([PDF](https://www.mla.com.au/globalassets/mla-corporate/prices--markets/documents/trends--analysis/soti-report/mla-state-of-the-industry-report-2324-web.pdf)) | kg/capita/year | **~55** | 23.4 beef + 7.1 lamb |

ABS reports poultry **up 13% since 2018–19** and processed meats **down 12%**
([ABS media release, 28 Mar 2025](https://www.abs.gov.au/media-centre/media-releases/australians-eating-more-meat-less-chocolate)).
Australia is also the **world's largest per-capita sheepmeat consumer** and third for beef
(MLA, citing OECD-FAO). Lamb is small in frequency but distinctively Australian, and the
corpus should carry it rather than treat it the way a US catalogue would. The remaining
lean-meat serves split: nuts and seeds 12.8%, fish and seafood 9.8%, eggs 8.6%, legumes
including tofu 4.8%.

### 3.3 Ranked, most-cooked dish data from Australian recipe sites

This is the highest-signal evidence for the named dish list, because it is volume data over
a full year from AU-audience sites, published with a stated methodology.

**taste.com.au (News Corp, Australia's largest recipe site)** publishes several rankings,
each on a *different* metric, and the metric matters enormously:

- **"Most popular dinner recipes in Australia for 2024"** — *"the 100 most-cooked meals of
  the year"*. Top 20: 1. Creamy French onion chicken pasta bake 2. Easy curried prawns
  3. Pumpkin, spinach and lentil lasagne 4. Potato and leek soup 5. **Curried sausages**
  6. Easy fried rice 7. **Impossible quiche** 8. Easy butter chicken 9. **Beef stroganoff**
  10. Our favourite lasagne 11. Creamy chicken pesto pasta 12. Chicken and sweet corn soup
  13. **Australia's favourite classic zucchini slice** 14. Classic beef burger
  15. Creamy fettuccine carbonara 16. Hearty chicken and vegetable soup 17. Savoury mince
  18. Slow cooker braised steak and onions 19. Air fryer roast pork belly 20. Spaghetti
  carbonara —
  [gallery](https://www.taste.com.au/galleries/most-popular-dinner-recipes-australia-2024/8s6ugyu5)
- **"Our 100 most-saved dinners of all time"** (~1M saves) — top 10: air fryer chicken
  rissoles, one-pot Italian chicken, creamy chicken bacon and cauliflower bake, impossible
  quiche, creamy French onion chicken pasta bake, one-pan creamy chicken and bacon, creamy
  garlic prawns, pumpkin spinach and lentil lasagne, ultimate easy pumpkin soup, slow cooker
  beef stroganoff —
  [gallery](https://www.taste.com.au/dinner/galleries/our-100-most-saved-dinners-time/7fxd7svx)
- **"Our most searched-for dinners of all time"** — *"thousands of searches for dinner
  recipes every day… the nation's top 30 most searched for dinners, year in year out"*.
  **#1 is beef stroganoff**, then cottage pie, teriyaki chicken fried rice, French onion
  crustless quiche, vegetarian lentil and pumpkin lasagne —
  [gallery](https://www.taste.com.au/galleries/our-most-searched-dinners-time/55td2u0g),
  [article](https://www.taste.com.au/articles/taste-aus-top-10-most-searched-dinner-recipes/9kvo263f)
- **"Australia's top 100 dinners of the past 5 years"** —
  [gallery](https://www.taste.com.au/dinner/galleries/australias-top-100-dinners-past-5-years/2n2wpl6a)

**bestrecipes.com.au** (News Corp, community site) publishes *"as cooked by you, the top
100 most popular dinners of 2025"*. Top 20: 1. Our favourite apricot chicken 2. Quick and
easy quiche 3. **Slow cooker silverside** 4. Satay chicken 5. Creamy pasta salad
6. **Aussie meat pie** 7. Easy and delicious chow mein 8. **Savoury lamb chop casserole**
9. Easy salmon mornay pasta bake 10. Slow cooker massaman curry 11. Mum's porcupine
meatballs 12. **Braised steak and onions** 13. Slow cooker osso buco 14. Slow-cooked pumpkin
soup 15. **No-fuss pasties** 16. **Devilled sausages** 17. Leftover roast fritters
18. Chicken and bacon carbonara 19. **Savoury curry mince** 20. Slow cooker beef stew —
[gallery](https://www.bestrecipes.com.au/galleries/our-most-popular-dinner-recipes-2025/ahe6qwno)

**delicious.com.au**, *"The 100 most-cooked delicious. recipes of 2025"* —
[gallery](https://www.delicious.com.au/recipes/group/gallery/most-popular-delicious-recipes-last-year/po4ewmkn).
**Australian Women's Weekly Food**, top 10 saved 2026 — Greek-style lemon chicken rice with
fetta, hummingbird cake, **zucchini slice**, chicken stroganoff, **lamb forequarter chops
tray bake**, honey mustard chicken tray bake, creamy chicken bacon & pumpkin, **rissoles
with sweet potato mash** —
[list](https://www.womensweeklyfood.com.au/in-the-test-kitchen/top-10-saved-recipes-of-2026/).

**The convergent core across every volume-based Australian list** — the dishes that appear
on taste's most-cooked, taste's most-saved, taste's most-searched, bestrecipes' community
top-100 and Women's Weekly's saves alike:

> beef stroganoff · curried sausages · spaghetti bolognese · lasagne · shepherd's and
> cottage pie · carbonara · zucchini slice · impossible quiche · apricot chicken ·
> butter chicken · tuna mornay and tuna pasta bake · chicken pesto pasta · fried rice ·
> chow mein · san choy bow · pumpkin soup · chicken and sweet corn soup · rissoles ·
> meatloaf · potato bake · satay chicken · massaman and mango curry · corned silverside ·
> lamb shanks · braised steak and onions

That list is the corpus's spine, and **most of it belongs to no cuisine chip**.

**A methodological warning worth carrying into the pipeline.** taste's *most-searched* list
(pancakes, banana bread, guacamole) looks nothing like its *most-saved dinners* list
(rissoles, chicken bakes, curries), and Google's *trending* lists look like neither. The
four highest-signal sets are the cook/save/view-volume lists over a full year or longer on
AU-audience sites — taste 2024 most-cooked, taste most-saved, taste 5-year, bestrecipes
2025, delicious 2025. Nothing else should be weighted.

### 3.4 Cuisine demand

**taste.com.au, "Taste the World" survey, n = 2,300+ Australians (2025). [secondary]** —
the release is not public; the finding is reported consistently across trade press:
*"Modern Australian, Italian, Chinese, Mexican, and Indian dishes dominate home kitchens"*;
Greek is the **#1 cuisine Australians want to cook more at home**; Australians cook an
average of **three different cuisines each week**; **63%** want to expand their range;
**77% of Gen Z name pasta as a go-to meal**.
([Mediaweek](https://www.mediaweek.com.au/taste-com-au-launches-taste-the-world),
[Marketing-Interactive](https://www.marketing-interactive.com/taste-com-au-launches-taste-the-world-as-australians-embrace-global-flavours))
The top-ranked answer in the largest Australian recipe site's own audience survey is
**Modern Australian** — a chip that does not exist.

**Uber Eats Australia, 2022 Cravings Report** (first-party order data) — top 5 cuisines
nationally: **1. Indian 2. Thai 3. Chinese 4. Italian 5. Middle Eastern**
([Uber AU Newsroom](https://www.uber.com/au/en/newsroom/cravings2022/)).
**DoorDash Australia, 2025 Delivery Trends Report** (order data; ranked list is 2024) — top
10 items: **1. Chips 2. Garlic naan 3. Butter chicken 4. Potato cakes/scallops 5. Special
fried rice 6. Garlic bread 7. Pad thai 8. Dim sum 9. Steamed rice 10. Honey chicken**
([DoorDash AU](https://merchants.doordash.com/en-au/blog/australia-online-ordering-habits)).
**Uber Eats Australia, 2025 Cravings Report** — top dish NSW/ACT is **Pad Thai**; QLD, VIC,
TAS and WA is **hot chips**; SA/NT is **garlic bread and naan**
([Uber AU Newsroom](https://www.uber.com/au/en/newsroom/uber-eats-hits-one-billion-deliveries-and-reveals-australias-biggest-cravings-of-2025/)).
**Woolworths**, in its own words, names the weeknight default as *"Taco Tuesdays, an easy
stir fry or a spag bol"*
([Woolworths Group, 2026](https://www.woolworthsgroup.com.au/au/en/our-newsroom/latest-news/2026/woolworths-shakes-up-home-cooking-with-70-new-globally-inspired-.html)).

Delivery-platform data measures *takeaway* and skews to precisely the dishes people do
**not** cook. It is used here only to corroborate which cuisines Australians want, never as
the primary weight.

**Structural demand — ABS Census 2021 and current population by country of birth.** Cuisine
demand has a demographic floor that does not move quickly.
[Cultural diversity: Census, 2021](https://www.abs.gov.au/statistics/people/people-and-communities/cultural-diversity-census/latest-release):
**Chinese is the largest non-Anglo-Celtic ancestry at 1,390,639 (5.5%)**; Italian is 7th at
~1.1 million ([ABS](https://www.abs.gov.au/articles/cultural-diversity-australia));
overseas-born 27.6%. Languages used at home include **Mandarin 685,274 (2.7%), Arabic
367,159 (1.4%), Vietnamese 320,758 (1.3%), Cantonese 295,281 (1.2%), Punjabi 239,033**.
By [country of birth at 30 June 2025](https://www.abs.gov.au/statistics/people/population/australias-population-country-birth/latest-release),
**India is now equal-first with England at 971,000 (3.5%)** — up 522,000 in a decade, the
largest increase of any origin — then China 731,500, New Zealand 637,700, **Philippines
412,500, Vietnam 326,600**. Overseas-born is now **32.0%**. Notably, **Italy dropped out of
the top ten countries of birth for the first time since 1901**
([ABS, Jun 2024](https://www.abs.gov.au/statistics/people/population/australias-population-country-birth/jun-2024)).

Two read-throughs. First, `indian`, `chinese` and `vietnamese` have a demographic floor that
justifies depth well beyond what Spoonacular supplies. Second, the Italian weight in the
corpus is earned by **cooking behaviour** — pasta and noodle dishes at 13.0% of the
population on a single day, taste.com.au top-2, Woolworths' "spag bol" — and not by
ancestry. That is the right basis, and worth saying out loud so nobody re-derives the
allocation from Census data alone.

### 3.5 Meal-kit menu mix — the best proxy for weeknight home cooking

A meal-kit menu is a commercially optimised guess at what Australians will actually cook on
a Tuesday, refreshed weekly, priced on being right. **HelloFresh Australia**'s live menu,
week of 8–14 Aug 2026, 80 recipes counted by hand from
[hellofresh.com.au/menus](https://www.hellofresh.com.au/menus):

| Protein | Recipes | Share |
|---|---:|---:|
| Beef (incl. 2 beef-pork) | 22 | 27% |
| Chicken | 20 | 25% |
| Fish & seafood | 13 | 16% |
| Pork / bacon / chorizo | 12 | 15% |
| **Vegetarian** | **10** | **12.5%** |
| Lamb | 3 | 4% |

The following week (15–21 Aug 2026) holds the same ratios: chicken 23, beef 19, pork 13,
fish 10, vegetarian 10, lamb 4.

Two things fall out. First, the protein mix tracks the ABS dinner data closely — two
independent sources agreeing, one a 2011–12 nutrition recall and one a 2026 commercial
menu. Second, **a demand-optimised Australian menu is 12.5% vegetarian**, which is the
number to hold against any temptation to author a third of the corpus meat-free.

Caveat the source honestly: a meal-kit menu is *supply*-optimised too — protein cost, cold
chain and shelf life all push on it — so the beef and chicken dominance partly reflects
margin, not only preference.

HelloFresh AU's on-menu badges are **format** labels (`15-MIN MEAL`, `Comfort Food`,
`Kid's Kitchen`, `Premium`), not cuisine — cuisine lives in the dish name. Across both weeks
the spread is Italian/European pasta-and-roast (heaviest), pan-Asian (Chinese, Korean,
Japanese, Thai, Vietnamese, Indonesian, Malaysian, Cambodian), Indian, Mexican/Tex-Mex,
Greek/Middle Eastern, and **Australian pub food** — parmigiana, schnitzel, rissoles,
burgers, pies, roasts. That last category, again, has no chip. **Marley Spoon** and
**Dinnerly** show the same shape ([marleyspoon.com.au/menu](https://www.marleyspoon.com.au/menu),
[dinnerly.com.au/menu](https://www.dinnerly.com.au/menu)).

### 3.6 How big is a household's dinner repertoire?

**HelloFresh Australia / McCrindle Research, *Australia's Cooking Landscape*, January
2017.** Nationally representative panel of grocery shoppers, n = 1,005, 18+, fielded
23–27 January 2017.
([Report PDF](https://australianfoodtimeline.com.au/wp-content/uploads/2020/01/HelloFresh_Australia27s-Cooking-Landscape_Report_FINAL_1Feb2017.pdf),
[infographic](https://mccrindle.com.au/app/uploads/work/HelloFresh-Infographic.pdf))

> *"Approximately how many dinner recipes or meals do you have in your repertoire (meals
> that you frequently cook and know well)?"*
> **0 → 3% · 1–5 → 31% · 6–10 → 34% · 11–20 → 17% · 21+ → 14%**

**68% of Australian households have ten or fewer dinner recipes they know well.** Also: 97%
cook on weeknights; 74% prepare 5+ of their 7 weekly dinners at home; of five weeknight
meals three are made from scratch and half of one is takeaway; **62% find deciding what to
cook at least slightly stressful**; 45% spend more than ten minutes a day deciding; **87%
want to be more adventurous in the kitchen**; and the single biggest stressor is catering to
multiple food needs and preferences (35%) — which is precisely the problem a group swipe
Deck exists to solve. Loosely corroborated by **Woolworths mid-week dinners research** —
*"nearly half (48%) of Aussie home cooks are stuck in a loop of five or fewer go-to
recipes"*
([Woolworths Group, 2026](https://www.woolworthsgroup.com.au/au/en/our-newsroom/latest-news/2026/woolworths-serves-up-380-ways-to-do-dinner-with-a-massive-range-.html)) —
though no sample size or question wording is published, so directional only.

**Why this does not shrink the corpus.** It is tempting to read "the median household knows
6–10 dinners" as "15 cards is plenty and 1000 is generous". That inference fails twice: the
15 cards are dealt to a *group* whose members do not share one repertoire, and the point of
a swipe Deck is to surface dishes the household does **not** already have in rotation — the
87% who want to be more adventurous and the 62% who find the decision stressful are the
actual users. What the number does say is that **novelty per Deck matters more than
catalogue size**, which argues for depth in the cells people pick and against thin coverage
of cells they don't. That is the thesis of §8.

---

## 4. The Spoonacular vocabularies, verbatim

Pulled from the vendor's own documentation at
[spoonacular.com/food-api/docs](https://spoonacular.com/food-api/docs) on 2026-08-02.

**Cuisines (28).** African, Asian, American, **British**, Cajun, Caribbean, Chinese,
Eastern European, European, French, German, Greek, Indian, Irish, Italian, Japanese,
Jewish, Korean, Latin American, Mediterranean, Mexican, Middle Eastern, Nordic, Southern,
Spanish, Thai, Vietnamese.

**Meal types (14).** main course, side dish, dessert, appetizer, salad, bread, breakfast,
soup, beverage, sauce, marinade, fingerfood, snack, drink.

**Diets (11).** Gluten Free, Ketogenic, Vegetarian, Lacto-Vegetarian, Ovo-Vegetarian,
Vegan, Pescetarian, Paleo, Primal, Low FODMAP, Whole30.

Two definitions from that page are load-bearing later:

- **Ketogenic** — *"55-80% fat content, 15-35% protein content, and under 10% of
  carbohydrates."*
- **Paleo** — *"Ingredients not allowed include legumes (e.g. beans and lentils), grains,
  dairy, refined sugar, and processed foods."*

`shared/types/cook.ts` narrows these to 7 meal types, 14 cuisines and 6 diets. The narrowing
of meal types and diets is sound. **The cuisine narrowing dropped `british`**, and that is
the single most consequential vocabulary decision in the Cook Branch.

---

## 5. Where the Australian picture diverges from the vocabulary

### 5.1 The largest cell in Australian dinner has no chip

Four independent sources say the same thing:

- **ABS/NNPAS**: 27.3% of dinner occasions are chicken meals, grilled steak, grilled lamb,
  sausages, casseroles and grilled pork — none chipped. Italian, the largest chipped
  cuisine, is 8.9%.
- **taste.com.au** (n=2,300+): **Modern Australian** leads the list of what dominates home
  kitchens. **[secondary]**
- **The ranked most-cooked lists** (§3.3): beef stroganoff, curried sausages, impossible
  quiche, zucchini slice, apricot chicken, rissoles, savoury mince, tuna mornay, corned
  silverside, braised steak and onions, devilled sausages, Aussie meat pie, pasties, lamb
  chop casserole — none of which is Italian, Chinese, Indian, Thai or Mexican.
- **HelloFresh AU's live menu**: parmigiana, schnitzel, rissoles, pies, roasts and burgers
  run through every week, tagged `Comfort Food` because there is no cuisine for them.

Spoonacular has a `british` value that would house most of this — shepherd's pie, bangers
and mash, roasts, pies — and `shared/types/cook.ts` does not offer it. There is no
`australian` value at all, in a 28-cuisine vocabulary that finds room for Nordic, Cajun and
Jewish.

### 5.2 The vendor's own depth, measured

Live `complexSearch` `totalResults` using the app's exact query shape, `type=main course`,
2026-08-02. **The Deck is 15 cards and the pool is 60** (`RECIPE_DECK_SIZE`,
`RECIPE_POOL_SIZE` in `backend/src/config/index.ts`):

| Cuisine chip | Spoonacular main courses | Deals 15? | Fills the 60 pool? |
|---|---:|:--:|:--:|
| mediterranean | 186 | yes | yes |
| italian | 141 | yes | yes |
| american | 126 | yes | yes |
| mexican | 100 | yes | yes |
| indian | 62 | yes | yes |
| french | 25 | yes | no |
| greek | 20 | yes | no |
| chinese | 19 | yes | no |
| japanese | 18 | yes | no |
| **thai** | **13** | **no** | no |
| **korean** | **12** | **no** | no |
| **spanish** | **8** | **no** | no |
| **vietnamese** | **7** | **no** | no |
| **middle eastern** | **6** | **no** | no |
| *(british — not a chip)* | *4* | *no* | *no* |

**5 of the 14 cuisine chips cannot deal a full Deck from Spoonacular today, with the vendor
fully healthy.** 9 of 14 cannot fill the pool. A user who picks `vietnamese` gets a 7-card
Deck and no warning — `RecipePoolService.dealDeck` returns `min(pool, deckSize)` with, in
its own comment, *"no floor and no thinness warning"*.

### 5.3 Adding a diet chip collapses it completely

Same probe, `type=main course`, every (cuisine × diet) pair. Cells reaching 15 are bolded:

| Cuisine | no diet | vegetarian | vegan | pescetarian | gluten free | ketogenic | paleo |
|---|---:|---:|---:|---:|---:|---:|---:|
| american | 131 | 10 | 4 | 14 | **62** | 7 | 9 |
| chinese | 19 | 2 | 1 | 3 | **15** | 0 | 0 |
| french | 25 | 5 | 0 | 2 | 7 | 1 | 0 |
| greek | 21 | 4 | 1 | 2 | 11 | 1 | 0 |
| indian | 62 | 12 | 5 | 9 | **54** | 9 | 4 |
| italian | 141 | 14 | 2 | 13 | **43** | 7 | 5 |
| japanese | 19 | 3 | 2 | 3 | 11 | 0 | 0 |
| korean | 12 | 0 | 0 | 0 | 8 | 1 | 0 |
| mediterranean | 187 | **23** | 3 | **17** | **61** | 9 | 5 |
| mexican | 101 | 9 | 1 | 13 | **72** | 3 | 8 |
| middle eastern | 6 | 2 | 1 | 0 | 1 | 0 | 0 |
| spanish | 8 | 0 | 0 | 2 | 6 | 0 | 0 |
| thai | 13 | 0 | 0 | 5 | 11 | 0 | 2 |
| vietnamese | 7 | 0 | 0 | 1 | 1 | 0 | 0 |

**8 of 84 cells reach 15. 76 do not.** `thai + vegetarian`, `korean + vegetarian` and
`vietnamese + vegetarian` are all **zero**. **Every ketogenic and every paleo cell fails** —
the two columns are entirely unservable at Deck depth. Gluten free is the only diet with
real vendor depth, and only in five cuisines.

The non-main meal types are no better once a cuisine chip is added. Measured the same way:

| | dessert | salad | soup | side dish | breakfast | snack |
|---|---:|---:|---:|---:|---:|---:|
| italian | 34 | 10 | 15 | 93 | 4 | 55 |
| thai | 2 | 3 | 1 | 10 | 0 | 6 |

That is the evidence behind "non-main meal types relax on cuisine" in §8 — even the vendor's
second-deepest cuisine cannot fill a salad or breakfast Deck.

### 5.4 The dishes Australians actually eat are missing by name

`complexSearch?query=…&instructionsRequired=true`, `totalResults`:

| Query | Results | Query | Results |
|---|---:|---|---:|
| **spaghetti bolognese** | **0** | **pad thai** | **0** |
| **roast lamb** | **0** | **fish and chips** | **0** |
| **chicken schnitzel** | **0** | **chicken laksa** | **0** |
| **rissoles** | **0** | **sausage roll** | **0** |
| **san choy bow** | **0** | **anzac biscuits** | **0** |
| meat pie | 10 (all US pot pies) | chicken parmigiana | 5 |
| lamb chops | 6 | shepherd's pie | 4 |
| pumpkin soup | 4 | **beef stroganoff** | **2** |
| butter chicken | 3 | sausages and mash | 1 |
| pavlova | 3 | lamingtons | 1 |

The endpoint is working — `pasta` returns 231, `roast` 144, `curry` 70, `lamb` 39. The zeros
are real. `bolognese` alone returns 7, all sauces rather than the dish; `pad thai` returns 0
by both `query` and `titleMatch`.

So: **taste.com.au's #1 most-searched dinner in Australia, year in year out, is beef
stroganoff — and Spoonacular holds two of them.** The #3 dinner by ABS occasion share
(beef pasta dish, 4.7% of the population) and the #1 takeaway dish in NSW/ACT are both
entirely absent. This is not a fallback story. It is the primary supply having a hole in the
exact shape of Australian dinner.

### 5.5 What to do about the vocabulary

**Add `british` to `CUISINES`.** It costs nothing on the vendor side — it is already a
supported Spoonacular value, so a `british` Craving still gets a real (if 4-recipe) pool
rather than a hard error — and it gives the 27.3% of Australian dinner that currently has
nowhere to live a chip of its own. The owned corpus then over-weights it heavily and becomes,
immediately and visibly, the reason that chip works at all.

Do **not** add `australian` yet. It is not a Spoonacular value, so it would be the first chip
the vendor cannot serve at all, and
[#310](https://github.com/Zacplischka/dinner_app/issues/310) explicitly parks that until
owned coverage is real. `british` is the lazy version of the same win and it is available
today. Revisit `australian` once the corpus can carry a chip alone.

---

## 6. The deck arithmetic

### 6.1 The mechanics, from the code

From `backend/src/config/index.ts` and `backend/src/services/RecipePoolService.ts`:

- `RECIPE_DECK_SIZE` defaults to **15**; `dealDeck` returns `shuffle(pool).slice(0, 15)`.
  A full Deck therefore needs **at least 15 entries matching that exact Craving**.
- `RECIPE_POOL_SIZE` defaults to **60** — the depth a Spoonacular-backed Craving holds.
- `redeal` (Restart) puts unseen entries first and only then tops up with repeats. A Restart
  deals **15 entirely fresh cards only if the cell holds at least 30**.
- Cuisines are OR'd, diets are AND'd (`spoonacularClient.ts`). Multi-cuisine Cravings get
  *easier*; multi-diet Cravings get *harder*.

So per-cell depth buys the following, and **15 is a floor rather than a target**:

| Depth in the cell | What it buys |
|---:|---|
| under 15 | A short Deck. Silently — there is no thinness warning. |
| 15 | One full Deck. Every deal is the same 15 cards. Restart is 100% repeats. |
| 30 | Restart deals 15 entirely fresh cards. Two genuinely distinct Decks. |
| 45 | Two Restarts stay fresh. |
| 60 | Parity with a Spoonacular pool — the blend is indistinguishable. |

### 6.2 The literal answer

**A single-cuisine, single-diet, main-course Craving deals a full 15-card Deck when that one
cell holds 15 dishes.** That is the trivial answer and it is not the useful one, because a
corpus is not built one cell at a time — a dish has one cuisine and one meal type but carries
a *set* of diet tags, so the diet dimension is a yield problem, not a multiplication.

For cuisine *C*, main course, diet *D*, with *y* = the share of *C*'s mains satisfying *D*,
the cell holds 15 when *C* holds **15 / y** mains.

### 6.3 Working it at natural yields

Yields for a demand-weighted Australian main-course set. These are **[extrapolated]** — no
published dataset of diet-tag yield over an Australian recipe corpus exists — but each is
anchored to a measured number, and the measured Spoonacular grid in §5.3 runs the same way.

| Diet | Assumed yield | Anchor |
|---|---:|---|
| gluten free | 45% | Grills, roasts, curries with rice, stir-fries (tamari swap) and salads are GF by construction. Spoonacular's GF column is by far its densest. Demand is real: **24.2% of Australians avoid wheat or gluten** — 20.5% partial, 3.8% complete ([MJA 2020](https://www.mja.com.au/journal/2020/212/3/incidence-and-prevalence-self-reported-non-coeliac-wheat-sensitivity-and-gluten)). |
| pescetarian | 38% | = vegetarian yield + the fish share. ABS puts fish/seafood at 10.7% of dinner meat occasions and 9.8% of lean-meat serves; HelloFresh runs 16% seafood. |
| vegetarian | 25% | HelloFresh AU's demand-optimised menu is 12.5%; ABS says 24.8% of dinner occasions had no meat/poultry/fish. 25% is the top of the honest range and already requires deliberate authoring. |
| vegan | 10% | Vegan is a subset of vegetarian, and most Australian vegetarian mains carry cheese, egg or yoghurt. |
| ketogenic | 5% | Under 10% carbohydrate by Spoonacular's own definition. Australian dinner is 56.2% grains and 45.6% starchy vegetables (ABS). Rice, pasta, potato and bread are in nearly everything. |
| paleo | 4% | Spoonacular's definition excludes grains, legumes **and** dairy. |

The binding constraint per cuisine is **paleo at 4%**, giving **15 / 0.04 = 375 main courses
per cuisine** to serve all six diets at Deck depth.

**375 × 14 cuisines = 5,250 main-course dishes.** Main course alone — before dessert, salad,
soup, side dish, breakfast or snack, each of which carries the identical 14 × 6 grid.

### 6.4 Working it at the authored-to-spec floor

You are not obliged to harvest minority diets at natural yield — you can author to spec.
Exploiting the containments (vegan is inside vegetarian is inside pescetarian; paleo and
ketogenic overlap heavily; gluten free is nearly free), the absolute floor per
(meal type × cuisine) block is:

- 15 vegan dishes, all gluten free → discharges **vegan, vegetarian, pescetarian, gluten free**
- 15 paleo dishes that are also ketogenic → discharges **paleo, ketogenic**
- 15 mainstream dishes → the no-diet-chip Craving, and the only block anyone actually picked

= **45 dishes per (meal type × cuisine)**, of which **two thirds serve diets a minority
select**, in cuisines where several of those blocks are culinary fiction. By Spoonacular's
own definitions, *paleo Chinese* cannot contain soy sauce (a legume), rice or noodles;
*paleo Italian* cannot contain pasta, bread, cheese, polenta or beans. Authoring 15 of each
is not curation, it is invention — and it directly violates the map's own standard that the
corpus serve *"what Australian households actually cook"*.

**45 × 14 cuisines × 7 meal types = 4,410 dishes**, and that number assumes perfect
diet-overlap engineering and a straight face about paleo Korean dessert.

### 6.5 The verdict on 1000

| Promise | Dishes required | vs. 1000 |
|---|---:|---|
| Every single-chip Craving deals 15 (authored-to-spec floor) | **4,410** | **4.4× short** |
| Main course only, all 6 diets, natural yields | **5,250** | **5.3× short** |
| Every single-chip Craving deals 15 *and* survives a Restart | **~8,800** | **8.8× short** |
| Main course × single cuisine deals 15, diets relax | 14 × 15 = **210** floor | comfortable |
| …deals 15 **and** survives a Restart, diets relax | 15 × 30 = **450** floor | comfortable |
| …at Spoonacular pool parity | 15 × 60 = **900** | tight |

**1000 recipes cannot make the promise the chip vocabulary implies, and no plausible corpus
can.** The 588 single-chip cells are not a coverage problem to be funded; they are a promise
that has to be withdrawn. This sharpens rather than reopens a decision
[#310](https://github.com/Zacplischka/dinner_app/issues/310) already took — *"the Craving
degrades on fallback"*. The finding is that **degradation is not the emergency path for
diets. It is the only path, permanently, and it should be designed as a feature rather than
delivered as an apology.**

And the same arithmetic run against §5.3 shows the vendor never made that promise either.
Relaxing a narrow Craving is not the owned store admitting it is second-class — it is the
owned store doing openly what Spoonacular already does silently.

---

## 7. Diets: tag existing dishes, or author dedicated ones

The question is whether diets **multiply** the corpus or **partition** it. Australian
prevalence data answers it, and the answer splits three ways.

### 7.1 What Australians actually avoid

| Diet | Best Australian number | Source |
|---|---|---|
| **Gluten / wheat avoidance** | **24.2%** avoid wheat or gluten — 20.5% partial, 3.8% complete | [MJA 2020](https://www.mja.com.au/journal/2020/212/3/incidence-and-prevalence-self-reported-non-coeliac-wheat-sensitivity-and-gluten) (Potter et al., n=1,322, 60.5% response) |
| | ~12% / 3 million follow or need a gluten-free diet | [Coeliac Australia](https://coeliac.org.au/for-business/accreditation/) (2021 member survey) |
| | 10% "all, or almost all, gluten free" | [Roy Morgan](https://www.roymorgan.com/findings/the-vast-majority-of-australians-77-feel-well-and-in-good-health) Health & Wellbeing Study, ~50k/yr |
| | Coeliac disease ~1 in 70 (1.4%) | [Coeliac Australia](https://coeliac.org.au/learn/coeliac-disease/) |
| **Vegetarian or vegan** | **5.3%** of people | **[ABS, *Dieting and food avoidance, 2023*](https://www.abs.gov.au/statistics/health/food-and-nutrition/dieting-and-food-avoidance/latest-release)** — national probability survey, peak 7.3% at ages 30–49 |
| | 12.1% "all, or almost all, vegetarian" | [Roy Morgan 2018](https://www.roymorgan.com/findings/rise-in-vegetarianism-not-halting-the-march-of-obesity), n=14,913 — self-identification, looser wording |
| | 10% vegan+vegetarian; 32% consciously limiting meat | [Food Frontier, *Hungry for Plant-Based*, 2019](https://www.foodfrontier.org/wp-content/uploads/2019/10/Food-Frontier-Hungry-For-Plant-Based-Australian-Consumer-Insights.pdf) |
| | 79% go meat-free at least one day a week | [Food Frontier 2024](https://www.foodfrontier.org/survey-reveals-australias-most-popular-diets-in-2024/), Toluna n=2,000 |
| **Meat reduction generally** | 21.4% of food avoiders are low- or meat-free | ABS 2023, as above |
| **Pescetarian** | **No Australian number exists.** ABS does not measure it; Food Frontier explicitly folds pescatarians into "Flexitarian" | — |
| **Ketogenic** | **No Australian number exists.** Closest proxy: "single-nutrient-reduced (e.g. low carb)" = 24.0% of the 24.9% on a diet, i.e. ~6% of the population, and ABS never names keto | ABS 2023 |
| **Paleo** | **No Australian number exists at all.** CSIRO publishes no prevalence estimate | — |

Two facts drive everything below. **Gluten-free is the most-demanded diet chip in Australia
by a wide margin** — gluten avoidance runs 5–20× coeliac prevalence. And **ketogenic and
paleo have no measurable Australian constituency that any first-party publisher has ever
sized.** Claims that "keto was Australia's most popular diet" trace to search-volume
commentary and commercial blogs, not survey data, and should not be cited.

### 7.2 Tag only — these partition the corpus and cost nothing extra

- **gluten free.** Australian weeknight cooking is incidentally gluten-free at a high rate:
  grills, roasts, curries with rice, stir-fries, salads, casseroles thickened with cornflour.
  The convergent-core list in §3.3 is roughly half GF-or-trivially-GF as written. The work is
  an authoring convention — specify tamari, GF stock, cornflour — plus an accurate tag, not
  new dishes. **Target: at least 45% of mains carry the tag.** This is the highest-value diet
  work in the whole corpus and it is nearly free.
- **pescetarian.** Free: it is the vegetarian set plus the fish set, both of which exist for
  their own reasons. No dish is ever authored for it.

### 7.3 Tag, with a deliberate authoring floor in the top cuisines

- **vegetarian.** A demand-optimised Australian menu is 12.5% vegetarian (HelloFresh) and
  ABS puts vegetarian+vegan at 5.3% of people, but 24.8% of ABS dinner occasions contained no
  meat and 79% of Australians go meat-free at least one day a week. Authoring to **25%** is a
  deliberate lift above prevalence, justified by the chip existing and by the meat-free-night
  behaviour rather than the identity. Set a hard floor of **15 vegetarian mains in each of the
  top 6 cuisines** so `vegetarian + italian` and `vegetarian + indian` deal a full Deck; let
  the other nine relax. Indian carries this cheaply — it is the one cuisine where the
  vegetarian canon is deep and demand-weighted at the same time.
- **vegan.** Author to ~10% of mains, spread across cuisines. `vegan` alone deals a full Deck;
  `vegan + <any cuisine>` will not, and relaxes.

### 7.4 Author a small dedicated cross-cuisine block — cap these hard

- **ketogenic** and **paleo.** Nothing incidental about Australian dinner satisfies these:
  56.2% of dinner occasions carry grains and 45.6% starchy vegetables (ABS), and Spoonacular's
  paleo definition additionally excludes dairy and legumes. At natural yield they would cost
  375 dishes per cuisine (§6.3). They also have **no measured Australian constituency**.
  **Author roughly 20 keto and 20 paleo mains as a deliberate, deliberately cuisine-agnostic
  block** — enough that the bare chip deals a full 15, and no more. `ketogenic + korean` must
  relax and always will; the vendor returns 1 recipe for it.

### 7.5 The rule that falls out

> **A diet chip on its own always deals a full Deck. A diet chip combined with a cuisine chip
> deals a full Deck only for `gluten free`, `pescetarian` and `vegetarian`, and only in the
> top 6 cuisines. Everything else relaxes and says so.**

Held against §5.3, that is a *better* guarantee than Spoonacular provides for 76 of its 84
cells today.

---

## 8. The proposed allocation

**Total: ~1,160 dishes.** 915 main courses across 15 cuisine buckets, 245 across the other six
meal types. This buys the promise in §1: *main course × any single cuisine deals a full 15 and
survives one Restart; diet always relaxes; non-main meal types relax on cuisine.*

Two structural notes before the table.

**The floor is flat; only the surplus is demand-weighted.** A per-cell floor of 30 — the depth
at which Restart deals fresh cards — across 15 cuisine buckets consumes **450 of the 915
main-course budget** before demand gets a vote. Demand-weighting can only allocate the
remaining 465. This is the central tension inside "demand-weighted, not evenly spread", and it
belongs in the spec rather than being discovered halfway through authoring.

**Where the corpus is the only supply, the floor has to be higher.** The `Spoonacular today`
column is measured (§5.2). Where it is below 15, the owned corpus is not adding a share to a
blend — it is the entire supply for that chip.

### 8.1 Main course, by cuisine — 915

| Cuisine | Count | Spoonacular today | Evidence for the weight |
|---|---:|---:|---|
| **british** *(new chip)* | **150** | 4 | ABS: chicken meals 8.8% + beef grill 8.4% + lamb grill 3.3% + sausages 2.4% + beef casserole 2.2% + pork grill 2.2% = **27.3% of dinner occasions**, none currently chipped. taste.com.au ranks Modern Australian first. The convergent most-cooked core (§3.3) is largely this cuisine. bestrecipes' community top-100 is dominated by it. Largest cell by a distance, and near-zero vendor supply. |
| italian | 110 | 141 | ABS: beef pasta 4.7% + pizza 4.2% = **8.9%**, the largest chipped cuisine; pasta and noodle dishes eaten by **13.0%** of the population on a single day (ABS 2023). taste.com.au top-2; 77% of Gen Z name pasta as a go-to; Woolworths names "spag bol" a weeknight default. Vendor is deep but returns **0** for spaghetti bolognese. |
| chinese | 90 | 19 | ABS: chicken stir-fry 2.0%. Uber Eats #3 cuisine. DoorDash: special fried rice #5, dim sum #8, honey chicken #10. taste.com.au top-2. Largest non-Anglo ancestry (5.5%, Census 2021). Fried rice, chow mein and san choy bow all sit in the convergent core. Vendor holds 19. |
| indian | 90 | 62 | ABS: chicken curry 2.0%. **Uber Eats #1 cuisine.** DoorDash: garlic naan #2, butter chicken #3. taste.com.au top-5. **India is now equal-first by country of birth (971,000)** and the fastest-growing origin. Also the cheapest place to buy vegetarian depth. |
| thai | 65 | 13 | **Uber Eats #2 cuisine**; Pad Thai is the #1 dish in NSW/ACT and DoorDash #7; massaman and satay both sit in the convergent core. Vendor holds 13, returns **0** for "pad thai", and `thai + vegetarian` is **0**. |
| mexican | 55 | 100 | taste.com.au top-5. Woolworths names "Taco Tuesdays" a weeknight default. Vendor already deep, so this is blend depth rather than sole supply. |
| japanese | 50 | 18 | taste.com.au: ranks high among younger demographics; teriyaki and katsu recur across the 2025 most-cooked lists. Vendor holds 18 and cannot fill a pool. |
| greek | 45 | 20 | **taste.com.au: the #1 cuisine Australians want to cook more at home.** Coles' 2026 Flavour Forecast is Greek-heavy. Women's Weekly's #1 saved recipe of 2026 is Greek-style lemon chicken rice. Vendor holds 20. |
| vietnamese | 45 | 7 | Established AU cuisine — Vietnamese is the 3rd most-used non-English language at home (320,758) and Vietnam the 6th country of birth (326,600). Vendor holds **7**; the corpus is the only supply. |
| middle eastern | 45 | 6 | **Uber Eats #5 cuisine**; Arabic is the 2nd most-used non-English language at home (367,159). Vendor holds **6** — the thinnest chip in the vocabulary. |
| korean | 40 | 12 | Fast-growing; Coles' 2026 forecast names Korean repeatedly (tteokbokki, spicy tofu skewers, cheesy corn). Vendor holds 12 and `korean + vegetarian` is **0**. |
| mediterranean | 35 | 187 | Overlaps heavily with italian/greek/middle eastern, and the vendor is deepest here (187) with the only ≥15 vegetarian cell. Lowest marginal value. |
| american | 35 | 126 | Vendor is second-deepest. Burgers and BBQ are real Australian demand but largely takeaway rather than weeknight cooking (Uber Eats' national #1 is nuggets and burgers). |
| french | 30 | 25 | Floor only. No AU home-cooking evidence puts it near the top — though note "French onion" everything is the standout 2025 taste.com.au trend, which is an *ingredient* trend landing in Australian dishes, not French cooking. |
| spanish | 30 | 8 | Floor only. Vendor holds 8, so the floor is genuinely needed, but no demand evidence raises it. |
| **Total** | **915** | | |

### 8.2 Other meal types — 245, cuisine-agnostic

Each is floored at 25–55 so the bare meal-type chip deals 15 and (above 30) survives one
Restart. **None carries a per-cuisine guarantee** — a `soup + korean` Craving relaxes by
design, and §5.3 shows the vendor cannot serve those cells either.

| Meal type | Count | Spoonacular today | Rationale |
|---|---:|---:|---|
| dessert | 55 | 972 | Highest non-main demand signal by a wide margin. Google's AU trending recipe lists are almost entirely dessert and baking, and while that measures acceleration not volume (§2), taste's and delicious's most-cooked lists are also dessert-heavy above the dinner cut. Vendor is deep, so this is blend material. |
| salad | 45 | 238 | Warm-weather Australian staple; the 2025 most-cooked lists carry a heavy salad layer (Cypriot grain salad, dense bean salad, Thai beef salad). Thin at the vendor. |
| side dish | 45 | 1,309 | Floor only; vendor is deep. Kept because the chip exists and a Cook Session can legitimately want one. |
| soup | 40 | 408 | Seasonal and genuinely popular — pumpkin soup, chicken and sweet corn soup, pea and ham and potato-and-leek all sit in the convergent core. The vendor's thinnest non-main type. |
| breakfast | 35 | 452 | Floor only. Low fit with a group *dinner* decision app. |
| snack | 25 | 1,006 | Lowest floor. Vendor is very deep and the chip barely fits the product. |
| **Total** | **245** | | |

### 8.3 Diet tags as a cross-cut, not a partition

**Targets over the 915 mains**, satisfied by tagging per §7 — not additional dishes:

| Diet | Target share of mains | Count | Bare chip deals 15? | With a cuisine chip? |
|---|---:|---:|---|---|
| gluten free | at least 45% | ~410 | yes, + Restart | yes, in all 15 buckets |
| pescetarian | ~38% | ~350 | yes, + Restart | yes, in the top 6 |
| vegetarian | ~25% | ~230 | yes, + Restart | yes, in the top 6 (hard floor of 15 each) |
| vegan | ~10% | ~92 | yes, + Restart | no — relaxes |
| ketogenic | ~2% (authored block) | ~20 | yes, no Restart | no — relaxes |
| paleo | ~2% (authored block) | ~20 | yes, no Restart | no — relaxes |

---

## 9. Named dish lists for the largest cells

This is what the generation pipeline consumes first. Names are in Australian vernacular,
because owned Recipes are authored in AU terms and bypass
[#243](https://github.com/Zacplischka/dinner_app/issues/243)'s translation table entirely.

**Convention:** a dish in **bold** appears on at least one ranked first-party Australian
most-cooked, most-saved or most-searched list from §3.3, or in the ABS dinner table from
§3.1. Unbolded dishes are **[extrapolated]** — canonical members of the cuisine added to
reach the allocated depth, and the first candidates to cut if the pilot batch shows the
evidenced ones carry the Deck alone.

### 9.1 `british` / Modern Australian, main course — 150 allocated, 190 listed

The evidence base is unusually strong here: ABS ranks 1, 2, 4, 5, 6, 7; the entire
convergent core of §3.3; bestrecipes' community-cooked top 100; HelloFresh's recurring pub
food line; and Woolworths' own dinner range. **190 candidates are listed against a 150-dish
allocation deliberately** — the evidenced dishes overlap heavily (six stroganoff variants,
five rissole variants), so the pipeline should collapse near-duplicates rather than author
all 190. Every other cell below lists exactly its allocated count.

**Roasts and bakes (24).**
**Roast chicken with roast vegetables** · **Traditional roast lamb** · **Slow cooker roast
lamb with winter vegetables** · Slow-roasted lamb shoulder · Roast beef with Yorkshire
puddings · **Curtis Stone's roast pork with no-fail crackling** · **Air fryer roast pork
belly** · Roast turkey breast with stuffing · **Cheesy chicken tray bake with bacon** ·
**Honey mustard chicken tray bake** · **Classic maple-mustard chicken tray bake** ·
**Creamy Dijon chicken tray bake** · **Lamb forequarter chops with vegetables tray bake** ·
Sausage and vegetable traybake · Lemon and garlic roast chicken thighs · **Baked jacket
potatoes** · **Air fryer baked potatoes** · **Cheesy potato bake** · **Baked cauliflower
cheese** · **Cauliflower bake** · Roast pumpkin and feta bake · **Tray-baked chicken
marylands with risoni** · **One-pan lemon and chicken potato bake** · **Creamy chicken and
risoni tray bake**

**Grills, pan-fries and barbecue (22).**
**Beef steak with vegetables** · **Grilled scotch fillet with chips and salad** ·
**Slow cooker braised steak and onions** · **Braised steak and onions** · **Healthy French
onion braised steak** · **Lamb steak / grilled lamb chops** · **Air fryer lamb chops** ·
**Slow-cooked lamb forequarter chops** · **Pork steak with apple sauce** · **Marinated pork
spare ribs** · **Sausages, grilled, with onion** · Snags in bread with caramelised onion ·
**Classic beef burger** · **Big Mac burger and sauce** · Chicken burgers with slaw · Lamb
burgers with tzatziki · Steak sandwich with caramelised onion · **Surf and turf with garlic
cream sauce** · **Creamy garlic prawns** · **Creamy Tuscan garlic prawns** · **Garlic
prawns** · Mixed grill

**Crumbed and fried (14).**
**Air fryer chicken schnitzel** · **Easy chicken parmigiana** · Veal schnitzel with lemon ·
Pork schnitzel with gravy · Crumbed lamb cutlets · Beer-battered fish and chips ·
**Fish batter** · Crumbed fish with tartare sauce · **Potato scallops** · **Salmon
patties** · **Fish patties** · **Meat fritters** · **Leftover roast fritters** · **Classic
fluffy Australian corn fritters**

**Mince, sausage and pastry (26).**
**Old-fashioned beef rissoles** · **Air fryer chicken rissoles** · **Simple beef rissoles** ·
**Apricot chicken rissoles** · **French chicken rissoles** · **Rissoles with sweet potato
mash** · **Mum's porcupine meatballs** · **Porcupine meatballs** · **Classic meatballs** ·
**Delicious meatloaf** · **Trish's meatloaf** · **Hidden-veg family meatloaf** ·
**Rosemary, beef and potato meatloaf** · **Delicious and simple savoury mince** · **French
onion savoury mince** · **Savoury curry mince** · **Garlic bread savoury mince** ·
**Macaroni mince** · **Aussie meat pie** · **No-fuss pasties** · **Sneaky vegie-filled
sausage rolls** · **Homemade sausage rolls** · **Curried sausages** · **Best-ever curried
sausages** · **Devilled sausages** · **Slow cooker French onion sausages**

**Casseroles, braises and slow-cooked (30).**
**Beef stroganoff** · **Slow cooker beef stroganoff** · **Easy beef stroganoff** · **Slow
cooker creamy chicken stroganoff** · **Chicken stroganoff** · **Easy beef stroganoff cottage
pie** · **Hearty beef casserole** · **Slow cooker classic beef stew** · **Nanna's beef
stew** · **Best-ever rich beef stew** · **Slow cooker beef and red wine casserole** ·
**Slow-cooker beef cheeks in red wine** · **Slow cooker beef brisket** · **Slow cooker pulled
pork** · **Slow cooker lamb shanks** · **4-ingredient slow cooker lamb shanks** · **Best-ever
slow cooker lamb stew** · **Lamb stew** · **Savoury lamb chop casserole** · **Slow cooker
braised lamb and onions** · **Corned beef** · **Corned silverside slow cooker style** ·
**Slow cooker silverside** · **Irish stew** · **Chicken and bacon casserole** · **Slow cooker
French onion chicken** · **Slow cooker French onion beef** · **Slow-cooker creamy French
onion steak** · **Beef and mushroom casserole** · **Beef and mushroom ragout**

**Pies, quiches and slices (20).**
**Classic shepherd's pie** · **Mum's shepherd's pie** · **Beef shepherd's pie** ·
**Shepherd's pie potato bake** · **Cottage pie** · **Speedy cheesy cottage pie** ·
**Vegetarian shepherd's pie with cheesy mash** · **Chicken and leek pie** · **Creamy chicken
pie** · **Quick French onion chicken pie** · **Impossible quiche** · **Savoury impossible
pie** · **Spinach impossible pie** · **Easy quiche** · **One-cup quiche** · **Quick and easy
quiche** · **Zucchini and bacon quiche** · **Bacon and cheese quiche with hash brown
crust** · **Australia's favourite classic zucchini slice** · **Cottage cheese zucchini
slice**

**Creamy chicken and weeknight one-pans (24).**
**Our favourite classic apricot chicken** · **Slow cooker apricot chicken** · **Healthy
apricot chicken** · **Crumbed apricot chicken tray bake** · **Slow cooker honey mustard
chicken** · **Baked honey mustard chicken** · **Slow cooker chicken Diane** · **Slow cooker
chicken Diane drumsticks** · **Creamy chicken bake** · **Creamy chicken, bacon and
cauliflower bake** · **One-pan creamy chicken and bacon** · **One-pan cheese and bacon
smothered chicken** · **Creamy chicken with pumpkin and mushrooms** · **Chicken with cream
sauce and mushrooms** · **Cheesy chicken and bacon rice bake** · **Cheesy chicken, pumpkin
and bacon bake** · **Mum's curried chicken bake** · **Creamy chicken in the slow cooker** ·
**Chicken mornay** · **Chicken mornay bake** · **Sticky chicken** · **Slow cooker creamy
ranch chicken breast** · **Slow cooker 'marry me' chicken** · **Lemon parmesan pan chicken**

**Seafood, mornays and pasta bakes that belong to no other cuisine (16).**
**Tuna mornay** · **Healthy tuna mornay** · **Creamy tuna mornay** · **10-minute tuna mornay
rice bake** · **Tuna pasta bake** · **Easy salmon mornay pasta bake** · **Healthy salmon
mornay pasta bake** · **Tuna and corn pasta bake** · **Creamy tuna Florentine pasta bake** ·
**Easy weeknight tuna carbonara** · **Seafood chowder** · **Bacon and beef pasta bake** ·
**Easy chicken pasta bake** · **Cheesy French onion beef pasta bake** · **Tomato soup pasta
bake** · **Classic and simple macaroni cheese**

**Salads, soups and the rest of the Australian table (14).**
**Chicken caesar salad** · **Creamy pasta salad** · **Honey mustard chicken pasta salad** ·
**Creamy bacon pasta salad** · **Classic potato salad** · **Classic coleslaw** · **The
ultimate easy pumpkin soup** · **Slow-cooked pumpkin soup** · **Curried pumpkin soup** ·
**Potato and leek soup** · **Slow-cooker creamy potato and leek soup** · **Pea and ham
soup** · **Nanna's lamb shank and vegetable soup** · **Hearty chicken and vegetable soup**

### 9.2 `italian`, main course — 110

Anchored to ABS rank 3 (beef pasta 4.7%) and ranks 8–9 (pizza 4.2%), ABS 2023 (pasta and
noodle dishes eaten by 13.0% of the population on a single day), and the vendor's measured
**zero** for spaghetti bolognese.

**Pasta with meat (26).**
**Our best-ever spaghetti bolognese** · **Best-ever slow-cooker bolognaise** · **Spaghetti
bolognese bake** · **Our favourite lasagne** · **Best-ever lasagne** · **Easy slow-cooker
lasagne** · **Slow cooker beef ragu** · **Slow cooker pulled beef ragu** · **Mid-week lamb
ragu** · **Sausage ragu with pappardelle** · **Spaghetti carbonara** · **Creamy fettuccine
carbonara** · **Creamy bacon carbonara** · **Creamy chicken carbonara** · **Chicken and bacon
carbonara** · **Easy chicken and fettuccine carbonara** · **Traditional Italian spaghetti alla
carbonara** · **20-minute creamy Italian sausage pasta** · **Creamy chicken pesto pasta** ·
**One-pan creamy chicken pesto pasta bake** · **Chicken and mushroom pasta bake** ·
**5-ingredient chicken and mushroom pasta bake** · **Chicken Kyiv pasta bake** · **All-in-one
Tuscan chicken pasta bake** · **Protein-rich Tuscan chicken pasta** · **Creamy chicken
piccata pasta**

**Pasta — seafood and vegetarian (24).**
**Creamy Tuscan salmon pasta bake** · **Linguine with prawns, chilli, garlic and rocket** ·
**Spaghetti, garlic, olive oil and chilli with prawns** · **15-minute creamy salmon risoni** ·
**One-pan creamy garlic prawn risoni** · Spaghetti marinara · Spaghetti vongole · Tuna and
caper spaghetti · **Pumpkin, spinach and lentil lasagne** · **Our go-to vegetarian lasagne** ·
**Pumpkin, spinach and ricotta lasagne** · **Spinach and ricotta cannelloni** · **Creamy
vegetarian pumpkin pasta bake** · **Creamy pumpkin casarecce carbonara** · **One-pan
ratatouille risoni** · **Risoni with roasted vegetables and feta** · **Roasted tomato and
fetta pasta** · **Pumpkin and sage baked gnocchi** · **Basic potato gnocchi** · **Cheat's
boscaiola rice bake** · **Chicken boscaiola** · **5-ingredient creamy cacio e pepe gnocchi
bake** · **3-ingredient pastina** · Penne arrabbiata

**Pizza and bread-based (14).**
**Easy homemade pizza dough** · **Prawn, chilli and rocket pizza** · **Muffin pan pizza
puffs** · **Pizza with ham** · **Pizza with bacon** · Margherita pizza · Pepperoni pizza ·
Capricciosa pizza · Meat lovers pizza · Vegetarian pizza · Prosciutto and rocket pizza ·
Calzone with ham and ricotta · **Bruschetta** · Focaccia with rosemary and sea salt

**Risotto and rice (12).**
**Chicken and mushroom risotto** · **Instant pot chicken and mushroom risotto** · **Baked
pumpkin and bacon risotto** · **Vegetable risotto** · **Pumpkin risotto with harissa
prawns** · Mushroom risotto · Prawn and saffron risotto · Bacon and pea risotto · Seafood
risotto · Asparagus and lemon risotto · Risotto alla Milanese · Arancini with mozzarella

**Meat, chicken and seafood mains (22).**
**Chicken cacciatore** · **Quick and easy chicken cacciatore** · **Slow-cooker chicken
cacciatore** · **Chicken cacciatore rissoles** · **One-pot Italian chicken** · **Italian-style
lemon chicken** · **One-pan Caprese chicken** · **One-pan chicken with bocconcini and
olives** · **One-pan cheesy chicken pasta alla Norma** · **Our melt-in-the-mouth osso buco** ·
**Osso buco** · **Slow cooker osso buco** · **One-pot Italian beef and gnocchi casserole** ·
**Meatballs in tomato sauce** · **Matt Moran's spaghetti and meatballs** · **10-minute cheesy
gnocchi and meatball bake** · **One-pot cheesy French onion meatballs** · **One-pot creamy
chicken ravioli** · **Speedy mince and haloumi one-pot** · Chicken saltimbocca · Veal
parmigiana · Porchetta

**Soups and vegetable mains (12).**
**Delicious minestrone soup** · **Minestrone** · **Chicken parmigiana soup** · **Smoky roasted
tomato soup** · **Easy oven-baked frittata** · **Eggplant parmigiana** · **Vegetarian layered
winter bake** · **Cauliflower cheese balls** · **Crispy creamy vegetarian casserole** ·
Caponata with crusty bread · Polenta with mushroom ragù · Pasta e fagioli

### 9.3 `chinese`, main course — 90

Anchored to ABS rank 11 (chicken stir-fry 2.0%), Uber Eats #3 cuisine, DoorDash #5/#8/#10,
the largest non-Anglo ancestry group (5.5%), and a vendor holding 19.

**Stir-fries (24).**
**Our best basic beef and vegetable stir fry** · **Easy beef stir-fry** · **Easy pork
stir-fry** · **Sticky beef and bean stir-fry** · **Curtis Stone's crispy pork stir-fry with
baby broccoli** · **15-minute chicken, broccoli and cashew stir-fry** · **Slow cooker sticky
cashew nut chicken** · **Honey chicken** · **Healthier honey chicken stir-fry** · **Honey and
lemon chicken stir-fry** · **Slow cooker sweet and sour chicken** · **Sweet and sour air fryer
pork belly bites** · **Slow cooker sizzling Mongolian beef** · **Healthy Mongolian-style
chicken and broccoli** · **One-pan Mongolian beef crispy fried rice** · **Black pepper beef
noodle stir-fry** · **Kung pao chicken** · **Rainbow beef** · **Chinese pork mince
stir-fry** · Beef and black bean stir-fry · Beef and broccoli · Salt and pepper squid ·
Ginger and shallot beef · Sweet and sour pork

**Rice (18).**
**Easy fried rice** · **Fried rice** · **Healthier one-pan baked fried rice** · **Special
fried rice** · **Easy teriyaki chicken fried rice** · **Easy slow cooker chicken and garlic
fried rice** · **Easy Fujian fried rice** · **Sticky pork mince fried rice** · **Kimchi and
garlic butter fried rice** · **Healthy Mexican fried rice** *(cross-tagged; author the
Chinese base)* · **Slow cooker chicken congee** · **Cheesy chicken and bacon rice bake**
*(cross-tagged)* · Yangzhou fried rice · Prawn fried rice · Egg fried rice with peas ·
Claypot chicken rice · Char siu on rice · Chicken and corn congee

**Noodles (14).**
**Easy and delicious chow mein** · **Easy beef chow mein** · **Chicken chow mein** ·
**Healthier chicken chow mein** · **Vegetarian chow mein** · **Bang bang chicken chow mein** ·
**Curtis Stone's stir-fried rice noodles with chicken and vegetables** · **Speedy Singapore
noodles** · **Singapore chicken noodles** · **Biang biang noodles** · **Asian beef mince
noodle bowl with fried egg** · Dan dan noodles · Beef ho fun · Hokkien mee

**Soups, braises and steamed (18).**
**Chicken and sweet corn soup** · **Chinese chicken sweet corn soup** · **Soothing chicken
soup** · **Quick-fix soothing chicken bone broth soup** · **Brothy rice soup** · **Ki-Si-Min**
· **Creamy baked chicken and mushrooms** *(SBS most-popular)* · **Yuxiang eggplant** ·
Red-braised pork belly · Soy-braised chicken · Steamed whole fish with ginger and shallots ·
Char siu barbecue pork · Crispy-skin roast pork · Braised beef brisket with daikon · Mapo
tofu · Hot and sour soup · Cantonese poached chicken with ginger-shallot oil · Master-stock
chicken

**Dumplings and small plates as mains (8).**
**Quick san choy bow** · **San choy bow** · **20-minute easy tofu san choy bau** ·
**15-minute pork san choy bau noodles** · **Cheeseburger sang choy bao** · **Dim sims** ·
Pork and cabbage dumplings · Siu mai

**Vegetarian and tofu (8).**
Salt and pepper tofu · Stir-fried gai lan with garlic · Buddha's delight · Tofu and black
bean stir-fry · Egg and tomato stir-fry · Vegetarian fried rice · Braised tofu with
mushrooms · Dry-fried green beans

### 9.4 `indian`, main course — 90

Anchored to ABS rank 10 (chicken curry 2.0%), Uber Eats #1 cuisine, DoorDash #2 and #3, and
India now equal-first by country of birth. This is also where vegetarian depth is cheapest.

**Chicken (22).**
**Easy butter chicken (creamy fakeway)** · **Butter chicken** · **4-ingredient butter
chicken** · **Easiest butter chicken** · **One-pan butter chicken with rice** · **Easy butter
chicken rice pilaf** · **Butter chicken naan toasties** · **X-press korma butter chicken** ·
**Easy slow-cooker chicken tikka masala** · **Light chicken korma** · **Easy chicken curry** ·
**Chicken curry** · **Comfort chicken curry** · **Secret chicken curry** · **Leftover BBQ
chicken curry** · **Mango chicken curry** · **Mango chicken slow cooker curry** · **Apricot
chicken curry** · **Chicken mince keema curry** · **Slow-cooked turmeric chicken** · Tandoori
chicken · Chicken vindaloo

**Lamb, beef and pork (14).**
**Sri Lankan beef and coconut curry** · **Creamy coconut beef and pumpkin curry** · **Beef and
pumpkin curry** · **Beef and vegetable curry** · **Curried beef and sweet potato bowl** ·
**Lamb korma curry** · **Moroccan beef casserole** *(cross-tagged)* · **15-minute Moroccan lamb
on couscous** *(cross-tagged)* · Lamb rogan josh · Keema matar · Beef madras · Lamb biryani ·
Goat curry · Lamb chops masala

**Seafood (8).**
**Easy curried prawns** · **Curried prawns** · **Turmeric and coconut fish curry** · **Salmon
red curry** · Goan fish curry · Prawn masala · Kerala fish moilee · Tandoori prawns

**Vegetarian and lentil — the deepest vegetarian cell in the corpus (26).**
**Dal makhani** · **Lentil and vegie dhal** · **Vegetarian dahl dinner bowls** · **Dahl** ·
**Creamy chickpea and vegetable curry** · **Cauliflower, chickpea and coconut curry** ·
**Butter cauliflower-chickpea curry** · **Cauliflower, lentil and potato aloo gobi** ·
**Creamy Indian chickpea and spinach curry** · **Quick Moroccan lentil and cauliflower soup**
*(cross-tagged)* · Chana masala · Palak paneer · Paneer butter masala · Aloo gobi · Baingan
bharta · Rajma · Tarka dal · Malai kofta · Vegetable korma · Mixed vegetable curry · Bhindi
masala · Matar paneer · Paneer tikka masala · Sambar · Vegetable biryani · Egg curry

**Rice, breads and accompaniments served as mains (12).**
**Quick garlic naan** · **Chicken korma curry and cheesy garlic naan** · **Healthy garlic
chicken rice pilaf** · **Spiced chicken and currant-studded biryani** · **Middle Eastern lamb
pilaf** *(cross-tagged)* · Vegetable pulao · Jeera rice with dal · Lemon rice · Roti with
dal · Dosa with potato masala · Idli with sambar · Kichdi

**Regional and street (8).**
**Quick Japanese chicken curry** *(cross-tagged to japanese)* · Hyderabadi biryani ·
Rajasthani laal maas · Kolhapuri chicken · Bombay pav bhaji · Vada pav · Amritsari fish ·
Punjabi chole

### 9.5 `thai`, main course — 65

Anchored to Uber Eats #2 cuisine and the #1 dish in NSW/ACT, against a vendor holding 13,
returning **zero** for "pad thai", and **zero** for `thai + vegetarian`.

**Curries (18).**
**Thai massaman beef curry** · **Slow-cooker massaman beef curry** · **Slow cooker massaman
curry** · **Thai green curry chicken rissoles** · **Spicy green Thai chicken curry** ·
**Thai chicken curry fried rice** · **Thai yellow fish curry** · **No fuss Thai red curry and
pork dumpling bake** · **Slow-cooker Cambodian chicken curry** · **Lamb meatballs and rendang
curry sauce** · Green chicken curry · Red beef curry · Panang pork curry · Yellow chicken
curry · Jungle curry with pork · Choo chee salmon · Vegetable green curry · Tofu massaman

**Noodles (12).**
**Pad thai with prawns** · **Pad thai with chicken** · **Vegetarian pad thai** · **Beef pad
see ew** · **Pad see ew with beef** · **Healthy beef mince Thai noodle salad** · **Chicken
patties with noodle salad** · **Lemon chicken noodle salad** · Drunken noodles (pad kee mao) ·
Boat noodles · Tom yum noodle soup · Khao soi chicken

**Stir-fries and satay (14).**
**Satay chicken** · **Coconut satay chicken noodle bowl** · **Healthier chicken satay
stir-fry** · **Slow-cooker satay chicken** · **Satay chicken rice tray bake** · **The best
satay beef** · **Slow cooker satay beef** · **Chicken satay with peanut sauce** · **Thai
chicken balls** · **Kickin' chickn' bites and DIY nam chim** · Pad kra pao with pork mince ·
Chicken with cashew nuts · Stir-fried morning glory · Tofu with basil

**Soups and salads (12).**
**Delicious Thai beef salad** · **15-minute Thai beef salad with rice noodles** · **Thai beef
noodle salad** · **Slow-cooker Thai-style pumpkin soup** · **15-minute creamy coconut chicken
noodle soup** · **Fragrant prawn and tom yum rice bowl** · Tom yum goong · Tom kha gai · Green
papaya salad (som tum) · Larb gai · Glass noodle salad (yum woon sen) · Grilled pork neck
salad

**Grills, rice and the rest (9).**
**No-fuss salmon laksa tray bake** · **Easy fragrant chicken thigh laksa** · **One-pan chicken
laksa fried rice** · **Hawker-style chicken laksa goreng** · Thai fried rice with prawns ·
Pineapple fried rice · Basil fried rice · Grilled chicken (gai yang) with sticky rice ·
Crying tiger beef

### 9.6 The remaining cells

The same treatment is required for `mexican` (55), `japanese` (50), `greek` (45),
`vietnamese` (45), `middle eastern` (45), `korean` (40), `mediterranean` (35), `american`
(35), `french` (30) and `spanish` (30), plus the 245 non-main dishes. Those lists follow
directly from the same sources and are not enumerated here because **the five cells above
account for 505 of the 915 mains** and are what the pilot batch should draw from first.

Seed candidates already visible in the evidence for those cells, to save the next pass a
search: `mexican` — **one-pot healthy Mexican beef mince, beef nachos, quick beef enchiladas,
chilli con carne, healthy chilli con carne, 15-minute Mexican burrito bowl, chilli con carne
burritos, Mexican chicken and rice bowl, hidden-veg beef mince tacos, fish tacos, quick-smart
nachos, cheesy taco pasta bake, healthy taco salad, vegan chilli con 'carne'**. `japanese` —
**easy gyudon, one-pan teriyaki beef and rice, healthy one-pan teriyaki beef mince with rice,
teriyaki chicken fried rice, slow cooker teriyaki chicken, 15-minute Japanese chicken noodle
stir-fry, okonomiyaki, pork ramen, easy crispy pork mince ramen, salmon sushi-inspired
salad**. `greek` — **Greek-style lemon chicken rice with fetta, one-pot Greek-style lemon
chicken and potatoes, Yiayia's authentic spanakopita, Food Safari's spanakopita, Matt
Preston's Greek lamb traybake, Greek-style stuffed capsicums, lamb souvlaki bowl, Greek-style
tuna and fetta pasta bake, loaded Greek-style chicken gyros**. `vietnamese` — **Brendan Pang's
Vietnamese garlic butter chicken noodles, Vietnamese caramel pork, chicken and vermicelli
noodle salad, crispy pork banh mi, pork belly banh mi fried rice, one-pot Vietnamese chicken
noodle soup, Vietnamese-style noodle salad, speedy Vietnamese-twist beef wraps**.
`middle eastern` — **Middle Eastern stuffed flatbreads, Middle Eastern chicken and rice,
Middle Eastern lamb pilaf, easy beef arayes, lamb shawarma soup, chicken shawarma, tray bake
lamb kofta meatballs and vegetables, fattah-inspired beef and chickpea bowl, charred eggplant
with tahini and dukkah, Cypriot grain salad**. `korean` — **one-pan cheesy Korean pork rice
bake, easy Korean japchae, speedy Korean fried chicken tacos, beef bulgogi tacos, tteokbokki
bolognaise, Korean-style cheesy corn, Korean-inspired spicy tofu skewers, kimchi and garlic
butter fried rice**.

**The pilot batch should be cut from §9.1 (`british`).** It is simultaneously the largest
cell by ABS evidence, the one with the least vendor supply (4 recipes), the one where the
ranked most-cooked lists give the densest named-dish evidence, and the one that most directly
tests the AU-vocabulary and Woolworths-tally claims the corpus is supposed to be better at.

---

## 10. What this changes

1. **Add `british` to `CUISINES`.** 27.3% of Australian dinner occasions, the entire
   convergent most-cooked core, and the top of taste.com.au's own cuisine survey all have no
   chip. `british` is already a supported Spoonacular value, so it costs nothing and degrades
   gracefully. `australian` stays parked per
   [#310](https://github.com/Zacplischka/dinner_app/issues/310) until owned coverage can carry
   a chip alone.
2. **Restate the corpus promise in the spec, explicitly:** *main course × any single cuisine
   deals 15 and survives one Restart; diet always relaxes; non-main meal types relax on
   cuisine.* Then size to it — **~1,160**, not "~1000 across the vocabulary". The difference
   between those two sentences is a factor of four in build cost, and the map requires build
   cost to be known before it is paid.
3. **Design relaxation as a first-class, permanent mechanism, not an outage behaviour.**
   76 of 84 diet × cuisine cells can never hold 15 at any plausible corpus size — and do not
   hold 15 from Spoonacular today either. Relaxation is the product, not the apology.
4. **The owned corpus is the sole supply for five cuisine chips right now.** `thai`, `korean`,
   `spanish`, `vietnamese` and `middle eastern` all return fewer than 15 main courses from a
   healthy vendor, and `dealDeck` ships the short Deck silently. That is a live product defect
   the corpus fixes independent of the fallback driver — which means the corpus starts earning
   its keep before Spoonacular ever goes dark, and is worth saying in the spec because
   [#310](https://github.com/Zacplischka/dinner_app/issues/310) currently assumes the opposite
   ("Spoonacular stays the bulk supply and the breadth answer").
5. **Budget for a flat floor before demand-weighting.** 450 of the 915 mains are consumed by a
   per-cuisine floor of 30. Only the remaining 465 are demand-weighted. "Demand-weighted, not
   evenly spread" is true only above the floor, and the spec should say so rather than let it
   surface as a surprise during authoring.

Two smaller notes worth carrying forward. **Gluten free is the cheapest large win in the
corpus** — 24.2% of Australians avoid wheat or gluten, Australian weeknight cooking is
incidentally GF at a high rate, and the work is an authoring convention rather than new
dishes. And **`dealDeck`'s silent short Deck deserves its own ticket**: the code comments say
a thin Craving deals fewer cards "rather than erroring", which was a reasonable call when the
assumption was that thinness was rare. §5.2 shows it is not rare, and a Deck that is quietly
half-length is exactly the kind of unreliability this map exists to kill.

---

## 11. Extrapolation register

Where this document is measured, sourced, or guessing.

| Claim | Status |
|---|---|
| Spoonacular per-cell depth (§5.2, §5.3, §5.4) | **Measured**, live API, app query shape, 2026-08-02 |
| Deck 15 / pool 60 / Restart needs 30 | **Measured**, read from repo source |
| Spoonacular cuisine, meal type and diet vocabularies (§4) | **Primary**, vendor documentation, quoted verbatim |
| ABS dinner dish frequencies (§3.1) | **Primary**, ABS 2011–12 NNPAS via Sui et al. 2017 — ranking durable, absolute percentages 14 years old |
| ABS 2023 food-group and protein data (§3.2) | **Primary**, current national survey, released 2025 |
| Ranked most-cooked / most-saved dish lists (§3.3) | **Primary**, publishers' own pageview, save and search data, methodology stated on-page |
| HelloFresh AU protein mix (§3.5) | **Measured**, counted by hand from two live weekly menus |
| Repertoire size, 68% at ≤10 recipes (§3.6) | **Primary**, McCrindle n=1,005 — but fielded January 2017 |
| AU diet prevalence (§7.1) | **Primary** for gluten avoidance (MJA), vegetarian/vegan (ABS 2023), meat reduction (Food Frontier). **No number exists** for ketogenic, paleo or pescetarian — stated as a gap, not filled with a guess |
| taste.com.au cuisine ranking (§3.4) | **[secondary]** — trade-press reports of a first-party survey whose release is not public |
| Diet yields (45% GF, 25% veg, 10% vegan, 5% keto, 4% paleo) | **[extrapolated]** — no published AU recipe-corpus diet-yield dataset exists. Each is anchored to a measured number (§6.3) and the Spoonacular grid runs the same direction, but re-check against the pilot batch's actual tag yields before committing the full run |
| The 915/245 split and per-cuisine counts (§8) | **[extrapolated]** — the *floor* of 30 is arithmetic, the *surplus* is judgement built from the weights above |
| Unbolded dishes in §9 | **[extrapolated]** — canonical members of the cuisine added to reach allocated depth; first to cut |

Three things a follow-up should close. The **2026 Census** (night 11 August 2026, first
release June 2027) will refresh the ancestry and country-of-birth floor. ABS publishes
ancestry counts beyond the top five only in DataPacks and TableBuilder, so Greek, Vietnamese,
Filipino, Lebanese and Korean ancestry figures were not obtainable from a first-party HTML
page and are not cited here. And the **ABS *Apparent Consumption* seafood figure** sits only
in the release's data cube, which was not opened — do not cite a seafood gram figure from that
release without it.

---

## 12. Sources

**Measured directly**
- Spoonacular `GET /recipes/complexSearch`, live, 2026-08-02 — per-cuisine, per-diet, per-meal-type and per-query `totalResults`
- `backend/src/config/index.ts`, `backend/src/services/RecipePoolService.ts`, `backend/src/services/spoonacularClient.ts`, `shared/types/cook.ts`

**Government, peer-reviewed and statistical**
- Sui Z, Raubenheimer D, Rangan A, "Exploratory analysis of meal composition in Australia: meat and accompanying foods", *Public Health Nutrition* 2017;20(12):2157–2165 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10261568/
- ABS, *National Nutrition and Physical Activity Survey, 2023* — https://www.abs.gov.au/statistics/health/food-and-nutrition/national-nutrition-and-physical-activity-survey/latest-release
- ABS, *Food and nutrients, 2023* — https://www.abs.gov.au/statistics/health/food-and-nutrition/food-and-nutrients/latest-release
- ABS, *Food and nutrients, 2011-12* — https://www.abs.gov.au/statistics/health/food-and-nutrition/food-and-nutrients/2011-12
- ABS, *Consumption of food groups from the Australian Dietary Guidelines, 2023* — https://www.abs.gov.au/statistics/health/food-and-nutrition/consumption-food-groups-australian-dietary-guidelines/2023
- ABS, *Apparent Consumption of Selected Foodstuffs, Australia, 2023-24* — https://www.abs.gov.au/statistics/health/food-and-nutrition/apparent-consumption-selected-foodstuffs-australia/latest-release
- ABS media release, *Australians eating more meat but less chocolate*, 28 Mar 2025 — https://www.abs.gov.au/media-centre/media-releases/australians-eating-more-meat-less-chocolate
- ABS, *Dieting and food avoidance, 2023* — https://www.abs.gov.au/statistics/health/food-and-nutrition/dieting-and-food-avoidance/latest-release
- ABS, *Cultural diversity: Census, 2021* — https://www.abs.gov.au/statistics/people/people-and-communities/cultural-diversity-census/latest-release
- ABS, *Australia's population by country of birth, 30 June 2025* — https://www.abs.gov.au/statistics/people/population/australias-population-country-birth/latest-release
- Potter MDE et al., *Incidence and prevalence of self-reported non-coeliac wheat sensitivity and gluten avoidance in Australia*, **MJA** 212(3), 2020 — https://www.mja.com.au/journal/2020/212/3/incidence-and-prevalence-self-reported-non-coeliac-wheat-sensitivity-and-gluten
- CSIRO, *Healthy Diet Score 2015-2023* (n=235,268, self-selected — not a probability sample) — https://www.csiro.au/-/media/Health/Healthy-Diet-Score-2023/Diet-score-2023-Report_September.pdf
- Coeliac Australia — https://coeliac.org.au/learn/coeliac-disease/ and https://coeliac.org.au/for-business/accreditation/
- Meat & Livestock Australia, *State of the Industry Report 2023-24* — https://www.mla.com.au/globalassets/mla-corporate/prices--markets/documents/trends--analysis/soti-report/mla-state-of-the-industry-report-2324-web.pdf
- Australian Chicken Meat Federation, *Facts and Figures* (citing ABARES Dec Q 2025) — https://chicken.org.au/our-product/facts-and-figures/

**First-party recipe-site rankings (named dish evidence)**
- taste.com.au, *Most popular dinner recipes in Australia for 2024* (100 most-cooked) — https://www.taste.com.au/galleries/most-popular-dinner-recipes-australia-2024/8s6ugyu5
- taste.com.au, *Our 100 most-saved dinners of all time* — https://www.taste.com.au/dinner/galleries/our-100-most-saved-dinners-time/7fxd7svx
- taste.com.au, *Our most searched-for dinners of all time* — https://www.taste.com.au/galleries/our-most-searched-dinners-time/55td2u0g
- taste.com.au, *Australia's top 100 dinners of the past 5 years* — https://www.taste.com.au/dinner/galleries/australias-top-100-dinners-past-5-years/2n2wpl6a
- taste.com.au, *Our top 100 new dinner recipes of 2025* — https://www.taste.com.au/dinner/galleries/our-top-100-new-dinner-recipes-2025-revealed/dr0a2eqh
- bestrecipes.com.au, *Our most popular dinner recipes of 2025* (as cooked by users) — https://www.bestrecipes.com.au/galleries/our-most-popular-dinner-recipes-2025/ahe6qwno
- delicious.com.au, *The 100 most-cooked delicious. recipes of 2025* — https://www.delicious.com.au/recipes/group/gallery/most-popular-delicious-recipes-last-year/po4ewmkn
- Australian Women's Weekly Food, *Top 10 saved recipes of 2026* — https://www.womensweeklyfood.com.au/in-the-test-kitchen/top-10-saved-recipes-of-2026/
- RecipeTin Eats, *10 most popular new recipes of 2024 (so far)* — https://www.recipetineats.com/10-most-popular-new-recipes-of-2024-so-far/
- SBS Food, *Top 25 most popular recipes* — https://www.sbs.com.au/food/collection/top-25-most-popular-recipes
- Woolworths, *Our top 20 most-viewed recipes of 2020* (site pageviews) — https://www.woolworths.com.au/shop/discover/make-yourself-at-home-with-woolworths/our-top-20-most-viewed-recipes-of-2020

**First-party commercial and survey data**
- HelloFresh Australia weekly menus — https://www.hellofresh.com.au/menus · https://www.hellofresh.com.au/menus/2026-W34
- HelloFresh Australia / McCrindle Research, *Australia's Cooking Landscape*, Jan 2017 (n=1,005) — https://australianfoodtimeline.com.au/wp-content/uploads/2020/01/HelloFresh_Australia27s-Cooking-Landscape_Report_FINAL_1Feb2017.pdf
- Marley Spoon Australia — https://www.marleyspoon.com.au/menu · Dinnerly — https://www.dinnerly.com.au/menu
- Uber Eats Australia, 2022 Cravings Report — https://www.uber.com/au/en/newsroom/cravings2022/
- Uber Eats Australia, 2025 Cravings Report — https://www.uber.com/au/en/newsroom/uber-eats-hits-one-billion-deliveries-and-reveals-australias-biggest-cravings-of-2025/
- DoorDash Australia, 2025 Delivery Trends Report — https://merchants.doordash.com/en-au/blog/australia-online-ordering-habits
- Woolworths Group, *380 ways to do dinner*, 2026 — https://www.woolworthsgroup.com.au/au/en/our-newsroom/latest-news/2026/woolworths-serves-up-380-ways-to-do-dinner-with-a-massive-range-.html
- Woolworths Group, *Woolworths shakes up home cooking*, 2026 — https://www.woolworthsgroup.com.au/au/en/our-newsroom/latest-news/2026/woolworths-shakes-up-home-cooking-with-70-new-globally-inspired-.html
- Woolworths, most popular recipes of 2023 (Google trend data, not sales) — https://www.woolworths.com.au/shop/articles/most-popular-recipes-of-2023
- Coles, *Flavour Forecast 2026* — https://www.coles.com.au/recipes-inspiration/collections/flavour-forecast
- Google Australia, *Year in Search 2025* — https://blog.google/intl/en-au/products/explore-get-answers/australia-year-in-search-2025/
- Roy Morgan, *Rise in vegetarianism not halting the march of obesity*, 2019 (n=14,913) — https://www.roymorgan.com/findings/rise-in-vegetarianism-not-halting-the-march-of-obesity
- Roy Morgan, Health & Wellbeing Study (gluten-free 10%) — https://www.roymorgan.com/findings/the-vast-majority-of-australians-77-feel-well-and-in-good-health
- Food Frontier, *Hungry for Plant-Based*, 2019 — https://www.foodfrontier.org/wp-content/uploads/2019/10/Food-Frontier-Hungry-For-Plant-Based-Australian-Consumer-Insights.pdf
- Food Frontier, *Australia's most popular diets in 2024* (Toluna, n=2,000) — https://www.foodfrontier.org/survey-reveals-australias-most-popular-diets-in-2024/
- IBISWorld, *Meal Kit Delivery Services in Australia*, Nov 2024 — https://www.ibisworld.com/australia/industry/meal-kit-delivery-services/5660/

**Vendor documentation**
- Spoonacular API docs — cuisines, meal types, diet definitions — https://spoonacular.com/food-api/docs

**Secondary (trade press reporting a first-party survey)**
- Mediaweek on taste.com.au's *Taste the World* survey — https://www.mediaweek.com.au/taste-com-au-launches-taste-the-world
- Marketing-Interactive on the same — https://www.marketing-interactive.com/taste-com-au-launches-taste-the-world-as-australians-embrace-global-flavours
