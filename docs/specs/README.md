# Sprint plan: from a swipe to a doorstep

Today Dinder gets a group to a Match and then abandons them — sometimes without even naming a restaurant.
Across four sprints it always names one, the invite link stops looking like spam, the whole table builds one
basket from their own phones off the real Storefront menu, and the deck itself becomes a room you can hear.

Specs: [top-pick.md](top-pick.md) · [tap-to-join-invite.md](tap-to-join-invite.md) ·
[group-order.md](group-order.md) · [live-swipe-room.md](live-swipe-room.md)

24 issues, **19.625 days**. All four specs are reviewed and decomposed; nothing below is speculative.

## Sprints

### Sprint 1 — Dinder always answers (5.875d, 9 issues)

Goal: every completed Session names exactly one restaurant, and the link you send your friends unfurls as a
card instead of a bare URL.

**Demo at the end:** three phones swipe with zero overlap, and the results screen still says
**Tonight's Pick — Pho Bar, liked by 2 of 3**.

| issue | days | depends on | spec |
|---|---|---|---|
| Crown a Top Pick server-side and widen `session:results` | 1 | — | top-pick |
| Crown the Top Pick on the results screen | 2 | backend crown | top-pick |
| Reconcile the specs with the Top Pick crown SADD | 0.125 | backend crown | top-pick |
| Sink closed restaurants to the bottom of the restaurant search sort | 0.5 | — | top-pick |
| Verify and close #12 against its existing leave-completion regression tests | 0.25 | — | top-pick |
| Unfurl the Invite Link as a branded card in chat apps | 0.5 | — | tap-to-join |
| Open the native share sheet from the lobby screen's share button | 0.25 | meta tags | tap-to-join |
| Land expired Invite Links on a dead-link card instead of the join form | 1 | meta tags | tap-to-join |
| Resync this sprint plan with the corrected group-order and live-swipe-room specs | 0.25 | — | — |

Two notes on that table, both from the final review:

- The crown **`SADD`** — the store op, the `completeSession` block and its unit test — ships inside
  *Crown a Top Pick server-side*. The 0.125d *Reconcile the specs with the Top Pick crown SADD* row is **doc reconciliation only**
  (top-pick.md :161/:348/:395, group-order.md:818-820, the `sessionStore.ts:52` comment) plus the acceptance
  lines that verify the code landed. Do not write the store op twice.
- `backend/tests/integration/results-no-overlap.test.ts:43,49` calls `store.computeAndStoreResults` directly
  and never touches `SessionService.completeSession`, so its `['__empty__']` assertion stays correct.
  Change the `it` title and add a comment; **do not widen the assertion** — CI does not run `test:integration`,
  so a red one rots there unseen.

### Sprint 2 — A basket exists (4.0d, 3 issues)

Goal: from the crowned card you can open a Group Order for the matched Venue and see its real menu — and
every way that can fail has a screen with a working button on it.

**Demo at the end:** tap `Order together` on the crowned card and the real Uber Eats menu opens — eight
sections, 51 items, real prices — pinned to that Venue.

| issue | days | depends on | spec |
|---|---|---|---|
| Fix DoorDash multi-buy pricing and de-duplicate the captured menu | 0.5 | — | group-order |
| Land the Group Order contract, keyspace and `order:open` with ADR 0009 | 1.5 | DoorDash money, crown SADD | group-order |
| Open a Group Order from the crowned card and give every failure a screen | 2 | contract | group-order |

The contract issue's dependency on the crown `SADD` blocks the *demo*, not the build: `order:open` does a
`SISMEMBER` against `session:{code}:results`, so a crowned no-Match Top Pick is un-orderable until sprint 1's
`SADD` lands. It compiles either way. **ADR 0009 is written here** (`docs/adr/` holds 0001–0008 today, so the
number is free) and sprint 4 cites it.

### Sprint 3 — One basket, four phones, one payer (5.0d, 5 issues)

Goal: Order Lines land on everyone's phone as they are added, `I'll order` locks the basket and hands off to
the Buyer, and the fee split is honest.

**Demo at the end:** two phones, one basket, rows landing in each other's colours — `I'll order` locks it,
opens the exact Uber Eats store page, and the other phone reads `You owe $31.20`.

| issue | days | depends on | spec |
|---|---|---|---|
| Broadcast Order Lines so every phone builds one live basket | 2 | order page | group-order |
| Lock the basket on `I'll order` and hand off to the Buyer | 1.5 | live basket | group-order |
| Split the Buyer's delivery fee live from a dollars input | 0.5 | lock/handoff | group-order |
| Clear the Group Order on Restart and confirm before leaving a basket | 0.5 | order page, lock/handoff | group-order |
| Stop a socket rejoin from wiping an already-recorded Submission | 0.5 | — | — (bug found by this plan) |

Three carry-overs the review caught, worth a glance before starting each:

- The live-basket store op is `setOrder(order, menu?)` — created by sprint 2 with `menu` as the second
  positional. Add `change` as a **third** parameter or a separate `setChange`, never in the `menu` slot.
- `frontend/src/utils/money.ts` already exists by sprint 3 (sprint 2 lifts `formatPrice` into it). The fee
  issue only *adds* `parseDollarsToCents`.
- The pinned totals band must carry `safe-bottom` (`index.css:192`) — it sits exactly where the iPhone home
  indicator is. Assert it in `selectionMobileGeometry.test.tsx` alongside the live-basket work; sprint 2
  deliberately deferred it and no issue picked it back up.

### Sprint 4 — The Live Swipe Room (4.75d, 7 issues)

Goal: the deck stops being silent, and the Lobby stops claiming a dropped friend is Live.

**Demo at the end:** two phones like the same card seconds apart — both decks are interrupted by the Full
House takeover, one tap on `Finish here` on each and the Session completes on that Venue.

| issue | days | depends on | spec |
|---|---|---|---|
| Record displayName-keyed ephemeral group state as ADR 0009 + glossary terms | 0.25 | — | live-swipe-room |
| Broadcast a Live Selection over a new `selection:live` command | 0.5 | ADR 0009 | live-swipe-room |
| Send a Live Selection on every like and buffer incoming ones in the store | 0.5 | contract | live-swipe-room |
| Reveal a Live Selection in the deck strip once you have decided that card | 1.5 | store/transport | live-swipe-room |
| Interrupt the deck with a Full House takeover (`Finish here` / `Keep swiping`) | 1 | reveal buffer | live-swipe-room |
| Show a dropped Participant as Offline in the Lobby and the deck (closes #6) | 0.5 | — | live-swipe-room |
| Verify the Live Swipe Room by hand across two and three real phones | 0.5 | reveal, Full House, presence | live-swipe-room |

If sprint 2 already wrote ADR 0009, row 1 shrinks to the CONTEXT.md terms and a citation. Its README edits
are already done by sprint 1's resync — verify, don't repeat.

The old demo line `2 of 2 liked Pho Bar` is **unreachable** and has been removed: two mutual likes are by
definition a Full House, so the takeover fires instead of the strip. The strip's like branch needs three
phones (`2 of 3`), which is what the device-pass issue covers.

## Critical path

**Crown backend (1) → results screen (2) → order page (2) → live basket (2) → lock/handoff (1.5) → fee split
(0.5) = 9.0 days, strictly serial.** That chain is the product; everything else fits around it.

- `DoorDash money (0.5) → contract (1.5)` = 2.0d and runs *beside* the 3.0d Top Pick chain. It is never the
  long pole, so start it whenever sprint 1 is blocked on a copy decision.
- The order page and the Top Pick results screen both rewrite `ResultsPage.tsx`, and `Order together` is
  gated on the `isCrown` prop of the **extracted `MatchCard`**. Land Top Pick first or issue 2b does the
  extraction itself and you merge the crown by hand.
- Unblocked filler, do any of it while waiting: `open-now-sink` (0.5), `close-issue-12` (0.25),
  `resync-sprint-plan-readme` (0.25), `rejoin-preserves-submission` (0.5), `honest-presence` (0.5), #90.
- Sprint 4's own chain is `ADR (0.25) → contract (0.5) → transport (0.5) → reveal (1.5) → Full House (1) →
  device pass (0.5)` = 4.25d. It is **mostly** independent of sprints 2–3 but not fully: it shares
  `sessionStore.ts`, `types.ts` and `socketBindings.ts` with the Top Pick crown. If Group Order stalls on
  Apify, pull sprint 4 forward whole — it touches `SelectionPage`, not `ResultsPage`.
- Fix `rejoin-preserves-submission` **before** sprint 4. Sprint 4 lives on the same page, and the wipe looks
  exactly like a Live Selection bug when it surfaces.

## Existing issues

| issue | what happens | why |
|---|---|---|
| **#12** — Session stalls when a Participant leaves | **Close, zero code** (the 0.25d sprint-1 task is verification + a comment). | Fixed in `f725a77` the day it was filed: `SessionService.ts:493-501` completes the Session when the leaver was the last holdout, `leaveHandler.ts:88-94` broadcasts `session:results`. Regression tests already exist at both levels (`SessionService.test.ts:643`, `websocketHandlers.test.ts:396`) — do not write a third. |
| **#14** — Restart doesn't move the other phones | **Close as already fixed.** No new issue. | `ResultsPage.tsx:243-249` navigates on `sessionStatus === 'selecting'` off `socketBindings.ts:173-179`; tests at `resultsPage.test.tsx:275-318`; landed `bd42aee`. The issue's `socketService.ts:109` reference is a dead file. |
| **#68** — Comparison kill-gate epic | **Close the epic.** No sprint work. | All four children (#69–#72) closed 2026-07-17; instrumentation ships at `SessionService.ts:385-419`, both rate limits at `comparison.ts:30-31` / `redirect.ts:20`. Only live action is *reading* the accumulated `Session outcome` log before sprint 4. |
| **#6** — Realtime presence indicators | **Absorbed into sprint 4's `honest-presence`.** Rewrite the issue scope before starting. | v1 is `isOnline?: boolean` on the frontend `Participant` type flipped from events already on the wire — no `session:{code}:online` Redis set, no `participant:presence` event. Half a day instead of the issue's two, with a `ponytail:` note that a pre-join disconnect and your own reconnect both stay invisible. |
| **#90** — Hero photo hides forever on first error | **Leave open, standalone, ~0.5d.** Not covered by any spec. | `ResultsPage.tsx:142-153` and `ComparisonViewPage.tsx:268-281` both set a permanent failure flag with no retry. Extract `VenuePhoto` (`ComparePage.tsx:39-64`) and mount it with `key={url}` — it never resets on a `url` change and `ComparisonViewPage.tsx:210` genuinely swaps the hero mid-stream. Schedule right after the Top Pick results screen, when the crowned card gains a photo worth retrying. |
| **#84** — Home action hierarchy and social-proof copy | **Leave alone.** Blocks nothing, blocked by nothing. | Pure Home-page design, outside all four specs. Its only contact here is the hero image the og tags reuse (`frontend/public/images/neon-night-market.jpg`); if a branded 1200×630 og render is commissioned, do it in the #84 pass rather than blocking sprint 1. |

The reconnect Submission wipe this plan discovered is now a filed sprint-3 issue
(`rejoin-preserves-submission`): `socketBindings.ts:44-54` auto-rejoins on `connect`,
`SessionService.ts:315-325` does `removeParticipant` + `addParticipant`, which DELs the selections key
(`sessionStore.ts:326`) and resets `hasSubmitted: '0'` (`sessionStore.ts:310`), while `SelectionPage.tsx:22`
holds `hasSubmitted` in React state — so the phone waits forever. Group Order dodges it by keying Order Lines
on display name, not `participantId`.

## Open questions for the product owner

Five, all copy or scope, none blocking a start:

1. **Does the no-Match screen stop announcing failure?** `Tonight's Pick` replacing `No Match Found`.
   Needed before the sprint-1 results screen is written.
2. **Is a crowned-card `Compare prices` tap acceptable as `near_miss`,** or does it need a new `top_pick`
   source? It dilutes the bucket #68's log is being read for.
3. **Photo-only og card for v1,** or commission a branded 1200×630 render with #84? Photo-only ships now.
4. **One expired-link message for both a dead Session and a typo,** or two? One is half the work and cannot
   leak whether a code ever existed.
5. **Keep the "Sam already started a basket for Noodle House" notice?** `isCrown` makes it unreachable from
   the UI, but the command stays callable. It is one string and one conditional to cut.

Resolved since the specs were written, do not re-ask: ADR **0009** is free and is written by sprint 2's
contract issue; the deck-behind-overlay inertness mechanism is the implementer's call.

One thing the product owner owns that no issue does: **the product brief still says "6-char code" —
`shared/types/models.ts:4` is `SESSION_CODE_LENGTH = 5`.**

## Risks

| risk | early warning | cheapest mitigation |
|---|---|---|
| **The matched Venue has no Storefront on either Platform**, so Group Order has nothing to show. Kills the headline feature for a real fraction of venues and no engineering fixes it. | The `no_menu` branch firing in hand testing more than occasionally; `npm run compare:smoke` returning empty menus for venues that obviously deliver. | Already sequenced: the `no_menu` dead-end screen with two delivery-search buttons ships in **sprint 2's order page**, before a line of basket code. If the rate is high, stop after sprint 2 — you will have spent 4d, not 9d. Note the revised split: a `failed` Storefront is retryable (2-min cache), only `not_found` is permanent, so one flaky Apify window no longer masquerades as "no menu". |
| **Apify actor payload drift.** Third-party marketplace code; a shape change silently empties menus or corrupts prices, and CI has no live gate. | `npm run compare:smoke` (the only live check, run by hand) failing, or DoorDash prices reading equal to Uber Eats when they are not. | Committed fixtures in `backend/tests/fixtures/comparison/` stay the regression signal. Run `compare:smoke` by hand twice — start of sprint 2 and before the sprint-3 handoff issue. Not continuously. |
| **The two 2d issues are back-to-back on the critical path and both are underestimated.** The order page carries a route, a store, a three-band page, two file extractions, a persisted field, a socket binding, a reconnect re-fire and eight failure screens; live basket carries two store ops, a service method, a handler, two transport shims and ~8 UI behaviours across four suites. | Either one still open on day 3. | Pre-agreed cut lines: drop the `DeliveryActions` / `money.ts` extractions off the order page (0.25d, they ride with live basket), and drop the `aria-live` announcement + progress line off live basket (0.25d, they ride with lock/handoff). Cut, do not extend the sprint. |

## Decisions already made

Do not relitigate. Each names the one thing that would justify reopening it.

- **The gold star / "this one" override button** — cut. The crown is computed, not voted. Revisit if the
  session-outcome log shows Restart rate climbing after crowned no-Match endings.
- **The runoff round** — cut. One crown, one screen, no second deck. Revisit only if the tally is routinely a
  tie that most-liked → rating → A-Z resolves arbitrarily *and* users say so.
- **"Nearest" as a tie-break** — cut, and not a preference: `Restaurant` has no distance field. Revisit only
  if `RestaurantSearchService` starts returning distance for another reason.
- **The `/j/:code` short route and the Caddy reverse-proxy work** — cut. og tags on the existing URL do the
  whole job. Revisit if link length is observed to actually stop people pasting.
- **Free-text menu entry** — cut. The menu is the real Apify Storefront capture or there is no basket.
  Revisit only if the `no_menu` rate makes Group Order dead for most venues — a "kill the feature"
  conversation, not an "add a text box" one.
- **Any payment rail, split settlement or "mark as paid"** — cut. ADR 0009, written by "Land the Group
  Order contract, keyspace and `order:open`" (#175), forbids Dinder holding a credential; the terminal
  step is a human tapping `Open Uber Eats`. Reopening the decision means amending ADR 0009.
- **`order:done`, the `d:{displayName}` namespace, the `done[]` field and the `I'm done / Still picking`
  button** — cut in revision. Four commands became three; the roster shows live subtotals off `shares` and
  progress derives from `lines[].by`. Revisit only if testers cannot tell when everyone has finished picking.
- **`imageUrl` and `snapshotId` on the order hash** — cut in revision. Neither had a reader and ADR 0007
  makes a contract field permanent. Revisit when something actually renders them.
- **Retracting a Live Selection on Undo (outgoing)** — cut. Your Undo clears the *incoming* reveal and
  suppresses re-announcement; it does not un-send what other phones already saw.
- **Server-side presence truth** — cut. `honest-presence` is client-side only, and your own reconnect resets
  every badge to Live because `joinSession` replaces the participant list. Recorded, not a defect.

**Two things were un-cut in revision — treat these as decided *in*, not out:**

- **The Top Pick is group-orderable.** `completeSession` `SADD`s the crowned placeId alongside `__empty__`,
  and `session:{code}:results` now means "the placeIds this Session may act on", not "the Match".
- **Ending the Session on a Full House is owned, not cut.** Every phone raises the overlay; a unanimous
  `Finish here` completes the Session through the existing all-submitted path and the Full House becomes the
  Match. Only a *server-side* early-completion path remains out of scope.

## Cost

**Apify.** One cold Comparison = one Uber Eats run + one DoorDash run = **US$0.164–0.20**. This plan does not
change that number: Group Order adds no new Apify surface, it reads the Snapshot the Comparison already wrote.

```
cap                     $5.00 / month  (Apify free plan, hard)
cold Comparison         $0.164 – $0.20
group order, warm       $0.00          fresh Snapshot < 6h → ComparisonService.ts:79
                                       returns before fetchPlaceDetails on :90
4 phones open at once   $0.00 extra    in-flight dedupe, ComparisonService.ts:134-141
                                       → one actor run, not four

$5.00 / $0.20  = 25 cold Venues per month   (worst case)
$5.00 / $0.164 = 30 cold Venues per month   (best case)
```

**The cap allows ~25 group orders per month over Venues nobody has looked at yet, and an unlimited number
over any Venue compared in the last six hours.** The billable unit is the *Venue*, not the group order: a
table that compares prices then orders together spends once, and a second group hitting that Venue the same
evening spends nothing. A `failed` Storefront is cached for only 2 minutes, so a flapping actor can retry —
that is the one path that can spend twice on one Venue, and the 5-cold-comparisons/IP/hour limit
(`comparison.ts:30-31`) is what stops it burning the month in an afternoon.

If the cap bites, the fix is one constant: widen the 6h Snapshot freshness window (ADR 0005 already records
it being widened once for exactly this reason). Do not build a cache.

**Google Places.** Every sprint is Places-neutral or negative.

- **Top Pick:** zero new calls — the crown is computed from the deck and tally already in memory, and
  `photoUrl` rides data already fetched.
- **Tap-to-Join:** zero — the expired-link probe is one Redis read through the existing
  `GET /api/sessions/:sessionCode`, and reads never `touch()`, so it does not even extend the 30-min TTL.
- **Group Order: negative.** The handoff opens `StorefrontCapture.storeUrl` from the pinned Snapshot instead
  of `redirect.ts`'s Places-billed search deep link — one fewer Places call per group that orders.
- **Live Swipe Room:** zero — `selection:live` is a pure re-broadcast, no external API, no Redis write.
