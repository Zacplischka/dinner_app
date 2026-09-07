# Epic #434 implementation

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

**Deploy the backend commit first and finish its rollout before deploying the frontend commit.** The backend accepts both the old create shape and `collaborative: true`; older Sessions remain on their original lifecycle. The new frontend omits pre-Lobby setup, which an old backend still requires for Watch/Cook, so deploying the frontend first is unsupported (ADR 0007).

After backend rollout, verify a `collaborative: true` creation returns a waiting Lobby and no Deck, then verify an old-shaped creation still works. Only then release the frontend. Rolling back the frontend is compatible with the new backend; do not roll the backend back underneath collaborative Sessions. The implementation task does not deploy or merge these changes.

## Validation

Public seams follow the approved ticket acceptance criteria: Session HTTP/socket commands, Deck service output, Shopping List reads/claims, and visible React/Playwright flows. Focused tests ran during implementation. Final full-suite and independent review results are recorded below after integration.

Local screenshots are under `output/playwright/` (not committed). The actual local cold/warm grocery probe and limitations are in the Recipe evidence document; production latency was not measured.
