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
- Problem: `getDinnerOptions()` should return the array inside `{ options }`. Current code already returns `data.options` correctly.
- Impact: None currently; keep tests to prevent regressions.
- Recommendation: Maintain current implementation and add a unit test that mocks `{ options: [...] }`.

2) Participant removal on disconnect (FR‑025)
- Where: `frontend/src/services/socketService.ts` (participant:left handler)
- Problem: The handler correctly does not remove participants now. Good.
- Impact: N/A.
- Recommendation: Optionally track a per‑participant transient connection flag if UX needs it.

3) Join limit race condition risk
- Where: `backend/src/websocket/joinHandler.ts`
- Problem: The handler adds the participant, then rechecks count and rolls back if `> 4`. This mitigates races without Lua, but there is still a brief window where two concurrent joins can both add then one rolls back.
- Impact: Brief inconsistent broadcasts or count flicker.
- Recommendation: Acceptable for this scale. If needed, move to a Lua script that does SADD+SCARD+rollback atomically.

4) Results TTL alignment
- Where: `backend/src/websocket/submitHandler.ts` after `OverlapService.storeResults`
- Problem: Results key TTL is refreshed later via `refreshSessionTtl(sessionCode, participantIds)`; this is already implemented right after storing results.
- Impact: None; TTL remains aligned.
- Recommendation: Keep as is.

5) `getSession` TTL negative handling
- Where: `backend/src/services/SessionService.ts#getSession`
- Problem: Code guards for negative TTL and returns null; good.
- Impact: None.
- Recommendation: Consider storing a canonical `expireAt` in the session hash to avoid recomputing per request.

6) Backend dependency on shared types
- Where: `backend/package.json`
- Problem: Backend imports `@dinner-app/shared/types` but `backend/package.json` lacks a dependency entry.
- Impact: Type resolution may fail outside root workspace context.
- Recommendation: Add `"@dinner-app/shared": "file:../shared"` to backend dependencies.

7) Session expiration event
- Where: Types include `SessionExpiredEvent`; frontend listens for `session:expired`.
- Problem: Backend does not emit it yet.
- Recommendation: Implement a lightweight expiry notifier (Redis keyspace notifications on `expired` events for `session:*`).

---

### Redundancies and design inconsistencies
- **Submitted-state duplication**
  - Backend keeps `hasSubmitted` in participant hash and also infers via selections length; frontend mirrors in store.
  - Recommendation: Treat selections as ground truth; keep `hasSubmitted` only as a derived/UI hint.

- **expireAt computation duplication**
  - `createSession` computes expireAt and calls TTL refresh that also computes it. Minor.
  - Recommendation: Return the value from `refreshSessionTtl` to clients.

- **`isHost` storage representation**
  - Stored as `'1'|'0'`; some legacy tests expect `'true'`.
  - Recommendation: Keep `'1'|'0'` and align tests.

- **Overlapping utilities**
  - `SelectionService.checkAllSubmitted` is redundant with `getSubmittedCount` + participant count.
  - Recommendation: Remove `checkAllSubmitted` and use one primitive.

---

### WebSocket flow observations
- Join: Validates, checks limit, adds, re-checks and rollbacks if needed, sets count, TTL refresh, join room, ack then broadcast. Solid; Lua script optional for stricter atomicity.
- Submit: Validates, membership check, store selections, mark submitted, update activity, TTL refresh, broadcast progress, compute/store results, TTL refresh again, set `complete`, broadcast results.
- Restart: Validates, membership check, clear selections/results, reset `hasSubmitted`, set `selecting`, update activity, TTL refresh, broadcast.
- Disconnect: Does not remove participants; frontend mirrors this behavior. Good.

---

### Data model and TTL handling
- TTL managed via Lua across all related keys; good.
- Results TTL is refreshed post‑store; good.
- `getSession` guards negative TTL; consider persisting `expireAt` in session hash for simpler API responses.

---

### Frontend issues and improvements
- Keep dinner options response handling as is; add a test.
- `participant:left` handler already avoids removal; optionally mark connection status.
- `participant:joined` handler builds a participant object instead of using ack list; acceptable since ack is used on join. Consider normalizing by id.
- Surface server error codes to users when available.

---

### Tests and coverage
- Add a concurrency join race test (even if flaky) or a Lua-based join test if implemented.
- Add a test verifying results key TTL aligns with session TTL.
- Add frontend unit tests for `getDinnerOptions` shape and selection flow.

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
- Add `@dinner-app/shared` dependency to backend.
- Root `build` already builds shared first; keep it.
- In `frontend/src/services/socketService.ts`, avoid `any` for `session:restart` ack.

---

### Prioritized action list
1) Add `@dinner-app/shared` to `backend/package.json` dependencies.
2) Optionally implement atomic join via Lua for stricter race handling.
3) Add `session:expired` emission via Redis keyspace notifications.
4) Remove redundant `checkAllSubmitted` and rely on `getSubmittedCount`.
5) Persist a canonical `expireAt` in session hash (optional).

---

### Notable code references
- Options API returns `{ options }`:
```13:21:backend/src/api/options.ts
router.get('/', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({
      options: DINNER_OPTIONS,
    });
  } catch (error: any) {
```

- Frontend client extracts `options` array:
```75:89:frontend/src/services/apiClient.ts
export async function getDinnerOptions(): Promise<DinnerOption[]> {
  const response = await fetch(`${API_BASE_URL}/options`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch dinner options');
  }
  const data = await response.json();
  return data.options;
}
```

- Join rollback after limit exceeded:
```66:78:backend/src/websocket/joinHandler.ts
await ParticipantModel.addParticipant(sessionCode, socket.id, displayName, isHost);
const newCount = await ParticipantModel.countParticipants(sessionCode);
if (newCount > 4) {
  await ParticipantModel.removeParticipant(sessionCode, socket.id);
  return callback({ success: false, error: 'Session is full (maximum 4 participants)' });
}
```

- Results TTL refreshed after storing results:
```111:119:backend/src/websocket/submitHandler.ts
await OverlapService.storeResults(
  sessionCode,
  results.overlappingOptions.map((opt) => opt.optionId)
);
await refreshSessionTtl(sessionCode, participantIds);
```

If you want, I can implement the top 2–3 fixes now (client options shape, participant-left handling, and results TTL) in a short PR.
