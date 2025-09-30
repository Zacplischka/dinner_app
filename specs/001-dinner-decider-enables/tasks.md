# Tasks: Dinner Decider

**Feature**: 001-dinner-decider-enables
**Input**: Design documents from `/Users/zacharyplischka/dinner_app/specs/001-dinner-decider-enables/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md
**Generated**: 2025-09-30
**Last Updated**: 2025-09-30

---

## 🎉 Implementation Status

**Core Application: COMPLETE** ✅

- **Phase 3.1-3.2**: Setup & Shared Types ✅ (T001-T011)
- **Phase 3.3**: Contract Tests ✅ (T012-T026) - All REST API tests passing (19/19)
- **Phase 3.4**: Backend Core ✅ (T027-T046) - Fully functional
- **Phase 3.5**: Frontend Core ✅ (T047-T060) - All pages & components implemented
- **Phase 3.6**: E2E Tests ✅ (T061-T064) - All Playwright tests created
- **Phase 3.7**: Polish ⏳ (T065-T078) - Optional

**Build Status**:
- Backend: ✅ All contract tests passing
- Frontend: ✅ Production build successful (~248KB total, ~70KB initial load)
- Test Isolation: ✅ Fixed with vitest.config.ts (fileParallelism: false)

**Key Fixes Applied**:
- WebSocket event type alignment with shared types
- Frontend package.json dependency on shared package (file:../shared)
- Vite environment variable types (vite-env.d.ts)
- Monorepo package.json for workspace management

**Tasks Completed**: 64/78 (82%)

---

## Project Structure

```
dinner_app/
├── backend/
│   ├── src/
│   │   ├── models/           # Session, Participant, Selection entities
│   │   ├── services/         # Business logic (overlap calculation, session lifecycle)
│   │   ├── api/              # Express REST endpoints
│   │   ├── websocket/        # Socket.IO event handlers
│   │   ├── redis/            # Redis client and utilities
│   │   ├── constants/        # Static dinner options list
│   │   └── server.ts         # Express + Socket.IO initialization
│   └── tests/
│       ├── contract/         # OpenAPI/WebSocket schema validation
│       ├── integration/      # Multi-service flows
│       └── unit/             # Isolated business logic
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route components (Create, Join, Select, Results)
│   │   ├── services/         # Socket.IO client, API calls
│   │   ├── stores/           # Zustand state management
│   │   └── App.tsx           # React Router setup
│   └── tests/
│       ├── unit/             # Component tests (Vitest + React Testing Library)
│       └── e2e/              # Playwright multi-participant flows
└── shared/
    ├── types/                # TypeScript interfaces
    └── schemas/              # Zod validation schemas
```

---

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in task descriptions
- TDD: Tests MUST be written and MUST FAIL before implementation

---

## Phase 3.1: Setup

- [X] **T001** Create monorepo project structure (backend/, frontend/, shared/)
  - Create directories: backend/src/{models,services,api,websocket,redis,constants}, backend/tests/{contract,integration,unit}
  - Create directories: frontend/src/{components,pages,services,stores}, frontend/tests/{unit,e2e}
  - Create directories: shared/{types,schemas}

- [X] **T002** Initialize backend Node.js 20 + TypeScript 5.x project
  - File: `backend/package.json`, `backend/tsconfig.json`
  - Dependencies: express@4.x, socket.io@4.x, ioredis@5.x, zod@3.x, cors
  - Dev dependencies: vitest@1.x, supertest@6.x, @types/node, @types/express, typescript@5.x

- [X] **T003** Initialize frontend React 18 + TypeScript 5.x project
  - File: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`
  - Dependencies: react@18.x, react-dom@18.x, react-router-dom@6.x, socket.io-client@4.x, zustand@4.x
  - Dev dependencies: @vitejs/plugin-react, tailwindcss@3.x, vitest@1.x, @testing-library/react, playwright@1.x

- [X] **T004** [P] Configure ESLint and Prettier for backend
  - File: `backend/.eslintrc.json`, `backend/.prettierrc`

- [X] **T005** [P] Configure ESLint, Prettier, and Tailwind for frontend
  - File: `frontend/.eslintrc.json`, `frontend/.prettierrc`, `frontend/tailwind.config.ts`, `frontend/postcss.config.js`

- [X] **T006** [P] Initialize shared package for types and schemas
  - File: `shared/package.json`, `shared/tsconfig.json`
  - Dependencies: zod@3.x
  - Exports: ./types, ./schemas

---

## Phase 3.2: Shared Types and Schemas (BEFORE Tests)

- [X] **T007** [P] Create shared TypeScript types for models
  - File: `shared/types/models.ts`
  - Types: Session, Participant, DinnerOption, Selection, Result (per data-model.md)

- [X] **T008** [P] Create shared TypeScript types for REST API
  - File: `shared/types/api.ts`
  - Types: CreateSessionRequest, SessionResponse, JoinSessionRequest, JoinSessionResponse (per openapi.yaml)

- [X] **T009** [P] Create shared TypeScript types for WebSocket events
  - File: `shared/types/websocket-events.ts`
  - Types: ClientToServerEvents, ServerToClientEvents, SessionJoinPayload, SelectionSubmitPayload, etc. (per websocket-events.md)

- [X] **T010** [P] Create shared Zod schemas for REST API validation
  - File: `shared/schemas/api.ts`
  - Schemas: createSessionRequestSchema, sessionResponseSchema, joinSessionRequestSchema

- [X] **T011** [P] Create shared Zod schemas for WebSocket validation
  - File: `shared/schemas/websocket-events.ts`
  - Schemas: sessionJoinPayloadSchema, selectionSubmitPayloadSchema, sessionRestartPayloadSchema

---

## Phase 3.3: Contract Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.4

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### REST API Contract Tests

- [X] **T012** [P] Contract test POST /api/sessions
  - File: `backend/tests/contract/sessions-create.test.ts`
  - Test: validates 201 response matches openapi.yaml SessionResponse schema
  - Test: validates 400 response for missing hostName
  - Uses: vitest-openapi, supertest

- [X] **T013** [P] Contract test GET /api/sessions/:sessionCode
  - File: `backend/tests/contract/sessions-get.test.ts`
  - Test: validates 200 response matches SessionResponse schema
  - Test: validates 404 response for non-existent session

- [X] **T014** [P] Contract test POST /api/sessions/:sessionCode/join
  - File: `backend/tests/contract/sessions-join.test.ts`
  - Test: validates 200 response matches JoinSessionResponse schema
  - Test: validates 403 response for full session (4 participants)
  - Test: validates 404 response for non-existent session

- [X] **T015** [P] Contract test GET /api/options
  - File: `backend/tests/contract/options-get.test.ts`
  - Test: validates 200 response with array of DinnerOption objects

### WebSocket Event Contract Tests

- [X] **T016** [P] Contract test session:join event
  - File: `backend/tests/contract/websocket-join.test.ts`
  - Test: validates payload against sessionJoinPayloadSchema
  - Test: validates acknowledgment response structure
  - Test: validates participant:joined broadcast to other clients
  - Uses: socket.io-client, vitest

- [X] **T017** [P] Contract test selection:submit event
  - File: `backend/tests/contract/websocket-submit.test.ts`
  - Test: validates payload against selectionSubmitPayloadSchema
  - Test: validates participant:submitted broadcast (count only, not selections)
  - Test: validates session:results broadcast when all submit

- [X] **T018** [P] Contract test session:restart event
  - File: `backend/tests/contract/websocket-restart.test.ts`
  - Test: validates payload against sessionRestartPayloadSchema
  - Test: validates session:restarted broadcast to all participants

### Integration Test Scenarios (User Stories)

- [X] **T019** [P] Integration test: Create session flow
  - File: `backend/tests/integration/create-session.test.ts`
  - Scenario: User creates session, receives session code and shareable link (FR-001, FR-002, FR-003)
  - Test: POST /api/sessions returns 201 with valid session code
  - Test: Session stored in Redis with 30-minute TTL
  - Test: Host becomes first participant

- [X] **T020** [P] Integration test: Join session flow (2-4 participants)
  - File: `backend/tests/integration/join-session.test.ts`
  - Scenario: Bob and Charlie join Alice's session via WebSocket (FR-004, FR-005, FR-022)
  - Test: session:join emits participant:joined broadcast to existing participants
  - Test: New participant receives current participant list
  - Test: 5th participant rejected with SESSION_FULL error

- [X] **T021** [P] Integration test: Submit selections flow
  - File: `backend/tests/integration/submit-selections.test.ts`
  - Scenario: Participants submit selections, remain private until all submit (FR-007, FR-008, FR-023)
  - Test: selection:submit stores selections in Redis
  - Test: participant:submitted broadcasts count only (not selections)
  - Test: Selections not revealed until all participants submit

- [X] **T022** [P] Integration test: Results revelation with overlap
  - File: `backend/tests/integration/results-overlap.test.ts`
  - Scenario: All participants submit, system calculates and broadcasts overlap (FR-009, FR-010, FR-011)
  - Test: Redis SINTER calculates overlapping options correctly
  - Test: session:results broadcasts overlappingOptions array
  - Test: allSelections map reveals all participants' choices

- [X] **T023** [P] Integration test: Results revelation with no overlap
  - File: `backend/tests/integration/results-no-overlap.test.ts`
  - Scenario: All submit but no overlap, show restart option (FR-016)
  - Test: session:results has empty overlappingOptions array
  - Test: hasOverlap: false in results payload

- [X] **T024** [P] Integration test: Session restart flow
  - File: `backend/tests/integration/restart-session.test.ts`
  - Scenario: Participant restarts session, clears selections, preserves participants (FR-012, FR-013)
  - Test: session:restart clears all selections from Redis
  - Test: session:restarted broadcast to all participants
  - Test: Participant list unchanged after restart

- [X] **T025** [P] Integration test: Session expiration after 30 minutes
  - File: `backend/tests/integration/session-expiration.test.ts`
  - Scenario: Session expires after 30 minutes of inactivity (FR-019, FR-020)
  - Test: Redis TTL expires session and all related keys
  - Test: session:expired broadcast sent before expiration
  - Test: All participant, selection, and result keys deleted

- [X] **T026** [P] Integration test: Single participant session
  - File: `backend/tests/integration/single-participant.test.ts`
  - Scenario: Alice creates session and submits alone, sees own selections as results (FR-021)
  - Test: selection:submit with 1 participant triggers immediate results
  - Test: session:results overlappingOptions equals participant's selections

---

## Phase 3.4: Backend Core Implementation (ONLY after tests are failing) ✅ COMPLETE

### Redis Client and Utilities

- [X] **T027** Redis client initialization
  - File: `backend/src/redis/client.ts`
  - Implement: ioredis connection with reconnection strategy
  - Implement: Health check ping/pong
  - Uses: ioredis@5.x

- [X] **T028** [P] Redis TTL refresh utility (Lua script)
  - File: `backend/src/redis/refresh-ttl.lua`, `backend/src/redis/ttl-utils.ts`
  - Implement: Lua script to atomically refresh EXPIREAT on multiple keys
  - Implement: TypeScript wrapper to execute script
  - Per research.md: Heartbeat-based refresh with EXPIREAT

### Constants

- [X] **T029** [P] Static dinner options list
  - File: `backend/src/constants/dinnerOptions.ts`
  - Data: 15-20 hardcoded dinner options with optionId, displayName, description (FR-018)
  - Validation: Startup check for duplicate optionIds

### Models (Redis operations)

- [X] **T030** [P] Session model
  - File: `backend/src/models/Session.ts`
  - Methods: create(hostId), get(sessionCode), updateState(sessionCode, state), delete(sessionCode)
  - Redis: HSET session:{code}, EXPIREAT
  - Per data-model.md Session entity

- [X] **T031** [P] Participant model
  - File: `backend/src/models/Participant.ts`
  - Methods: add(sessionCode, participantId, displayName), remove(sessionCode, participantId), list(sessionCode), count(sessionCode)
  - Redis: SADD session:{code}:participants, HSET participant:{id}, EXPIREAT
  - Per data-model.md Participant entity

- [X] **T032** [P] Selection model
  - File: `backend/src/models/Selection.ts`
  - Methods: submit(sessionCode, participantId, optionIds), get(sessionCode, participantId), getAll(sessionCode), clear(sessionCode)
  - Redis: SADD session:{code}:{participantId}:selections, EXPIREAT
  - Per data-model.md Selection entity

### Services (Business Logic)

- [X] **T033** Session service
  - File: `backend/src/services/SessionService.ts`
  - Depends on: T030 (Session model), T031 (Participant model), T028 (TTL utils)
  - Methods: createSession(hostName), getSession(sessionCode), joinSession(sessionCode, participantId, displayName), expireSession(sessionCode)
  - Logic: Generate 6-char alphanumeric code, enforce 1-4 participant limit, refresh TTL on activity

- [X] **T034** [P] Selection service
  - File: `backend/src/services/SelectionService.ts`
  - Depends on: T032 (Selection model)
  - Methods: submitSelections(sessionCode, participantId, optionIds), checkAllSubmitted(sessionCode), clearSelections(sessionCode)
  - Logic: Validate optionIds exist in DINNER_OPTIONS, check not already submitted

- [X] **T035** [P] Overlap calculation service
  - File: `backend/src/services/OverlapService.ts`
  - Depends on: T032 (Selection model), T029 (DINNER_OPTIONS)
  - Methods: calculateOverlap(sessionCode), formatResults(sessionCode)
  - Logic: Redis SINTER on all selection Sets, map optionIds to DinnerOption objects
  - Per data-model.md: O(N*M) SINTER operation

### REST API Endpoints

- [X] **T036** POST /api/sessions endpoint
  - File: `backend/src/api/sessions.ts`
  - Depends on: T033 (SessionService), T010 (Zod schemas)
  - Implement: createSession route, validate with createSessionRequestSchema, return SessionResponse
  - Makes T012 test pass

- [X] **T037** GET /api/sessions/:sessionCode endpoint
  - File: `backend/src/api/sessions.ts`
  - Depends on: T033 (SessionService)
  - Implement: getSession route, return 404 if not found
  - Makes T013 test pass

- [X] **T038** POST /api/sessions/:sessionCode/join endpoint
  - File: `backend/src/api/sessions.ts`
  - Depends on: T033 (SessionService), T010 (Zod schemas)
  - Implement: joinSession route, validate participantName, return 403 if full
  - Makes T014 test pass

- [X] **T039** [P] GET /api/options endpoint
  - File: `backend/src/api/options.ts`
  - Depends on: T029 (DINNER_OPTIONS)
  - Implement: Return static dinner options list
  - Makes T015 test pass

### WebSocket Event Handlers

- [X] **T040** WebSocket server initialization
  - File: `backend/src/server.ts`
  - Depends on: T027 (Redis client)
  - Implement: Socket.IO server with CORS, Connection State Recovery (2-minute buffer per research.md)
  - Implement: TypedServerSocket with ClientToServerEvents, ServerToClientEvents interfaces

- [X] **T041** session:join event handler
  - File: `backend/src/websocket/joinHandler.ts`
  - Depends on: T033 (SessionService), T011 (Zod schemas)
  - Implement: Validate payload, add participant, join room, broadcast participant:joined
  - Implement: Return acknowledgment with participant list
  - Makes T016 test pass

- [X] **T042** selection:submit event handler
  - File: `backend/src/websocket/submitHandler.ts`
  - Depends on: T034 (SelectionService), T035 (OverlapService), T011 (Zod schemas)
  - Implement: Validate payload, submit selections, broadcast participant:submitted (count only)
  - Implement: If all submitted: calculate overlap, broadcast session:results
  - Makes T017 test pass

- [X] **T043** session:restart event handler
  - File: `backend/src/websocket/restartHandler.ts`
  - Depends on: T034 (SelectionService), T011 (Zod schemas)
  - Implement: Validate payload, clear selections, broadcast session:restarted
  - Makes T018 test pass

- [X] **T044** [P] WebSocket error handler
  - File: `backend/src/websocket/errorHandler.ts`
  - Implement: Emit error event with structured ErrorEvent payload
  - Error codes: SESSION_FULL, SESSION_NOT_FOUND, VALIDATION_ERROR, ALREADY_SUBMITTED, INVALID_OPTIONS

- [X] **T045** [P] WebSocket disconnect handler
  - File: `backend/src/websocket/disconnectHandler.ts`
  - Implement: Broadcast participant:left (but don't remove from session per FR-025)
  - Implement: Session stays in waiting state until reconnect or expire

### Backend Integration

- [X] **T046** Express + Socket.IO server integration
  - File: `backend/src/server.ts`
  - Depends on: T036-T039 (REST routes), T040-T045 (WebSocket handlers)
  - Implement: Express app initialization, mount REST routes, attach Socket.IO
  - Implement: TTL refresh middleware for REST endpoints
  - Implement: Startup validation (check Redis connection, validate DINNER_OPTIONS for duplicates)

---

## Phase 3.5: Frontend Core Implementation ✅ COMPLETE

### Zustand Store

- [X] **T047** Session store
  - File: `frontend/src/stores/sessionStore.ts`
  - Depends on: T007-T009 (shared types)
  - State: sessionCode, participants, currentUserId, selections, overlappingOptions, sessionStatus, isConnected
  - Actions: setSessionCode, addParticipant, removeParticipant, updateSelection, setResults, resetSession
  - Uses: zustand@4.x with devtools and persist middleware

### Socket.IO Client Service

- [X] **T048** Socket.IO client service
  - File: `frontend/src/services/socketService.ts`
  - Depends on: T009 (WebSocket event types), T047 (sessionStore)
  - Implement: Socket.IO client connection with reconnection config
  - Implement: Event handlers that update Zustand store (participant:joined, session:results, etc.)
  - Implement: Emit methods (joinSession, submitSelection, restartSession)
  - Uses: socket.io-client@4.x

### REST API Client

- [X] **T049** [P] REST API client
  - File: `frontend/src/services/apiClient.ts`
  - Depends on: T008 (REST API types)
  - Methods: createSession(hostName), getSession(sessionCode), getDinnerOptions()
  - Uses: fetch API

### React Router Setup

- [X] **T050** React Router configuration
  - File: `frontend/src/App.tsx`
  - Routes: /, /create, /join, /session/:sessionCode, /session/:sessionCode/select, /session/:sessionCode/results
  - Lazy load route components with Suspense boundaries (per research.md: route-based code splitting)
  - Uses: react-router-dom@6.x

### Pages (Route Components)

- [X] **T051** [P] Home page
  - File: `frontend/src/pages/HomePage.tsx`
  - UI: Welcome message, "Create Session" button, "Join Session" button
  - Navigate to /create or /join
  - Mobile-first: 390px baseline, 44px touch targets

- [X] **T052** [P] Create Session page
  - File: `frontend/src/pages/CreateSessionPage.tsx`
  - Depends on: T049 (apiClient), T047 (sessionStore)
  - UI: Input for host name, "Create" button
  - Logic: Call createSession API, store sessionCode, navigate to /session/:sessionCode
  - Validation: hostName 1-50 characters

- [X] **T053** [P] Join Session page
  - File: `frontend/src/pages/JoinSessionPage.tsx`
  - Depends on: T048 (socketService), T047 (sessionStore)
  - UI: Input for session code, input for display name, "Join" button
  - Logic: Emit session:join event, navigate to /session/:sessionCode on success
  - Error handling: Show "Session full" or "Session not found" alerts

- [X] **T054** [P] Session Lobby page
  - File: `frontend/src/pages/SessionLobbyPage.tsx`
  - Depends on: T047 (sessionStore)
  - UI: Display participant list, "Start Selecting" button
  - Real-time updates: participant:joined events add to list
  - Navigate to /session/:sessionCode/select when ready

- [X] **T055** [P] Selection page
  - File: `frontend/src/pages/SelectionPage.tsx`
  - Depends on: T048 (socketService), T049 (apiClient), T047 (sessionStore)
  - UI: Multi-select list of dinner options (checkboxes), "Submit Selections" button
  - Logic: Load options from API, allow selection, emit selection:submit
  - Show waiting screen after submit: "X/Y participants have submitted"
  - Navigate to /session/:sessionCode/results automatically on session:results event

- [X] **T056** [P] Results page
  - File: `frontend/src/pages/ResultsPage.tsx`
  - Depends on: T047 (sessionStore)
  - UI: Display overlapping options prominently, show all participants' selections
  - UI: If no overlap (hasOverlap: false): "No matching options" message, "Restart Session" button
  - Logic: Restart button emits session:restart, navigates back to /select on session:restarted

### Reusable Components

- [X] **T057** [P] ParticipantList component
  - File: `frontend/src/components/ParticipantList.tsx`
  - Props: participants (array)
  - UI: Display participant names, show checkmark if submitted
  - Mobile-friendly: Vertical list with adequate spacing

- [X] **T058** [P] OptionSelector component
  - File: `frontend/src/components/OptionSelector.tsx`
  - Props: options (array), selectedOptions (array), onSelectionChange (callback)
  - UI: Checkbox list with touch-friendly 44x44px targets
  - Accessible: WCAG AA contrast, keyboard navigation

- [X] **T059** [P] ConnectionStatus component
  - File: `frontend/src/components/ConnectionStatus.tsx`
  - Depends on: T047 (sessionStore isConnected)
  - UI: Badge showing "Connected" (green) or "Disconnected" (red)
  - Position: Top-right corner

### Tailwind CSS Styling

- [X] **T060** Tailwind mobile-first theme configuration
  - File: `frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/src/main.tsx`, `frontend/index.html`
  - Configure: Custom breakpoint xs: 390px (per research.md)
  - Configure: Touch target sizes (min-h-[44px], min-w-[44px])
  - Configure: WCAG AA compliant color palette
  - Additional: Created vite-env.d.ts for environment variable types

---

## Phase 3.6: End-to-End Tests

- [X] **T061** [P] E2E test: Multi-participant flow with overlap
  - File: `frontend/tests/e2e/multi-participant-overlap.spec.ts`
  - Scenario: Alice creates, Bob joins, Charlie joins, all select, results show overlap (per quickstart.md)
  - Uses: Playwright with mobile viewport emulation (390px)
  - Test: Real-time UI updates on participant:joined events
  - Test: Results automatically display when all submit

- [X] **T062** [P] E2E test: No overlap, restart flow
  - File: `frontend/tests/e2e/no-overlap-restart.spec.ts`
  - Scenario: Participants submit selections with no overlap, restart session
  - Test: "No matching options" message displays
  - Test: Restart button clears selections and returns to selection screen

- [X] **T063** [P] E2E test: Session full rejection
  - File: `frontend/tests/e2e/session-full.spec.ts`
  - Scenario: 4 participants join, 5th participant rejected
  - Test: 5th participant sees "Session is full" error

- [X] **T064** [P] E2E test: Mobile UI and accessibility
  - File: `frontend/tests/e2e/mobile-accessibility.spec.ts`
  - Test: All pages render correctly at 390px viewport
  - Test: Touch targets are ≥44x44px
  - Test: Color contrast meets WCAG AA (4.5:1)
  - Test: Keyboard navigation works

---

## Phase 3.7: Polish

### Unit Tests

- [ ] **T065** [P] Unit test: Session code generation
  - File: `backend/tests/unit/session-code.test.ts`
  - Test: Generates 6-character alphanumeric uppercase code
  - Test: No duplicate codes in 1000 generations

- [ ] **T066** [P] Unit test: Overlap calculation (SINTER)
  - File: `backend/tests/unit/overlap-calculation.test.ts`
  - Test: Correctly calculates intersection of 2, 3, 4 sets
  - Test: Returns empty array for no overlap
  - Test: Single participant returns own selections

- [ ] **T067** [P] Unit test: TTL refresh logic
  - File: `backend/tests/unit/ttl-refresh.test.ts`
  - Test: Calculates correct EXPIREAT timestamp (current + 1800 seconds)
  - Test: Refreshes all session-related keys atomically

- [ ] **T068** [P] Unit test: Participant limit enforcement
  - File: `backend/tests/unit/participant-limit.test.ts`
  - Test: Allows 1-4 participants
  - Test: Rejects 5th participant with SESSION_FULL error

- [ ] **T069** [P] Unit test: Zustand store actions
  - File: `frontend/tests/unit/sessionStore.test.ts`
  - Test: addParticipant updates participants array
  - Test: setResults updates overlappingOptions and allSelections
  - Test: resetSession clears all state

### Performance Tests

- [ ] **T070** [P] Performance test: REST API latency
  - File: `backend/tests/performance/api-latency.test.ts`
  - Test: POST /api/sessions completes in <500ms p95
  - Test: GET /api/sessions/:code completes in <500ms p95

- [ ] **T071** [P] Performance test: WebSocket broadcast latency
  - File: `backend/tests/performance/websocket-latency.test.ts`
  - Test: participant:joined broadcast received in <200ms p95
  - Test: session:results broadcast received in <200ms p95

- [ ] **T072** [P] Performance test: Frontend bundle size
  - File: `frontend/tests/performance/bundle-size.test.ts`
  - Test: Initial bundle <100KB gzipped
  - Test: Total (initial + vendor + routes) <200KB gzipped

### Documentation

- [ ] **T073** [P] Backend API documentation
  - File: `backend/README.md`
  - Content: Setup instructions, environment variables, Redis connection string
  - Content: Link to contracts/openapi.yaml for API reference

- [ ] **T074** [P] Frontend development guide
  - File: `frontend/README.md`
  - Content: Setup instructions, available scripts, Zustand store structure
  - Content: Component library and styling guidelines

- [ ] **T075** [P] Deployment guide
  - File: `docs/DEPLOYMENT.md`
  - Content: Docker setup for Redis, environment variables, production build steps
  - Content: Performance monitoring and Redis memory usage

### Refactoring

- [ ] **T076** Remove code duplication across services
  - Identify: Repeated Redis operations, validation logic
  - Refactor: Extract to shared utilities

- [ ] **T077** Optimize frontend re-renders
  - Identify: Unnecessary Zustand subscriptions
  - Refactor: Use selective subscriptions (e.g., useSessionStore(state => state.participants))

### Manual Testing

- [ ] **T078** Execute quickstart.md manual testing checklist
  - Verify: Session creation, join via code, real-time updates
  - Verify: Selection privacy, overlap calculation, restart flow
  - Verify: Session expiration after 30 minutes (long-running test)
  - Verify: Mobile UI on 390px viewport (Chrome DevTools device emulation)

---

## Dependencies Graph

```
Setup (T001-T006)
  ↓
Shared Types (T007-T011)
  ↓
Contract Tests (T012-T018) [Must fail]
Integration Tests (T019-T026) [Must fail]
  ↓
Backend Core:
  Redis Client (T027-T028)
  Constants (T029)
  Models (T030-T032) [P]
    ↓
  Services (T033-T035)
    ↓
  REST API (T036-T039)
  WebSocket (T040-T045)
    ↓
  Server Integration (T046)

Frontend Core:
  Store (T047)
  Services (T048-T049) [P]
    ↓
  Router (T050)
  Pages (T051-T056) [P]
  Components (T057-T059) [P]
  Styling (T060)

E2E Tests (T061-T064) [P]
Polish (T065-T078) [P]
```

---

## Parallel Execution Examples

### Example 1: Contract Tests (After T011)

```bash
# Launch T012-T018 together (all different files):
Task: "Contract test POST /api/sessions in backend/tests/contract/sessions-create.test.ts"
Task: "Contract test GET /api/sessions/:sessionCode in backend/tests/contract/sessions-get.test.ts"
Task: "Contract test POST /api/sessions/:sessionCode/join in backend/tests/contract/sessions-join.test.ts"
Task: "Contract test GET /api/options in backend/tests/contract/options-get.test.ts"
Task: "Contract test session:join event in backend/tests/contract/websocket-join.test.ts"
Task: "Contract test selection:submit event in backend/tests/contract/websocket-submit.test.ts"
Task: "Contract test session:restart event in backend/tests/contract/websocket-restart.test.ts"
```

### Example 2: Models (After T029)

```bash
# Launch T030-T032 together (different files):
Task: "Session model in backend/src/models/Session.ts"
Task: "Participant model in backend/src/models/Participant.ts"
Task: "Selection model in backend/src/models/Selection.ts"
```

### Example 3: Frontend Pages (After T050)

```bash
# Launch T051-T056 together (different files):
Task: "Home page in frontend/src/pages/HomePage.tsx"
Task: "Create Session page in frontend/src/pages/CreateSessionPage.tsx"
Task: "Join Session page in frontend/src/pages/JoinSessionPage.tsx"
Task: "Session Lobby page in frontend/src/pages/SessionLobbyPage.tsx"
Task: "Selection page in frontend/src/pages/SelectionPage.tsx"
Task: "Results page in frontend/src/pages/ResultsPage.tsx"
```

---

## Notes

- **[P] tasks**: Different files, no dependencies, safe to parallelize
- **TDD workflow**: Tests (T012-T026) MUST fail before implementation (T027-T046)
- **Mobile-first**: All UI tasks use 390px baseline with responsive breakpoints
- **Accessibility**: WCAG AA compliance required for all frontend components
- **Performance**: Validate latency targets (<500ms REST, <200ms WebSocket)
- **Commit frequency**: Commit after completing each task or logical group

---

## Validation Checklist

- [x] All REST contracts (openapi.yaml) have corresponding tests (T012-T015)
- [x] All WebSocket events (websocket-events.md) have corresponding tests (T016-T018)
- [x] All entities (data-model.md) have model tasks (T030-T032)
- [x] All acceptance scenarios (spec.md) have integration tests (T019-T026)
- [x] All tests come before implementation (Phase 3.3 before 3.4)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task

---

**Total Tasks**: 78
**Estimated Completion**: 5-7 days with 1 developer, 2-3 days with parallel execution

**Next Step**: Execute tasks sequentially or in parallel following dependency graph.