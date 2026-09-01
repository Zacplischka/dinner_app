# Owned Recipes are authored from Fact Records, never from pages

The Owned Recipe Store is built by reading published recipes and authoring our own. This record fixes the standard that makes that lawful-by-design in Australia, and writes down the risk knowingly accepted. It stands alone rather than amending ADR 0004 or 0010: those read prices and compete with nobody; this reads creative works to build a commercial corpus in the same market. Settled in [#315](https://github.com/Zacplischka/dinner_app/issues/315) on the copyright research of [#311](https://github.com/Zacplischka/dinner_app/issues/311); enforcement proven in the [#319](https://github.com/Zacplischka/dinner_app/issues/319) pilot.

**The standard — author from the dish, not from the page.**

- The reading stage may take only facts: a dish's identity, its canonical ingredient set, quantities/times/temperatures as per-source observations, the causal step sequence, technique facts. It emits a structured **Fact Record** and is forbidden from emitting prose.
- Authoring runs with every source closed — no source text in context. Step wording, method structure, titles (plain dish names), and the final AU-metric amounts are independently produced; the authored quantity set never reproduces one source's verbatim (*Dynamic Supplies*' "indicia of copying" is the failure mode this kills).
- **≥3 independent publishers per Recipe**, found by dish-name search, never by walking any site's index or sitemap (a compilation's selection is itself protected; UK/EU sources add a database right Australia lacks and are avoided).
- **robots.txt is honoured absolutely**, including AI-agent disallows — ignoring it feeds s 115(4) flagrancy. The pilot measured ~25 major recipe domains disallowing AI agents; AU supply remains ample without them.
- Fact Records (with source URLs) are the only persistent artefact of reading, committed with the corpus as the audit trail. Raw source text exists transiently within a pipeline run solely for the overlap check, then is deleted.
- Enforcement is **architectural plus checked**: stage separation by construction, and an in-run overlap checker (shared 5-gram shingles, 12-word verbatim runs, quantity-set fingerprint) against the just-read sources before they are discarded. A flag is a re-author.

**No credit line, ever.** An Owned Recipe names no source. A "researched from X" credit buys no licence and is a written admission of access; if the re-authoring is genuine, no protected work was reproduced and no moral right is engaged. The Cook View treats the absent credit as correct via the Shopping List's optional `provenance` field — absent still reads as Spoonacular, because the vendor credit is a licence obligation that must survive data glitches ([#314](https://github.com/Zacplischka/dinner_app/issues/314)).

**The posture — accepted knowingly, in [#237](https://github.com/Zacplischka/dinner_app/issues/237)'s shape.**

- What is accepted: in Australia, recipe-facts-are-free is a prediction from *IceTV*, not a statutory exclusion, and no Australian court has ruled on a recipe. No fair use exists here; a TDM exception was formally ruled out in 2025.
- Reversal cost: materially better than the vendor risk the corpus hedges — the corpus is deletable, and a deployed asset is one redeploy from gone.
- What reopens this: any Australian judgment on copyright in a recipe; a cease-and-desist from any publisher; enforcement activity against AI recipe corpora. No lawyer engaged at pilot scale; counsel before corpus-scale publication remains open to the operator's judgement.

## Consequences

- Owned Recipes ship commercially with no per-Recipe licensing and no attribution surface; the corpus's lawful basis is the discipline above, so the pipeline's gates are compliance controls, not style checks.
- The audit trail (Fact Records + this record) is the demonstration that the rules held for any given Recipe.
- Sourced and Owned Recipes coexist in one Deck under different obligations — credit for the vendor, silence for our own — and the provenance field keeps a data glitch from ever converting one into the other.
