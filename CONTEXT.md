# Dinder

Ephemeral group dinner decision-making: a host opens a short-lived Session, friends join with a code, everyone swipes on nearby Restaurants, and the overlap becomes the group's Match.

## Language

### Session flow

**Session**:
A short-lived shared decision room identified by a Session Code, holding at most four Participants. Expires automatically after inactivity; nothing about it persists afterward.
_Avoid_: room, game, lobby

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
A nearby dining option fetched for the Session that Participants swipe on.
_Avoid_: option, card, place (except in external-API contexts)

**Selection**:
A single Restaurant a Participant swiped yes on.
_Avoid_: like, vote, pick

**Submission**:
A Participant's declaration that they are done selecting. A Submission may contain zero Selections — having submitted is a fact about the Participant, not about how many Selections they made.
_Avoid_: inferring "submitted" from a non-empty Selection set

**Match**:
The set of Restaurants every current Participant selected, computed once all current Participants have a Submission — including when the last unsubmitted Participant leaves. May be empty.
_Avoid_: results, overlap, winners

**Near Miss**:
A Restaurant selected by every current Participant except one. Surfaced only when the Match is empty and the Session has three or more Participants, always as a count ("2 of 3 liked this"), never with names. A Session with two Participants has no Near Misses — one person's Selections are not a near-Match.
_Avoid_: almost match, runner-up, partial match

**SessionStore**:
The sole keeper of everything a live Session remembers — Participants, Selections, Submissions, Restaurants, the Match, and the Session's remaining lifetime. All session state enters and leaves through it.
_Avoid_: models, repository, DAO

**Restart**:
Wiping all Selections, Submissions, and the Match of a Session so the same Participants can decide again.
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
