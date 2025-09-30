
# Implementation Plan: Dinner Decider

**Branch**: `001-dinner-decider-enables` | **Date**: 2025-09-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/zacharyplischka/dinner_app/specs/001-dinner-decider-enables/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Dinner Decider enables 1-4 people to join shared sessions, privately select preferred dinner options from a static list, and reveals only overlapping choices for group consensus. The system emphasizes speed and simplicity: no authentication, mobile-first UI, real-time WebSocket synchronization, and Redis-backed ephemeral sessions with automatic 30-minute expiration.

## Technical Context
**Language/Version**: Node.js 20 LTS + TypeScript 5.x (backend), React 18.x + TypeScript 5.x (frontend)
**Primary Dependencies**: Express 4.x, Socket.IO 4.x, Redis 7.x (backend); Vite 5.x, Socket.IO Client 4.x, Tailwind CSS 3.x, React Router 6.x, Zustand 4.x (frontend)
**Storage**: Redis 7.x (in-memory with native TTL for automatic session expiration)
**Testing**: Vitest 1.x (unit/integration), Supertest 6.x (API contracts), Playwright 1.x (E2E with mobile emulation)
**Target Platform**: Modern web browsers (mobile-first: iOS Safari 15+, Chrome Android 100+)
**Project Type**: Web application (monorepo: frontend + backend with real-time WebSocket communication)
**Performance Goals**: <500ms p95 REST API, <200ms p95 WebSocket broadcast, 50+ concurrent sessions (200 clients), <200KB frontend bundle gzipped
**Constraints**: Mobile viewport 320-768px (390px baseline), 1-4 participants per session, 30-minute inactivity timeout, WCAG AA compliance, touch targets ≥44x44px
**Scale/Scope**: 4 core screens (Create, Join, Select, Results), 50+ concurrent sessions, static hardcoded options list

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Reference**: [Constitution v1.0.0](../../.specify/memory/constitution.md)

### I. Test-Driven Development
- [x] All contract tests written before implementation? → Yes, Phase 1 generates contract tests from OpenAPI/TypeScript schemas before implementation
- [x] Integration tests defined from user scenarios? → Yes, acceptance scenarios (spec.md:74-81) map to integration test scenarios
- [x] Red-Green-Refactor cycle planned? → Yes, tasks.md will order: write failing test → implement → refactor

### II. Contract-First API Design
- [x] REST/WebSocket contracts defined in OpenAPI/TypeScript? → Yes, Phase 1 will generate contracts/ directory with REST (OpenAPI) and WebSocket event schemas (TypeScript)
- [x] Contract tests planned before endpoint implementation? → Yes, Supertest 6.x validates API contracts; contract tests execute before implementation tasks

### III. Real-Time State Synchronization
- [x] Session state changes broadcast via WebSocket? → Yes, Socket.IO 4.x with room-based architecture (1 session = 1 room)
- [x] Privacy rules (FR-023) enforced in broadcasting logic? → Yes, selective broadcasting planned: show names on join, hide selections until all submit
- [x] Redis as single source of truth confirmed? → Yes, Redis 7.x stores session state with TTL; no secondary storage

### IV. Mobile-First Performance
- [x] UI designed for 390px viewport first? → Yes, Tailwind CSS mobile-first breakpoints, 390px baseline (iPhone 12 Pro)
- [x] Latency targets documented (<500ms, <200ms)? → Yes, Technical Context specifies <500ms REST p95, <200ms WebSocket broadcast p95
- [x] Bundle size budget allocated (<200KB gzipped)? → Yes, React + Vite with code splitting planned; Playwright tests will validate bundle size

### V. Ephemeral by Design
- [x] All session data uses Redis TTL (30 minutes)? → Yes, FR-019 specifies 30-minute inactivity timeout; Redis native EXPIRE command handles cleanup
- [x] No persistent storage introduced? → Yes, Redis only; no PostgreSQL/SQLite/file storage planned
- [x] No manual cleanup jobs added? → Yes, Redis TTL handles expiration automatically; no cron jobs or background workers

### VI. Simplicity Over Features
- [x] Complex features justified vs. simpler alternatives? → Yes, honor system (FR-024) instead of device tracking; static options (FR-018) instead of admin UI; no overlap fallback (FR-016)
- [x] YAGNI principle applied to proposed enhancements? → Yes, deferred features: automatic participant removal on disconnect (clarifications:65), authentication system

### Performance & Scale
- [x] Session capacity limited to 1-4 participants? → Yes, FR-004 (allow 1-4), FR-005 (prevent >4)
- [x] Concurrency targets defined (50+ sessions)? → Yes, Technical Context specifies 50+ concurrent sessions (200 clients)
- [x] Redis pipelining used for multi-key operations? → Yes, planned for atomic session state updates (e.g., participant join + count increment)

### Mobile-First Design
- [x] Responsive layout tested at 320-768px range? → Yes, Playwright E2E tests will use mobile emulation (390px viewport)
- [x] Touch targets ≥44x44px? → Yes, Tailwind CSS utilities will enforce minimum touch target sizes
- [x] WebSocket reconnection UI planned? → Yes, progressive enhancement principle requires reconnection handling
- [x] WCAG AA compliance verified? → Yes, color contrast and keyboard navigation will be validated in accessibility tests

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
backend/
├── src/
│   ├── models/           # Session, Participant, Selection entities
│   ├── services/         # Business logic (overlap calculation, session lifecycle)
│   ├── api/              # Express REST endpoints (POST /sessions, POST /sessions/:code/join)
│   ├── websocket/        # Socket.IO event handlers (participant:join, selection:submit, session:results)
│   ├── redis/            # Redis client configuration and TTL management
│   └── server.ts         # Express + Socket.IO server initialization
└── tests/
    ├── contract/         # Supertest API schema validation
    ├── integration/      # WebSocket event flow tests (join → select → results)
    └── unit/             # Business logic tests (overlap intersection, code generation)

frontend/
├── src/
│   ├── components/       # Reusable UI (ParticipantList, OptionSelector, ResultsDisplay)
│   ├── pages/            # Route components (CreateSession, JoinSession, SelectOptions, ViewResults)
│   ├── services/         # Socket.IO client wrapper and API calls
│   ├── stores/           # Zustand state management (session, participants, selections)
│   └── App.tsx           # React Router setup and global providers
└── tests/
    ├── unit/             # Component unit tests (Vitest + React Testing Library)
    └── e2e/              # Playwright multi-participant flows (mobile viewport)

shared/
└── types/                # Shared TypeScript contracts (SessionState, ParticipantDTO, WebSocketEvents)
```

**Structure Decision**: Web application monorepo structure selected based on "frontend + backend" detection in Technical Context. Shared TypeScript types enable contract-first design between frontend/backend. Redis client lives in backend only (no frontend direct access).

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts/, data-model.md, quickstart.md)
- **Contract Tests** (from contracts/openapi.yaml + websocket-events.md):
  - REST contract test for POST /sessions [P]
  - REST contract test for POST /sessions/:code/join [P]
  - REST contract test for GET /options [P]
  - WebSocket contract test for session:join event [P]
  - WebSocket contract test for selection:submit event [P]
  - WebSocket contract test for session:results event [P]
- **Data Model Tests** (from data-model.md):
  - Redis session creation and TTL test [P]
  - Redis participant management test [P]
  - Redis selection storage test [P]
  - Redis overlap calculation (SINTER) test [P]
- **User Story Tests** (from spec.md acceptance scenarios):
  - Integration test: Create session flow
  - Integration test: Join session flow (2-4 participants)
  - Integration test: Submit selections flow
  - Integration test: Results revelation flow (with overlap)
  - Integration test: Results revelation flow (no overlap)
  - Integration test: Session restart flow
  - Integration test: Session expiration flow
- **Implementation Tasks** (to make tests pass):
  - Backend: Setup Express + Socket.IO + Redis client
  - Backend: Session service (create, join, get)
  - Backend: Participant service (add, remove, list)
  - Backend: Selection service (submit, get all)
  - Backend: Overlap calculation service (SINTER)
  - Backend: WebSocket event handlers (join, submit, restart)
  - Backend: TTL refresh middleware
  - Frontend: Setup Vite + React + Tailwind + Zustand
  - Frontend: Create Session page + API integration
  - Frontend: Join Session page + WebSocket connection
  - Frontend: Selection page + multi-select UI
  - Frontend: Results page + restart button
  - Frontend: WebSocket event listeners (Zustand store updates)
  - E2E: Multi-participant flow (Playwright)

**Ordering Strategy**:
1. **Contract tests first** (define API surface)
2. **Shared types** (from contracts)
3. **Backend models and services** (Redis operations)
4. **Backend API and WebSocket handlers**
5. **Frontend pages and components** (parallel with backend after contracts)
6. **Integration tests** (after backend services complete)
7. **E2E tests** (final validation)

**Parallelization**:
- Mark [P] for tasks that can run in parallel (independent files/components)
- Contract tests: All parallel
- Backend services: Parallel after Redis client setup
- Frontend pages: All parallel after Zustand store setup
- Integration tests: Sequential (require full backend)

**Estimated Output**: 40-50 numbered, dependency-ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) - Generated research.md with Socket.IO, Redis, React, and contract testing best practices
- [x] Phase 1: Design complete (/plan command) - Generated data-model.md, contracts/openapi.yaml, contracts/websocket-events.md, quickstart.md, and updated CLAUDE.md
- [x] Phase 2: Task planning complete (/plan command - describe approach only) - Documented 40-50 task approach with TDD ordering
- [ ] Phase 3: Tasks generated (/tasks command) - Awaiting execution
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS - All constitutional requirements satisfied (TDD, contract-first, real-time sync, mobile-first, ephemeral design, simplicity)
- [x] Post-Design Constitution Check: PASS - Design artifacts conform to constitutional principles
- [x] All NEEDS CLARIFICATION resolved - All 8 clarification questions answered in spec.md Session 2025-09-30
- [x] Complexity deviations documented - None; design follows simplicity principles (honor system, static options, no fallback)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
