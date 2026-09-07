# Dinder UX refresh

Status: accepted. Shared understanding confirmed by the user on 2026-09-07 after the grill-with-docs interview. This brief records the agreed product direction; remaining implementation and design details are listed below. Implementation is on `codex/epic-434`; validation and the remaining diagnostic evidence are recorded in [the implementation report](epic-434-implementation.md). Delivery is tracked in [epic #434](https://github.com/Zacplischka/dinner_app/issues/434).

## Product intent

Make Dinder immediately understandable and inviting, and make choosing together collaborative from the moment people enter a Session. Preserve the swiping interaction and comfortable phone layout that the user already likes.

## Entry and identity

1. Choose Eat Out, Takeaway, Cook or Watch to create a Session and enter its Lobby.
2. Invite people before settling the shared choices. Participants can join and see each other while choices are being made.
3. Signed-in people use their existing valid name without a separate name form. Prompt when it is missing, invalid or already taken in the Session. Guests enter a name. Preserve name uniqueness and input validation; do not silently invent a replacement identity.
4. Everyone, including the Host, explicitly confirms Ready. Choosing no preferences (“happy with anything”) is valid.
5. The Host starts swiping once everyone is Ready. Everyone swipes the same shared Deck.

## Shared choices

- Watch genres, decades and media types combine across Participants. An unselected choice means no preference, not exclusion. One person’s choices do not veto another’s.
- Balance representation across Participants. Shared interests may get extra weight without crowding out someone else’s interests.
- When the group chooses both movies and series, the Deck meaningfully represents both. This also applies when one Participant chooses movies and another chooses series. Target an even split when eligible supply permits; odd-sized Decks differ by at most one, and scarce supply fills from the other type without duplicates or invented entries.
- Decades remain optional. The 1990s and 2020s, if selected by different Participants, both contribute.
- Cook cuisine interests combine like Watch genres.
- Every Cook Recipe must satisfy every Participant’s Dietary Requirements. If nothing fits, explain the conflict or lack of supply and let people explicitly adjust their choices. Never silently relax a diet. Diet labels remain distinct from an allergy-safety guarantee.
- Cook uses one shared meal type, defaulting to Main course. Put other types behind an optional “Change meal type” control.
- Eat Out and Takeaway use one shared search location and radius, set in the Lobby after people can join.
- Any Participant may change the shared meal type, location or radius. These changes clear everyone’s Ready status. Changing personal choices clears that Participant’s Ready status.
- Retain existing Host ownership, defaults and bounds for Headcount and Deck size, with those controls in the Lobby. Changes clear everyone’s Ready status.

## Joining, waiting and returning

- A temporary Disconnect neither removes someone nor confirms Ready. The Host can explicitly remove someone who disappears before confirming Ready, allowing those remaining to proceed once all are Ready.
- Late joiners use the existing Deck, with a clear explanation that their preferences apply next round. Do not change the Deck midway.
- Exception: a Cook late joiner whose Dietary Requirements conflict with the current Deck waits until the Host confirms returning the group to preferences and starting a fresh Deck that satisfies everyone. Everyone confirms Ready again and the round starts over.
- Ordinary Host Restart returns the group to its Lobby with existing choices retained and editable. Everyone confirms Ready again before a fresh round is dealt.
- The Dinder logo goes home immediately and is consistently available, including on the Shopping List and Cook View. Going home preserves Session participation; home shows a prominent “Return to session” action while that Session remains available.
- “Leave session” explicitly removes participation. Going home is not a Leave.

## Results and Recipe information

- Watch keeps one prominent Top Pick, with every other Movie or series selected by all current Participants immediately visible underneath. This changes presentation, not the Match or Top Pick definitions.
- Recipe details during swiping show a description, cuisine, cooking time and ingredients. Missing fields and content quality need investigation; no invented descriptions, times or prices.
- Live Woolworths pricing runs only after the group chooses the Recipe, avoiding a pricing wait for each Deck candidate.
- While pricing runs, people can immediately read the chosen Recipe’s ingredients and cooking instructions. Show an honest “Prices are still loading” status; show the priced list when ready. Do not invent progress percentages.

## Visual direction

- Warm and image-led: appetising food photography, cinema imagery, bold colour and subtle motion. Preserve the compact phone layout and accessibility basics, including reduced-motion behaviour.
- Explain the value immediately. Working copy: “Find something everyone’s into” and “Get together. Swipe your favourites. Decide tonight.”
- Join with a code and Compare delivery prices become clearly visible actions.
- Carry the stronger visual character into Cook choices. Flags, emoji and food imagery were suggestions in the original feedback, not a requirement to use country flags for every cuisine. Exact controls and assets remain design work.

## Findings and reported defects

These are code observations, not claims of production reproduction. Inspected main at f4c50cd.

- **Watch mix:** the corpus contains 4,999 movies and 999 series. MovieDeckService filters, takes the first 120 candidates, then shuffles. Without genre or decade restrictions, those 120 contain 116 movies and four series. There is no balancing by media type, so selecting both does not ensure both appear; this explains a plausible route to the reported movie-only Deck. The user’s exact selected genres, decades and Deck size are unknown.
- **Other Watch matches:** ResultsPage deliberately hides all but the Top Pick today. The agreed presentation change reverses that choice.
- **Recipe details:** Deck entries currently carry identity, title, photo and aggregate likes; DeckEntryDetails deliberately excludes Recipes. More Recipe data must reach the swipe screen.
- **Name autofill:** useProfileName already seeds Create, Join, Cook and Watch from full_name when available, but the form remains visible. The reported blank name still needs reproduction. ADR 0009 requires names to remain unique within a Session.
- **Pricing wait:** the current Shopping List read waits for pricing to finish, so both the list and Cook View wait for the full payload. Recipe access during pricing requires a change to that delivery behaviour. Actual latency has not been measured here.
- **Recipe instructions:** Cook View renders stored steps verbatim. Sourced Recipe steps are copied from the source without sentence-spacing normalisation. Missing spaces and potentially incorrect step order remain unconfirmed; investigate real affected data before changing text processing.
- **Recipe image:** the user reported an odd image for an Armenian stew. The exact Recipe has not been identified; investigate its source and image before treating this as a general image issue.
- **Landing page:** HomePage currently uses emoji Branch cards with a short description, then a lower text row for Join with a code and Compare delivery prices.

## Remaining implementation and design work

- Specify and verify Deck balancing when interests overlap or suitable supply is scarce; meaningful representation must reflect available data.
- Reuse existing Host succession semantics unless a separate decision revises them. Verify return-home behaviour when a Session advances or expires and when creating or joining a different Session.
- Design empty, loading and failure states for richer Recipe data and pricing. Preserve Shopping List lifetime, source attribution and pricing accuracy.
- Investigate and fix confirmed name, Movie mix, instruction-formatting and image defects, with focused checks of each affected flow.
- Produce the actual layouts and image treatment against the agreed visual direction.

Architecture rationale: [Gather before choosing the Deck](adr/0015-gather-before-choosing-the-deck.md). Domain vocabulary: [CONTEXT.md](../CONTEXT.md).
