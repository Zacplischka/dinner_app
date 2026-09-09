# Epic #434 implementation

Historical implementation record from 7 September 2026. Checks below apply to that implementation, not later revisions or the current deployment.

Work branch: `codex/epic-434`. Review baseline: `f4c50cd` (the starting `main`).

| Issue      | Delivered behavior                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #435       | Warm image-led home, immediate value statement, prominent join/comparison actions, phone/desktop layout and reduced-motion support. See [image provenance](home-imagery.md). |
| #436       | Signed-in names automatically enter; delayed auth, invalid metadata and name collisions retain recoverable entry. Switching Sessions is explicit.                            |
| #437       | Separate Movie/series supply before allocation; balanced mixed Decks with scarcity fallback and repeat avoidance.                                                            |
| #438       | Gather before dealing, explicit Ready for everyone, Host starts; server revisions protect choice/start races.                                                                |
| #439       | Watch interests combine with balanced Participant representation.                                                                                                            |
| #440       | Personal cuisines and dietary requirements; shared Main course default, meal type and Host headcount/deck size; diets never silently relaxed.                                |
| #441       | Shared search location/radius chosen in the Lobby, with manual/current-location controls and deferred Restaurant search.                                                     |
| #442       | Host can explicitly remove an absent, unready Participant.                                                                                                                   |
| #443       | Fixed active Deck, checked Cook dietary admission, waiting newcomers outside the Match, confirmed fresh choices and ordinary Restart back to the Lobby.                      |
| #444       | Home logo preserves participation, Home offers return and separate Leave, current stage/reload/rejoin restoration, independent Shopping List navigation.                     |
| #445       | Top Pick plus every other unanimous Watch match, visible immediately.                                                                                                        |
| #446       | Truthful Recipe details through the existing accessible sheet.                                                                                                               |
| #447       | Recipe/ingredients readable by URL while pricing; honest failure/timeout, stable Claims and one mint.                                                                        |
| #448, #449 | Bounded investigation recorded; exact reported instructions/image remain unconfirmed. No speculative content change. See [Recipe evidence](recipe-ux-validation.md).         |

## Release order

**Deploy the backend from the finished branch first and finish its rollout before deploying the frontend from the same revision.** Include the backend review fix as well as the initial feature commit. The backend accepts both the old create shape and `collaborative: true`; older Sessions remain on their original lifecycle. The new frontend omits pre-Lobby setup, which an old backend still requires for Watch/Cook, so deploying the frontend first is unsupported (ADR 0007).

After backend rollout, verify a `collaborative: true` creation returns a waiting Lobby and no Deck, then verify an old-shaped creation still works. Only then release the frontend. Rolling back the frontend is compatible with the new backend; do not roll the backend back underneath collaborative Sessions. The implementation task does not deploy or merge these changes.

## Validation

Public seams follow the approved ticket acceptance criteria: Session HTTP/socket commands, Deck service output, Shopping List reads/claims, and visible React/Playwright flows. Focused tests ran during implementation; the final runs after review fixes completed on 7 September 2026.

| Check                                                                                      | Result                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full backend suite, isolated local Redis on port 6384                                      | 78 files, **1,022 tests passed**                                                                                                                          |
| Full frontend suite                                                                        | 51 files, **606 tests passed**                                                                                                                            |
| CI's keyless mobile browser subset: home, accessibility, theme, Cook, Watch, collaboration | **40 passed**; the 3 affected Cook/Watch/collaboration flows passed again after review fixes                                                              |
| Workspace typecheck, including backend test types                                          | Passed                                                                                                                                                    |
| Workspace lint                                                                             | No errors; one pre-existing SelectionPage ref-cleanup warning                                                                                             |
| Documentation path checks                                                                  | 8 passed                                                                                                                                                  |
| Home visual checks                                                                         | Phone, desktop, and 320px narrow viewport; no horizontal overflow at 320px, controls at least 44px; failed-image and reduced-motion browser checks passed |

Independent spec and standards reviews used `f4c50cd` as the baseline. All six actionable findings were fixed and rechecked: missed-Restart progress and mounted Deck state; waiting Cook newcomers in swipe counts; late-join guidance; unrestricted Watch media contributions; dated prices after partial pricing failure; and a delayed completed-rejoin acknowledgement restoring a discarded Match. The always-true details predicate was also removed. Regression checks reproduced the Restart, acknowledgement and pricing bugs before their fixes. Both reviewers confirmed their findings resolved.

Live paid-Places Restaurant browser flows and Redis failover/lease-loss behavior were not exercised. Restaurant command/service paths were covered locally. The exact reported Recipe instruction defect and Armenian stew image remain unconfirmed under the explicitly permitted diagnostic outcome for #448/#449; their evidence and reproduction inputs are recorded in the Recipe document. No deployment, production latency claim, or issue closure is implied by these local checks.

Local screenshots are under `output/playwright/` (not committed). The actual local cold/warm grocery probe and limitations are in the Recipe evidence document; production latency was not measured.

## Brief disposition and unresolved reports — 8 September 2026

The [accepted UX brief](archive/ux-refresh.md) is retained for original acceptance details and design provenance. [ADR 0015](adr/0015-gather-before-choosing-the-deck.md) remains the architecture decision and [CONTEXT.md](../CONTEXT.md) the domain authority. The delivered-behavior table above replaces the brief's old current-defect and remaining-work list; those observations were against `f4c50cd`, before this implementation. Current public copy and visuals follow the [YupCrew direction](yupcrew-rebrand-plan.md), superseding the brief's working slogans.

Deck allocation/scarcity, name entry, collaborative choices, return-home/rejoin, Watch Match presentation and Recipe access during pricing have scoped implementation evidence above. Subsequent [UAT improvements](evidence/uat-improvements.md) record method previews and related corrections; [cat moments](evidence/cat-moments.md) retain motion/accessibility behavior and their own test scope. None of these historical checks proves a later build passes.

The reported instruction spacing/order (#448) and Armenian stew image (#449) remain **unconfirmed**, not resolved by archiving. Their [diagnostic record](recipe-ux-validation.md) preserves what was inspected and the missing reproduction inputs: an affected Recipe/source or Shopping List reference, exact text or identifying screenshot, and source payload/image. Investigate the actual affected data before normalizing instructions or replacing imagery. Missing source descriptions/times must remain honest unavailable states; no invented data or blanket image repair is authorized.
