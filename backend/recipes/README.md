# The Owned Recipe Store's corpus

One directory per Owned Recipe, named for its frozen slug, holding
`recipe.json` — the layout `scripts/corpus/images.mjs` reads and stamps
`photoUrl` into, and the one `src/services/ownedRecipeStore.ts` loads at boot.
Reference data (ADR 0011): reviewed in a pull request, shipped with the deploy,
read in memory. A bad batch is one revert from gone.

**This is a provisional seed of 10, not the corpus.** It exists so the blend
(#331) deals on a real Deck; the pilot re-gate ([#338](https://github.com/Zacplischka/dinner_app/issues/338))
replaces it and [#341](https://github.com/Zacplischka/dinner_app/issues/341)
grows it to ~1,160. These ten were written from general culinary knowledge with
no source consulted and carry no Fact Record, so they have been through none of
the four gate layers ([#336](https://github.com/Zacplischka/dinner_app/issues/336),
[#337](https://github.com/Zacplischka/dinner_app/issues/337)) — in particular
nothing has measured their ingredient lines against the Tally at store 1101.
`node scripts/corpus/gate.mjs check backend/recipes --structural` says so out
loud, and every line of that report is a real defect in the seed rather than a
gap in the gate.

The remaining two layers are `node scripts/corpus/tally.mjs check backend/recipes`
— which measures at production's store 1101 through `railway ssh`, spends the
shared Woolworths politeness budget, and so must not run while anyone is using
the app — and `node scripts/corpus/human.mjs sample backend/recipes`.

Growing or replacing this seed cannot break a test: `OWNED_RECIPES_DIR`
overrides the directory the store loads (`config.ownedRecipesDir`), and the
integration and contract suites — every suite that boots the app — point it at
`tests/fixtures/owned-recipes/` so their counts are about the blend rather than
about what ships here this week.

No record carries a `photoUrl`: the R2 bucket does not exist yet
([#355](https://github.com/Zacplischka/dinner_app/issues/355)), and a committed
URL that 404s reads worse on a card than no photo at all.
