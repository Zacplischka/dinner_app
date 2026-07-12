# Claude Code Context

**Project**: Dinder
**Last Updated**: 2026-07-12

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
- Session state is ephemeral by design (Redis only, no history); the social graph (Profiles, Friendships, Session Invites) persists in Supabase — see `docs/adr/0001`

### Frontend Architecture
- Mobile-first design with Tailwind CSS
- Zustand for lightweight state management
- React Router for screen navigation
- Socket.IO client for real-time updates

## Commands

```bash
npm install                                  # root; installs all workspaces
docker run -d -p 6379:6379 redis:7-alpine    # required for backend dev AND all backend tests
npm run dev                                  # backend :3001 + frontend :3000
npm run build                                # shared → backend → frontend

cd backend && npm run test:unit              # also test:contract, test:integration — all need local Redis
cd frontend && npx vitest run                # unit tests; npm run test:e2e for Playwright
npm run lint                                 # root; lints backend + frontend src
```

## Deployments

- **Railway** (project has 3 services; auto-deploys on push to `main`, filtered by watch patterns — see `DEPLOY_GUIDE.md`):
  - Backend: https://backend-production-4ce9.up.railway.app (health: `/health`; config in `backend/railway.json`)
  - Frontend: https://frontend-production-bdfc.up.railway.app (static Vite site, needs `RAILPACK_SPA_OUTPUT_DIR=frontend/dist`)
  - Redis: service `redis-bbxI`, reached via public TCP proxy `trolley.proxy.rlwy.net` (internal URL fails in monorepo builds)
- **Supabase**: project `hcjuqvicwuszwqkreklc` (https://hcjuqvicwuszwqkreklc.supabase.co) — social graph persistence + auth (JWT).
- **Google Places API (New)**: `places.googleapis.com/v1` (`places:searchNearby`, `places:searchText`, photo media) — called from `backend/src/services/RestaurantSearchService.ts`; key in `backend/.env`.
- CI (`.github/workflows/ci-cd.yml`) verifies production deploys by polling the backend health endpoint after Railway deploys.

### How Claude can access these

- **Supabase**: Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) — list_tables, execute_sql, get_logs, get_advisors, apply_migration, etc. against project `hcjuqvicwuszwqkreklc`.
- **Railway**: `railway` CLI (installed via Homebrew). Requires `railway login` (interactive — ask the user to run it), then `railway link`, `railway logs`, `railway variables`, `railway up`.
- **Google Places**: `gcloud` CLI is installed and authenticated, but the active project is `mypickle-486702` — verify/switch project before touching Places quotas or keys (`gcloud config set project <id>`). Runtime access just uses the API key in `backend/.env`.

## Gotchas

- Build `@dinder/shared` first (`npm run build --workspace=shared`) — backend/frontend typecheck resolves the `file:` dep against `shared/dist/`.
- Backend "unit" tests are not isolated: they hit a real Redis on localhost:6379 and run test files serially to avoid key collisions.
- Backend env is in `backend/.env` (GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY, REDIS_*). Frontend uses VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (Zacplischka/dinner_app) via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary — each triage role uses its canonical name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
