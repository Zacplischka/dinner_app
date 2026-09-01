# Dinder

Ephemeral group dinner decision-making: a host opens a short-lived Session, friends join with a code, everyone swipes on nearby Restaurants, and the overlap becomes the group's Match.

## Language

### Session flow

**Session**:
A short-lived shared decision room identified by a Session Code, holding at most four Participants, created into exactly one Branch. Expires automatically after inactivity; nothing about it persists afterward except a Shopping List it minted, which lives on its own clock.
_Avoid_: room, game, lobby — and never "cook Session" as a term of its own; a Session in the Cook Branch is just a Session

**Branch**:
The top-level choice a Session is created into — Eat Out, Takeaway, or Cook — picked up front on the entry screen and fixed for the Session's life.
_Avoid_: mode, flow, journey, path

**Deck**:
The stack of Restaurants or Recipes a Session deals its Participants to swipe.
_Avoid_: stack, feed, queue

**Session Code**:
The short shareable code participants use to join a Session.
_Avoid_: session id, PIN

**Invite Link**:
The URL that carries a Session Code to a phone that has not joined yet — `/join?code=<code>`, minted by the backend as `shareableLink` and shared by hand. Anyone holding it can join while the Session lives; it grants nothing once the Session expires. Not a Session Invite — that term is reserved for one Profile inviting a Friend through the social graph.
_Avoid_: share link, magic link, deep link — and never "Session Invite", which is the Friend-graph term

**Participant**:
A person inside a Session, including the Host.
_Avoid_: user, player, member

**Host**:
The Participant who created the Session.
_Avoid_: owner, creator

**Restaurant**:
A nearby dining option fetched for an Eat Out or Takeaway Session that Participants swipe on. The Cook Branch's counterpart is a Recipe.
_Avoid_: option, card, place (except in external-API contexts)

**Recipe**:
A cookable dish fetched for a Cook-branch Session that Participants swipe on, carrying title, image, ingredients, and instructions. The swiped card, the crowned Top Pick, and the thing you cook are all the same Recipe — there is no separate "Meal".
_Avoid_: meal (except in "meal type", a Craving criterion), dish, card

**Deck Entry**:
One entry of a Deck — the Restaurant or Recipe a Participant swipes on, and the unit the whole Selection path moves: dealt, swiped, live-selected, matched, crowned. Restaurant and Recipe are its only kinds; a Session's Branch decides which kind its Deck holds, and a Deck never mixes them. The name exists so code that must handle either kind has an honest word for it.
_Avoid_: card — the swipe UI draws an entry as a card, which is the rendering and not the thing — option, item

**Selection**:
A single Restaurant or Recipe a Participant swiped yes on.
_Avoid_: like, vote, pick (except in **Top Pick**)

**Live Selection**:
A Selection broadcast to the other Participants at the moment it is made, and shown to each of them only once they have swiped that Restaurant or Recipe themselves. Ephemeral chrome: it is never written to Redis and never affects the Match. Receivers hold it client-side, keyed by the sender's display name, so it survives the sender's reconnect.
_Avoid_: vote, live vote, real-time like

**Full House**:
A Restaurant or Recipe every current Participant has made a Live Selection on, seen mid-Deck before anyone has submitted. A Full House is a preview, not a Match — the Match is still computed at Submission and may not contain it. When the Participant list grows mid-Deck, a Full House can fire again for the larger group — but never twice for the same Deck Entry, and an already-shown one is never retracted.
_Avoid_: early match, instant match, mid-deck match

**Submission**:
A Participant's declaration that they are done selecting. A Submission may contain zero Selections — having submitted is a fact about the Participant, not about how many Selections they made.
_Avoid_: inferring "submitted" from a non-empty Selection set

**Match**:
The set of Restaurants or Recipes every current Participant selected, computed once all current Participants have a Submission — including when the last unsubmitted Participant leaves. May be empty.
_Avoid_: results, overlap, winners

**Top Pick**:
The single Restaurant or Recipe a completed Session crowns, together with the one-line reason it won. Chosen by most Selections, then the Deck Entry kind's own middle rung — a Restaurant's rating, a Recipe's aggregate likes — then name A-Z, from the Match when the Match is non-empty, from everything anyone selected when it is empty, and from the Session's open Deck when nobody selected anything. Only the middle rung differs by kind; the rule is otherwise one rule. Every completed Session with a non-empty Deck has exactly one Top Pick; a Session whose Deck is empty has none.
_Avoid_: winner, best match, recommendation, top result, the answer

**Near Miss**:
A Restaurant or Recipe selected by every current Participant except one. Surfaced only when the Match is empty and the Session has three or more Participants, always as a count ("2 of 3 liked this"), never with names. A Session with two Participants has no Near Misses — one person's Selections are not a near-Match.
_Avoid_: almost match, runner-up, partial match

**SessionStore**:
The sole keeper of everything a live Session remembers — Participants, Selections, Submissions, Restaurants, the Match, and the Session's remaining lifetime. All session state enters and leaves through it.
_Avoid_: models, repository, DAO

**Restart**:
Wiping all Selections, Submissions, and the Match of a Session so the same Participants can decide again. A Restaurant Deck is kept — restaurant supply is bound to where you are — while a Recipe Deck is dealt again from its Craving's pool, avoiding the just-wiped deal as far as the pool allows. A Restart never fails and never leaves a Session without a Deck.
_Avoid_: reset, replay

**Leave**:
A Participant's deliberate exit from a Session. They are removed and no longer count as current — leaving can therefore complete the Session for those remaining.
_Avoid_: disconnect, drop

**Disconnect**:
A Participant's connection dropping without them leaving. They remain a current Participant — the Match still waits on their Submission.
_Avoid_: leave, timeout

### Social

**Profile**:
A persistent account with a display name and avatar. Required for social features; NOT required to be a Participant — guests join Sessions with just a display name.
_Avoid_: user, account

**Friendship**:
The relationship between two Profiles. Exactly one of: pending, accepted, blocked.
_Avoid_: connection

**Friend**:
A Profile whose Friendship with you is accepted. A pending Friendship is a Friend Request, never a "pending friend".
_Avoid_: contact (the shared `Friend` type's `pending` status is legacy naming)

**Friend Request**:
A Friendship still in pending, seen from either side.
_Avoid_: invite (that word is reserved for Session Invites)

**Session Invite**:
A Profile inviting a Friend into a specific Session. One of: pending, accepted, declined, expired.
_Avoid_: friend request, invitation

**FriendsStore**:
The sole keeper of the persistent social graph — Profiles, Friendships, and Session Invites. All Supabase access for social data enters and leaves through it.
_Avoid_: models, repository, DAO

### Price comparison

**Platform**:
A food delivery app whose prices are compared (DoorDash, Uber Eats).
_Avoid_: provider, vendor, app

**Venue**:
A physical restaurant near the user's location. May have a Storefront on any number of Platforms, including none — which Platforms carry it is discovered when a Comparison is requested, not known in advance. Not a Restaurant — that word is reserved for the session swipe flow.
_Avoid_: restaurant, place

**Storefront**:
One Venue's presence on one Platform: its menu prices, delivery fee, and Deals. Service fees are out of scope — they are a percentage of the basket and don't exist without one. A Venue with a Storefront on only one Platform is still shown, flagged as such.
_Avoid_: listing, store

**Storefront Resolver**:
The per-Platform judge that turns a Platform's raw answer into this Venue's Storefront — or the verdict that the Venue is not on that Platform. "Not on the Platform" (a clean miss) is distinct from the Platform answering unusably (a failure); exactly one Resolver exists per Platform.
_Avoid_: scraper, fetcher, client, adapter

**Comparison**:
The side-by-side view of one Venue's Storefronts across Platforms — fees, Matched Items, and Deals. Always quoted for a non-member (no DashPass/Uber One pricing).
_Avoid_: quote, report

**Matched Item**:
The same dish appearing on two of a Venue's Storefronts, paired by normalized name so its prices can be compared. Unmatched items belong to a single Storefront and are listed, not compared.
_Avoid_: shared item, common item

**Deal**:
A Storefront-level promotion as reported by the data source (e.g. "20% off orders over $25"). Displayed, never applied; membership pricing is not a Deal.
_Avoid_: promo, offer, discount

**Cuisine**:
The kind of food a Venue serves (e.g. Italian, Asian Fusion), as reported by the search data — not a curated taxonomy. Venues are filterable by Cuisine; a Venue with no reported Cuisine is still a Venue.
_Avoid_: category, type, tag

**Snapshot**:
An immutable record of one Venue's Comparison at a moment in time. The newest Snapshot, if within the Freshness Window, serves as the current Comparison; the full set of a Venue's Snapshots is its price history. Snapshots are never updated or deleted.
_Avoid_: cache entry, record

**Freshness Window**:
How old the newest Snapshot may be and still serve as the current Comparison. A failed Snapshot has a much shorter window than a successful one — a failure is retried soon, a success is trusted for hours.
_Avoid_: TTL, cache expiry

### Group order

**Group Order**:
One shared basket that every Participant of a Session adds to from their own phone, for the Venue the Session matched on. It exists only in Redis for the life of the Session, is priced from a Pinned Menu, and ends when a Buyer locks it. Dinder never places it.
_Avoid_: cart, group cart, shared cart, checkout — **as names for the Group Order**. "Checkout" and "cart" refer only to the Platform's own, which is where the human actually pays, and this document uses them that way throughout.

**Pinned Menu**:
The Storefront menu copied verbatim out of a Snapshot into the Group Order when it opens, and never re-read. Item identity inside a Group Order is the array index into it, which is immutable because the copy is frozen and the source Snapshot is append-only (ADR 0005).
_Avoid_: cached menu, menu snapshot, catalogue

**Order Line**:
One Participant's quantity of one Pinned Menu item. Two Participants ordering the same dish are two Order Lines, never one — that is what makes the per-person split fall out with no line ids.
_Avoid_: cart item, basket item, order item

**Buyer**:
The Participant who tapped "I'll order". Claiming the Buyer and locking the Group Order is one action; the first tap wins and there is no transfer. Authority follows the money.
_Avoid_: host, owner, payer, orderer

**Share**:
What one Participant owes: their Order Lines plus their portion of the Buyer's stated delivery-and-fees number, split evenly across Participants with at least one Order Line. Shares always sum exactly to the Group Order total.
_Avoid_: split, tab, portion, IOU

### Cook

**Craving**:
The canonical triple a Cook Session's Deck is dealt from — meal type, cuisine set, diet set. Two Sessions with the same Craving draw from the same shared recipe pool. Diet is a preference filter, explicitly not an allergy-safety guarantee. Headcount is not part of a Craving.
_Avoid_: filters, preferences, criteria, setup

**Headcount**:
The number of people the Top Pick's ingredients are scaled to. Set at Cook setup; never part of the Craving — it scales servings, it doesn't filter the Deck.
_Avoid_: serves, servings, party size

**Shopping List**:
The priced, claimable list minted once from a completed Cook Session's Top Pick, its Ingredient Lines scaled to the Headcount. Lives on its own fixed lifetime that nothing extends, and outlives its Session: the URL is the capability — anyone holding it reads, claims, and unclaims, with no Participant check and no live Session required. Its headline is the list total across in-tally lines.
_Avoid_: cart, basket (both reserved for the Platform's own), grocery list, ingredient list

**Ingredient Line**:
One ingredient of the Top Pick, scaled to the Headcount, as it appears on the Shopping List: its recipe text and amount, its Product Match or degraded state, and its Claim. Created by the Recipe, never added by a person — people claim Ingredient Lines, they don't add them, which is what makes it not an Order Line. Always in exactly one of four states — Priced, Estimated, Unpriced-matched, Unmatched — and claimable in all of them.
_Avoid_: order line, item, list item, row

**Claim**:
The exclusive attachment of one Ingredient Line to one Shopper. The first tap wins; any Shopper may release any Claim, their own or not; taking over a freed line is its own deliberate act, never a side-effect of tapping a claimed one.
_Avoid_: assign, reserve, lock, take — and never Buyer, whose single-lock money-authority semantics are the opposite

**Shopper**:
Whoever holds and works a Shopping List, identified only by a self-declared display name. Every Participant can be one; a Shopper need not be a Participant — the housemate opening a forwarded link after the Session expired is the canonical case.
_Avoid_: participant, buyer, claimer, user

**Cook View**:
The Shopping List read at the stove: the crowned Recipe's instructions, snapshotted into the list at mint and rendered whole on one screen, each step dimmable by tapping it. Lives on the Shopping List's own URL and inherits everything about it — the same lifetime, the same capability, the same Shopper — so it works after the Session, the pool, and the source's own memory of the Recipe are all gone. Closed, for a Sourced Recipe, by one source credit naming the originating recipe site with a backlink — a licence obligation of that supply, not a style choice — which is also what stands in for a Sourced Recipe whose instructions were never snapshotted. An Owned Recipe renders no credit, and the absence is correct, not a defect.
_Avoid_: cooking mode, recipe page, method screen

**Tally**:
What one Shopper will spend on their claimed Ingredient Lines: the sum of their Priced and Estimated lines, ≈-prefixed whenever an Estimated line is in it, with claimed-but-unpriced lines shown as a count. Not a Share — nobody fronts, nobody owes; a Tally is a preview of your own receipt, not a debt. Distinct from the list total, the Shopping List's headline over all in-tally lines regardless of claimer.
_Avoid_: share, split, bill, owed, total

**Staple**:
One of a small hardcoded set of ingredients assumed already at home. Still an Ingredient Line — claimable exactly like any other — but rendered muted in its own pantry section and excluded from every count: the list total, every Tally, and the claimed-coverage count.
_Avoid_: pantry item, basics, essentials

**Retailer**:
A grocery chain whose products price Shopping Lists — in v1, exactly Woolworths, and the UI names it. Not a Platform: a Platform is a delivery app whose Storefronts are compared; a Retailer is a grocer whose products are matched. A Retailer has no Storefronts.
_Avoid_: platform, store, supermarket, source

**Product Match**:
The pairing of an Ingredient Line with one Retailer product — pack size, pack price, deep link — plus the runner-up candidates behind the swap picker; "none of these" demotes the line to Unmatched. Not a Matched Item, which is a delivery-menu term.
_Avoid_: SKU, listing, matched item

**Product Matcher**:
The per-Retailer judge that turns a Retailer's raw search answer into an Ingredient Line's Product Match — or the verdict that no product fulfils it. A clean miss is distinct from the Retailer answering unusably (a failure); exactly one Matcher exists per Retailer. The Storefront Resolver pattern, deliberately not its name or its code.
_Avoid_: resolver, scraper, fetcher, adapter

**Owned Recipe**:
A Recipe Dinder authored into the Owned Recipe Store: identified by an `owned:<frozen-slug>` placeId, servings always present, diets declared, written in AU vocabulary — and rendering no source credit, whose absence is correct. Never ages out: dealt today or months from now, it is the same Recipe. In a Deck it is just a Recipe — Deck, Selection, and Top Pick language never forks on provenance.
_Avoid_: house recipe, custom recipe, our recipe

**Sourced Recipe**:
A Recipe supplied by an external source under licence — today, exactly Spoonacular. Carries its source's credit obligation into the Cook View and lives under its pool's TTL; past it, the source's memory of the Recipe is gone.
_Avoid_: vendor recipe, external recipe — and "Spoonacular Recipe" only in external-API contexts

**Owned Recipe Store**:
The versioned, human-reviewed corpus of Owned Recipes committed to the repository and shipped with the backend, read through an interface (ADR 0011). Blended into every Cook Deck at deal time; images live in object storage, not the repo.
_Avoid_: corpus — the pipeline's word for the authored collection, not the runtime store — database, library

**Fact Record**:
The structured artefact the corpus pipeline's reading stage emits — a dish's identity, canonical ingredient set, per-source quantity ranges and observed servings, causal step sequence, technique facts, and source URLs — and the only artefact of reading that may persist. It also records the candidates the stage refused to read and why (a robots.txt disallow, a robots.txt it could not read, a UK/EU publisher), so the audit trail carries the refusals as well as the reads. It holds no coverage plan: which cuisine or diet cell a dish was read for belongs to the stage that plans the corpus, not to the reading of the dish. Authoring writes from the Fact Record with every source closed; that separation is the re-authoring standard's spine, not a pipeline convenience.
_Avoid_: notes, extract, research summary

**Nearest Craving**:
The neighbouring Craving offered inline when a Craving's deal comes up empty: cuisine widened or dropped — never diet, never meal type — shown with the Recipe count it can actually deal. Accepting mints it as a genuinely new Craving with its own pool; the original Craving is never silently widened.
_Avoid_: relaxed craving, suggestion, fallback
