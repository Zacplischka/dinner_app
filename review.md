## Dinner Decider – In‑Depth Code Review

This document captures redundancies, potential bugs, correctness risks, and improvement opportunities across the backend, frontend, shared types, data/TTL handling, and tests. Each finding includes impact and recommended actions. Paths reference files under the repository root.

### High‑level architecture
- **Backend**: Express + Socket.IO, Redis (ioredis), TTL refresh via Lua, business logic in services, persistence in models.
- **Frontend**: React + Vite, Zustand store, Socket.IO client for realtime, REST client for options/session info.
- **Shared**: Typed interfaces and WS contracts.

---

### Critical correctness issues (fix first)
1) Wrong REST client response shape for dinner options
- Where: `frontend/src/services/apiClient.ts`
- Problem: `getDinnerOptions()` returns `response.json()` but the API returns `{ options: DinnerOption[] }`. Callers treat the result as `DinnerOption[]` directly.
- Impact: At runtime `SelectionPage` calls `options.map(...)` on an object → "options.map is not a function"; breaks selection UI.
- Recommendation:
  - Change return to `return (await response.json()).options;` and fix the function signature to `Promise<DinnerOption[]>`, or
  - Change signature to `Promise<DinnerOptionsResponse>` and update all callers to use `.options`.

2) Frontend removes participants on disconnect despite backend keeping them (FR‑025)
- Where: `frontend/src/services/socketService.ts` (participant:left handler)
- Problem: Disconnection is informational; backend explicitly keeps participants in the session. The UI currently calls `removeParticipant`, which contradicts FR‑025.
- Impact: UI participant list diverges from session state; can mislead users and break submission progress UI.
- Recommendation: Do not remove participants on `participant:left`. Instead, mark a transient connection status per participant, or ignore the event for removal.

3) Race condition: exceeding 4 participants under concurrent joins
- Where: `backend/src/services/SessionService.ts` and `backend/src/websocket/joinHandler.ts`
- Problem: Limit check uses `SCARD` before `SADD`; then increments a separate `participantCount`. Two concurrent joins can both pass checks and add, resulting in 5 participants.
- Impact: Violates max participant constraint; inconsistent `participantCount` vs set cardinality.
- Recommendation: Ensure atomicity around join:
  - Strategy A: `SADD` first, then re-check `SCARD`; if `> 4` then roll back (`SREM` + abort) and do not increment the hash count.
  - Strategy B: Use a Lua script to atomically check/insert/enforce the limit.
  - Strategy C: Store only a single source of truth (participants set), derive count from it, and remove the hash count.

4) Session results key may never expire
- Where: `backend/src/services/OverlapService.ts` (storeResults), `backend/src/redis/ttl-utils.ts`
- Problem: `storeResults` creates `session:{code}:results` after the last TTL refresh; TTL is not updated post-creation.
- Impact: Results keys can persist indefinitely after session expiration; storage leak.
- Recommendation: After storing results, call `refreshSessionTtl(sessionCode, participantIds)` again or set expiry on the results key directly (e.g., `EXPIREAT`/`PEXPIREAT`) using the current session’s `expireAt`.

5) Potential invalid `expiresAt` computation when TTL is negative
- Where: `backend/src/services/SessionService.ts#getSession`
- Problem: Uses `ttl = await redis.ttl(key)` then `expireAt = now + ttl` without guarding for `-2` (no key) or `-1` (no expiry).
- Impact: Can produce invalid `expiresAt` values; client-facing API inconsistency.
- Recommendation: If `ttl < 0`, treat the session as expired/not found or fallback to a computed/known `expireAt` from a stored field.

6) Backend package missing dependency on shared types
- Where: `backend/package.json`
- Problem: Backend imports `@dinner-app/shared/types` for generics. The backend package.json does not depend on `@dinner-app/shared`.
- Impact: Type resolution can fail during build or IDE tooling if not hoisted/available. Runtime is safe (import type only), but builds can break.
- Recommendation: Add `@dinner-app/shared` as a dependency (e.g., "file:../shared") to the backend package and ensure `shared` is built before backend.

7) Session expiration event not implemented (contract drift)
- Where: Types include `SessionExpiredEvent`; frontend listens for `session:expired`. Backend never emits it.
- Impact: Users won’t receive expiry notice; frontend state may be stale until manual refresh.
- Recommendation: Implement server-side expiry detection (Redis keyspace notifications or a heartbeat/cron) to emit `session:expired` to the room and cleanup state.

---

### Redundancies and design inconsistencies
- Duplicate submitted-state tracking
  - Where: Backend stores `hasSubmitted` in participant hash and also infers submission via selections set size (`SelectionModel.hasSubmitted`). Frontend separately updates local `hasSubmitted` on events.
  - Impact: Multiple sources of truth increase drift risk.
  - Recommendation: Choose one: either rely solely on selections sets as ground truth or keep `hasSubmitted` purely as a UI hint. If kept server-side, use it everywhere consistently.

- Recomputing expireAt twice on session creation
  - Where: `createSession` computes `expireAt` and then calls `refreshSessionTtl` which computes again.
  - Impact: Minor drift and unnecessary duplication.
  - Recommendation: Use the `expireAt` returned from `refreshSessionTtl` as the single value returned to clients.

- Participant host flag storage vs expectations
  - Where: `backend/src/models/Participant.ts` stores `isHost` as `'1'|'0'`; one integration test expects `'true'`.
  - Impact: Inconsistency with tests; potential confusion if reading raw Redis.
  - Recommendation: Standardize on a single representation. Prefer `'1'|'0'` in storage but adjust tests accordingly (or store `'true'|'false'`).

- Unused or duplicate service methods
  - Where: `SelectionService.checkAllSubmitted` duplicates logic reachable via `getSubmittedCount` or set-size checks.
  - Impact: Extra surface area to maintain.
  - Recommendation: Remove or consolidate; use a single primitive.

---

### WebSocket flow observations
- Join flow: Validates payload, enforces limit, adds participant, increments count, refreshes TTL, joins room, acknowledges, then broadcasts `participant:joined`.
  - Risk: Participant limit race (see Critical #3).
  - Improvement: Consider returning the full session model (state, expiresAt) on join ack to avoid an additional GET.

- Submit flow: Validates, checks membership, stores selections, marks submitted, updates last activity, refreshes TTL, broadcasts progress, calculates and stores results, moves state to `complete`, broadcasts results.
  - Risk: Results TTL issue (see Critical #4).
  - Improvement: Consider idempotency by ignoring duplicate submissions and returning success (or strict rejection is fine; then make it consistent across REST/WS).

- Restart flow: Validates, checks membership, clears selections/results, resets `hasSubmitted`, sets state `selecting`, updates last activity, refreshes TTL, broadcasts `session:restarted`.
  - Improvement: If results were emitted, make sure their key TTL is refreshed or re-created with expiry (see Critical #4).

- Disconnect flow: Intentionally does not remove participants (FR‑025). The frontend should not remove either (see Critical #2).

---

### Data model and TTL handling
- Keys affected by TTL: `session:{code}`, `session:{code}:participants`, `session:{code}:results`, `participant:{id}`, `session:{code}:{id}:selections`.
- TTL refresh is centralized via Lua script; good for atomicity and consistency.
- Gaps:
  - Results key TTL (Critical #4).
  - `getSession` TTL negative handling (Critical #5).
  - Optional: persist a canonical `expireAt` value in the session hash to avoid recomputing from TTL each time and to simplify API responses.

---

### Frontend issues and improvements
- Fix dinner options response shape (Critical #1).
- Do not remove participants on `participant:left` (Critical #2). Consider adding a `connectionStatus` flag per participant if UX requires visibility.
- `participant:joined` handler overrides `isHost` to `false` and clears `sessionCode` initially; ideally respect what server returns (ack already includes `participants` with `isHost`).
- Consider normalizing participants by `participantId` in the store for easier updates.
- Error handling: surface server error codes (e.g., `ALREADY_SUBMITTED`, `INVALID_OPTIONS`) to users with clear messages.

---

### Tests and coverage
- Several websocket contract tests are placeholders that intentionally fail; fine for TDD, but note:
  - Ensure a test for the concurrency join race (Critical #3).
  - Add a test that verifies results key is expiring with the session (Critical #4).
  - Add tests for `getSession` negative TTL cases (Critical #5).
  - Add frontend unit tests for `getDinnerOptions` and selection flow happy-path to catch shape regressions.

---

### Performance and scalability
- Current Redis access patterns are serial in some loops (e.g., listing participants and fetching metadata). Consider pipelines or `mget`-like batching if participant counts grow (currently capped at 4, so not urgent).
- SINTER usage for overlap is efficient and appropriate for set-based selection storage.

---

### Security and validation
- Zod validation used in REST and WS handlers; good coverage.
- Rate limiting not present; not required for the exercise but recommended for production.
- No input sanitization issues spotted (names constrained to 1–50 chars). Consider trimming inputs on the server as well as client.

---

### Type safety and packaging
- Add `@dinner-app/shared` dependency to backend (Critical #6).
- Ensure `shared` is built before backend/frontend builds; consider a root script to build in order.
- In `frontend/src/services/socketService.ts`, strongly type the `ack` payloads and avoid `any` to catch contract drift earlier.

---

### Prioritized action list
1) Fix `getDinnerOptions()` to match API shape and update callers.
2) Stop removing participants on `participant:left`; optionally track connection status.
3) Make join limit enforcement atomic to prevent 5th participant under race.
4) Ensure `session:{code}:results` key gets a TTL when created.
5) Harden `getSession` TTL handling for negative values.
6) Add `@dinner-app/shared` as a backend dependency.
7) Implement `session:expired` emission and frontend handling.
8) Consolidate submitted state tracking to a single source of truth.
9) Use the `expireAt` from TTL refresh as the returned value during session creation to avoid drift.
10) Align `isHost` storage and tests (`'1'|'0'` vs `'true'|'false'`).

---

### Notable code references
- Backend options API returns object:
```13:21:backend/src/api/options.ts
router.get('/', async (req: Request, res: Response) => {
  try {
    return res.status(200).json({
      options: DINNER_OPTIONS,
    });
  } catch (error: any) {
```

- Frontend client incorrectly returns entire body:
```75:87:frontend/src/services/apiClient.ts
export async function getDinnerOptions(): Promise<DinnerOption[]> {
  const response = await fetch(`${API_BASE_URL}/options`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch dinner options');
  }
  return response.json();
}
```

- Participant removal on disconnect (should not remove):
```88:92:frontend/src/services/socketService.ts
socket.on('participant:left', (event: ParticipantLeftEvent) => {
  console.log('Participant left:', event);
  useSessionStore.getState().removeParticipant(event.participantId);
});
```

- Join flow limit check susceptible to races:
```50:63:backend/src/websocket/joinHandler.ts
const currentCount = await ParticipantModel.countParticipants(sessionCode);
if (currentCount >= 4) {
  return callback({ success: false, error: 'Session is full (maximum 4 participants)' });
}
// Add participant then increment separate counter (race risk)
await ParticipantModel.addParticipant(sessionCode, socket.id, displayName, false);
const newCount = await SessionModel.incrementParticipantCount(sessionCode);
```

- Results stored after TTL refresh without expiry:
```111:126:backend/src/websocket/submitHandler.ts
// Store results
await OverlapService.storeResults(
  sessionCode,
  results.overlappingOptions.map((opt) => opt.optionId)
);
// ... no TTL refresh after creating the results key
```

If you want, I can implement the top 2–3 fixes now (client options shape, participant-left handling, and results TTL) in a short PR.
