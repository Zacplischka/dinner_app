# Claude Code Context

**Project**: Dinner Decider
**Last Updated**: 2025-09-30

## Tech Stack

**Languages**:
- Backend: Node.js 20 LTS + TypeScript 5.x
- Frontend: React 18.x + TypeScript 5.x

**Frameworks/Libraries**:
- Backend: Express 4.x, Socket.IO 4.x, Redis 7.x
- Frontend: Vite 5.x, Socket.IO Client 4.x, Tailwind CSS 3.x, React Router 6.x, Zustand 4.x
- Testing: Vitest 1.x, Supertest 6.x, Playwright 1.x

**Database**: Redis (in-memory with native TTL for 30-minute session expiration)

**Project Type**: Web application (monorepo: frontend + backend with real-time WebSocket communication)

## Architectural Decisions

### Real-Time Communication
- Socket.IO room-based architecture
- Each session = 1 Socket.IO room
- Event-driven state machine for session lifecycle
- Selective broadcasting for privacy rules (FR-023)

### Data Storage
- Redis with TTL for automatic session expiration (30 minutes)
- Set-based selection storage for efficient intersection calculation
- No persistent database - sessions are ephemeral by design

### Frontend Architecture
- Mobile-first design with Tailwind CSS
- Zustand for lightweight state management
- React Router for screen navigation
- Socket.IO client for real-time updates

## Key Constraints

- No authentication system (honor system, FR-024)
- 1-4 participants per session (FR-004, FR-005)
- Static hardcoded dinner options list (FR-018)
- Private selections until all submit (FR-008, FR-023)
- 30-minute inactivity timeout (FR-019)
- Mobile-first UI (<200KB bundle, FR-014)

## Project Structure

```
dinner_app/
├── backend/
│   ├── src/
│   │   ├── models/           # Session, Participant, Selection
│   │   ├── services/         # Business logic
│   │   ├── api/              # REST endpoints
│   │   ├── websocket/        # Socket.IO handlers
│   │   ├── redis/            # Redis client
│   │   └── server.ts
│   └── tests/
│       ├── contract/         # API contract tests
│       ├── integration/      # WebSocket flows
│       └── unit/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/            # Create, Join, Select, Results
│   │   ├── services/         # Socket.IO client
│   │   ├── stores/           # Zustand
│   │   └── App.tsx
│   └── tests/
│       ├── unit/
│       └── e2e/              # Playwright mobile tests
└── shared/
    └── types/                # Shared TypeScript contracts
```

## Recent Changes
- 001-dinner-decider-enables: Added Node.js 20 LTS + TypeScript 5.x (backend), React 18.x + TypeScript 5.x (frontend) + Express 4.x, Socket.IO 4.x, Redis 7.x (backend); Vite 5.x, Socket.IO Client 4.x, Tailwind CSS 3.x, React Router 6.x, Zustand 4.x (frontend)

- **2025-09-30**: Initial feature specification and implementation plan completed
  - Spec: `/specs/001-dinner-decider-enables/spec.md`
  - Plan: `/specs/001-dinner-decider-enables/plan.md`
  - Research: `/specs/001-dinner-decider-enables/research.md`
  - Data Model: `/specs/001-dinner-decider-enables/data-model.md`
  - Contracts: `/specs/001-dinner-decider-enables/contracts/`
  - Quickstart: `/specs/001-dinner-decider-enables/quickstart.md`

## Development Guidelines

- Follow TDD: Write tests before implementation
- Mobile-first: Test all UI changes on 390px viewport (iPhone 12 Pro)
- Type safety: Use shared TypeScript types from `shared/types/`
- Performance: Validate latency targets (<500ms session ops, <200ms selections)
- WebSocket events: Follow event contracts in `contracts/websocket-events.md`

## Testing Strategy

1. **Contract Tests**: Validate API/WebSocket schemas match OpenAPI/TypeScript definitions
2. **Unit Tests**: Business logic (overlap calculation, code generation, expiration)
3. **Integration Tests**: WebSocket event sequences, Redis TTL behavior
4. **E2E Tests**: Multi-participant flows in Playwright with mobile emulation

## Useful Commands

```bash
# Start development environment
docker run -d -p 6379:6379 redis:7-alpine
cd backend && npm run dev
cd frontend && npm run dev

# Run tests
npm run test              # Unit + integration
npm run test:e2e          # Playwright E2E
npm run test:contract     # API contract validation

# Redis debugging
redis-cli GET session:ABC123
redis-cli TTL session:ABC123
redis-cli LRANGE session:ABC123:options 0 -1
```

---

*For detailed feature specification, see `/specs/001-dinner-decider-enables/spec.md`*
