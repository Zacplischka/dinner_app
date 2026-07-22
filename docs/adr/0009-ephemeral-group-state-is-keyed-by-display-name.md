# Ephemeral group state is keyed by display name

Group state that lives only for the length of a Session and only in clients — a Participant's Live Selections mid-deck, their Order Lines in a Group Order — is keyed by `displayName`, never by `participantId`. `participantId` **is** the Socket.IO `socket.id` (`backend/src/websocket/joinHandler.ts:68`, `:75`, `:86`), and Socket.IO mints a fresh one on every reconnect and every page reload. `displayName` is the only identity that survives a reconnect, and it is already the key `SessionResultsEvent.allSelections` uses on the wire.

Keying this state by `participantId` is not a style preference, it is a correctness bug that arrives silently on the first flaky-wifi reload: the reloader re-emits the same likes under a second id, every other phone holds two contributors for one human, and a Restaurant two of three people liked reports three. In the two-Participant case the count reaches 3 against a `participantCount` of 2, so the `count === participantCount` test never holds again and the genuine Full House can never fire for the rest of the deck.

This rests on a precondition that must not be relaxed: **display names are unique within a Session.** `SessionService.joinSession` throws `DISPLAY_NAME_TAKEN` when `store.claimDisplayName` fails (`backend/src/services/SessionService.ts:297-313`), and that claim is a Lua compare-and-set on `session:{code}:display_names` (`backend/src/store/sessionStore.ts:267-288`) which lets a rejoin re-take its own name via the `previousOwner`/`rejoinToken` pair and nobody else's.

## Consequences

- Anything that "cleans up" ephemeral group state to key on `participantId` for consistency with the server's participant records is a regression, not a refactor. Server-side, durable-for-the-Session state (`participant:{pid}`, `session:{code}:{pid}:selections`) stays keyed by `participantId` — that is the layer `removeParticipant` deliberately tears down on rejoin (`backend/src/store/sessionStore.ts:325-326`).
- Relaxing display-name uniqueness — case-insensitive collisions, per-device suffixes, an "anonymous" fallback — silently breaks every consumer of this decision. Amend this ADR first, and replace the key with a server-issued id that survives a reconnect in the same change.
- Counts derived from these keys must still filter against the *current* Participant list and clamp to its length: a Participant who Leaves shrinks the denominator, and a buffered entry from before they left would otherwise render `3 of 2`.
- This is a client-side keying rule for state that is never written to Redis. It adds no Redis key and does not change ADR 0001's boundary.
