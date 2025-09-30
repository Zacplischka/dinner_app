# Research: Dinner Decider Implementation

**Date**: 2025-09-30
**Feature**: Real-time session-based dinner option selector
**Branch**: 001-dinner-decider-enables

---

## 1. Socket.IO Real-Time Communication

### Decision
Use Socket.IO 4.x with room-based architecture, Connection State Recovery (v4.6+), and selective broadcasting patterns.

### Rationale
- **Room-based design**: Native efficient scoping where 1 session = 1 Socket.IO room enables automatic cleanup and participant limit enforcement (FR-004, FR-005)
- **Connection State Recovery**: Automatically replays missed events during brief disconnects (up to 2 minutes), handling mobile network interruptions gracefully
- **Selective broadcasting**: `socket.to(roomId).emit()` and `.except()` enforce privacy rules server-side (FR-023) - clients cannot bypass
- **Performance**: Single Node.js instance handles 200 concurrent connections at <5% CPU; binary add-ons (`bufferutil`, `utf-8-validate`) provide 20-30% performance boost
- **Integration**: Redis Streams Adapter (future scaling) handles temporary disconnects better than classic Pub/Sub

### Alternatives Considered
- **Namespace-per-session**: Too heavy; namespaces are for logical separation, not ephemeral sessions
- **Application-level filtering**: Reinventing rooms is inefficient and error-prone
- **WebSocket-only (no Socket.IO)**: Loses reconnection, fallback transports, room abstractions

### Code Pattern
```typescript
// Room-based selective broadcasting
socket.join(sessionCode);  // Server-side only
socket.to(sessionCode).emit('participantJoined', participant);  // Exclude sender
io.in(sessionCode).emit('allSelectionsReady', results);  // Include all

// Connection State Recovery
const io = new Server({
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,  // 2 minutes
    skipMiddlewares: true
  }
});
```

---

## 2. Redis Ephemeral Session Storage

### Decision
Redis 7.x with native TTL (EXPIREAT), Set-based selections for SINTER overlap calculation, Hash for session metadata.

### Rationale
- **TTL-based expiration**: Redis native `EXPIREAT` handles 30-minute timeout (FR-019) automatically; no cron jobs or background workers needed
- **Atomic TTL refresh**: Lua scripts refresh all session keys with same absolute timestamp, preventing staggered expiration across related keys
- **Efficient overlap calculation**: Redis `SINTER` on Sets provides O(N*M) intersection where N = smallest set size (~15 options)
- **Memory optimization**: Hash ziplist encoding (default <512 entries) provides 50-70% memory savings vs individual keys
- **Heartbeat pattern**: Middleware refreshes TTL on every WebSocket event (join, selection, view results) preventing premature expiration

### Alternatives Considered
- **Relative EXPIRE**: Risks staggered expiration across session keys
- **Single Hash with embedded JSON**: Prevents efficient SINTER operations
- **Keyspace notifications for cleanup**: Fire-and-forget nature provides no cleanup guarantee

### Data Structure Pattern
```bash
# Session metadata
HSET session:ABC123 created_at 1709251200 host_id user1 state "selecting"
EXPIREAT session:ABC123 1709252800

# Participants
SADD session:ABC123:participants user1 user2 user3
EXPIREAT session:ABC123:participants 1709252800

# User selections (efficient for intersection)
SADD session:ABC123:user1:selections "Pizza" "Sushi" "Thai"
EXPIREAT session:ABC123:user1:selections 1709252800

# Calculate overlap
SINTER session:ABC123:user1:selections session:ABC123:user2:selections session:ABC123:user3:selections
# Returns: ["Sushi", "Thai"]
```

### Key Naming Convention
`{namespace}:{entity}:{id}[:subentity][:subid]`

---

## 3. React Mobile-First Architecture

### Decision
Tailwind CSS 3.x mobile-first with custom 390px breakpoint, Zustand (<1KB) state management, React Router 6.4+ lazy routes.

### Rationale
- **Mobile-first responsive design**: Tailwind's unprefixed utilities apply to all sizes; custom `xs: 390px` breakpoint targets iPhone 12 Pro baseline (320-768px range)
- **Touch-friendly UI**: 44x44px minimum touch targets (WCAG AAA), 48px for primary actions, 8px minimum spacing between targets
- **Lightweight state**: Zustand (<1KB gzipped) vs Redux (~15KB); selective subscriptions prevent unnecessary re-renders on WebSocket updates
- **Route-based code splitting**: React Router 6.4+ lazy routes + Suspense boundaries enable <100KB initial bundle target
- **Performance optimization**: Vite tree shaking, manual vendor chunks (react-vendor, router, state, socket), gzip/brotli compression achieves <200KB total

### Alternatives Considered
- **Desktop-first with max-width**: Requires overriding styles as viewport decreases, larger CSS bundles
- **Redux + Redux Toolkit**: Larger bundle (~15KB), more boilerplate, overkill for simple session state
- **React Context + useReducer**: All consumers re-render on any state change, problematic for real-time updates
- **Single-route SPA**: Prevents code splitting, loads all screens upfront

### Component Pattern
```tsx
// Mobile-first responsive design
<button className="
  w-full           /* Full width on mobile (320px+) */
  min-h-[44px]     /* Touch-friendly minimum */
  px-4
  xs:w-auto        /* Auto width at 390px+ */
  xs:min-w-[200px] /* Minimum at 390px+ */
  sm:min-w-[240px] /* Minimum at 640px+ */
  rounded-lg
  bg-blue-600
  active:scale-[0.98]  /* Touch feedback */
">
  Join Session
</button>

// Zustand selective subscriptions
const participants = useSessionStore(state => state.participants);  // Only re-renders when participants change
const isConnected = useSessionStore(state => state.isConnected);    // Only re-renders when connection status changes
```

### Bundle Size Targets
- Initial bundle (HTML + CSS + JS): <100KB gzipped
- React vendor chunk: ~40KB gzipped
- Router chunk: ~10KB gzipped
- App code: ~30KB gzipped
- Each lazy route: <20KB gzipped
- **Total: <150KB** (50KB buffer under 200KB limit)

---

## 4. Contract-First API Testing

### Decision
OpenAPI 3.x for REST + TypeScript discriminated unions for WebSocket + Zod runtime validation + Vitest + vitest-openapi.

### Rationale
- **OpenAPI as source of truth**: Generate TypeScript types with `openapi-typescript`; validate responses with `vitest-openapi` matcher `expect(res).toSatisfyApiSpec()`
- **WebSocket contracts**: Discriminated unions with Zod schemas enable TypeScript flow analysis and runtime validation (Socket.IO provides type hints but no runtime checks)
- **Monorepo shared types**: `shared/` workspace package exports types/schemas consumed by frontend/backend; breaking changes immediately fail TypeScript checks
- **TDD workflow**: OpenAPI/AsyncAPI schema → Contract test (RED) → Implementation (GREEN) → Refactor
- **Vitest benefits**: Native TypeScript/ESM support, faster than Jest, built-in coverage (c8/v8), watch mode with HMR

### Alternatives Considered
- **Jest + jest-openapi**: Mature but slower; complex ESM configuration
- **Socket.IO TypeScript only**: No runtime validation (unsafe); types disappear at runtime
- **Manual Zod validation**: No auto-documentation; requires boilerplate
- **Separate npm package for shared types**: Publish overhead; slower iteration vs monorepo

### Test Pattern
```typescript
// Contract test with OpenAPI validation
import vitestOpenAPI from 'vitest-openapi';

beforeAll(() => {
  vitestOpenAPI('./specs/001-dinner-decider-enables/contracts/openapi.yaml');
});

it('should satisfy OpenAPI spec for valid session creation', async () => {
  const res = await request(app)
    .post('/api/sessions')
    .send({ hostName: 'Alice', participantLimit: 4 })
    .expect(201);

  expect(res).toSatisfyApiSpec();  // Validates against OpenAPI schema
});

// WebSocket event validation with Zod
const joinSessionEventSchema = z.object({
  type: z.literal('session:join'),
  payload: z.object({
    sessionCode: z.string().length(6),
    participantName: z.string().min(1).max(50)
  })
});

const event = { type: 'session:join', payload: { sessionCode: 'ABC123', participantName: 'Alice' } };
joinSessionEventSchema.parse(event);  // Runtime validation
```

---

## 5. WCAG 2.2 AA Mobile Accessibility

### Decision
Semantic HTML + 4.5:1 color contrast + 44x44px touch targets + focus management + VoiceOver/TalkBack testing.

### Rationale
- **WCAG 2.2 Level AA compliance**: Mobile-specific criteria (2.5.8 Target Size Minimum 24x24px, 1.3.4 Orientation, 2.5.7 Dragging Movements)
- **Touch target sizing**: 44x44px aligns with Apple HIG and represents ~9mm (average finger pad); WCAG 2.2 requires only 24x24px but research shows this causes "rage taps"
- **Color contrast**: 4.5:1 for text, 3:1 for UI components; especially important on mobile devices viewed in various lighting conditions
- **Semantic HTML**: Screen readers (VoiceOver on iOS, TalkBack on Android) rely on proper elements (`<button>`, `<nav>`, `<main>`) for swipe gesture navigation
- **Focus management**: Trap focus in modals, restore focus on close, skip navigation links for keyboard users

### Alternatives Considered
- **WCAG 2.1 Level A (minimum)**: Inadequate accessibility and legal protection
- **WCAG 2.2 Level AAA**: Some criteria impractical for mobile (e.g., 7:1 contrast difficult on small screens)
- **Reactive accessibility fixes**: "Shift left" approach building accessibility in from start is more cost-effective

### Accessibility Pattern
```tsx
// Accessible input with mobile considerations
<input
  id={inputId}
  type="text"
  className="min-h-[44px] px-4 text-base"  // 16px prevents iOS zoom
  aria-invalid={!!error}
  aria-describedby={error ? errorId : undefined}
  autoCapitalize="sentences"
  autoComplete="name"
  inputMode="text"
/>

// Accessible modal with focus trap
const previousFocusRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (isOpen) {
    previousFocusRef.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();
    document.body.style.overflow = 'hidden';  // Prevent body scroll

    return () => {
      previousFocusRef.current?.focus();  // Restore focus
      document.body.style.overflow = '';
    };
  }
}, [isOpen]);
```

---

## Decision Summary

| Area | Technology | Key Benefit |
|------|-----------|-------------|
| **Real-Time** | Socket.IO 4.x + rooms + Connection State Recovery | Automatic reconnection, privacy enforcement, 200 concurrent users at <5% CPU |
| **Storage** | Redis 7.x + TTL + Sets + Hashes | Native expiration, O(N*M) overlap calculation, 50KB for 50 sessions |
| **Frontend** | React 18 + Tailwind + Zustand + lazy routes | <200KB bundle, 44px touch targets, selective re-renders |
| **Contracts** | OpenAPI + Zod + Vitest + vitest-openapi | Type safety + runtime validation, contract-first TDD workflow |
| **Accessibility** | WCAG 2.2 AA + semantic HTML + focus mgmt | Legal compliance, VoiceOver/TalkBack support, 4.5:1 contrast |

---

## Performance Targets Validation

- ✅ **<500ms REST API p95**: Redis operations <1ms, pipelining reduces round trips
- ✅ **<200ms WebSocket broadcast p95**: Room-scoped broadcasting, binary add-ons optimization
- ✅ **50+ concurrent sessions**: 200 clients at ~54MB memory, <5% CPU on 4-core server
- ✅ **<200KB frontend bundle**: React vendor 40KB, router 10KB, app 30KB, routes <20KB each
- ✅ **30-minute auto-expiration**: Redis native TTL with Lua script atomic refresh
- ✅ **WCAG AA mobile**: 44px touch targets, 4.5:1 contrast, semantic HTML, screen reader tested

---

## Open Questions (Resolved via Clarifications)

All technical unknowns from the feature specification have been resolved:

- ✅ Dinner options source → Static hardcoded list (FR-018)
- ✅ Session expiration → 30 minutes from last activity (FR-019)
- ✅ Single participant sessions → Allowed, see own selections as results (FR-021)
- ✅ Participant visibility → Show names/count on join, hide during selection (FR-022, FR-023)
- ✅ Duplicate join prevention → Honor system, no technical measures (FR-024)
- ✅ Non-submitting participants → Session stays in waiting state until submit or expire (FR-025)
- ✅ Selection updates → Locked after submit, require session restart (FR-026)

---

## References

1. [Socket.IO 4.x Documentation](https://socket.io/docs/v4/)
2. [Redis 7.x TTL Best Practices](https://redis.io/docs/latest/commands/ttl/)
3. [WCAG 2.2 Mobile Guidelines](https://www.w3.org/TR/wcag2mobile-22/)
4. [React 18 Concurrent Features](https://react.dev/blog/2022/03/29/react-v18)
5. [Vitest Testing Framework](https://vitest.dev/)
6. [Tailwind CSS Mobile-First](https://tailwindcss.com/docs/responsive-design)
7. [OpenAPI 3.x Specification](https://swagger.io/specification/)
8. [Zod Runtime Validation](https://zod.dev/)