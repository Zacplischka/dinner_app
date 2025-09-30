# Deploying Dinner Decider to Railway

This guide walks you through deploying the Dinner Decider monorepo (backend + frontend + shared) to Railway with a Redis service, WebSockets, and separate services for API and static UI.

## Overview
- Backend: Node.js Express + Socket.IO, listens on `PORT`, uses Redis via `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`.
- Frontend: React + Vite, built to static files in `frontend/dist`.
- Shared: TypeScript-only package used by both; must build before backend/frontend.
- Railway: Create 3 services in one project
  - "redis" (managed Redis)
  - "backend" (Node service, root directory `backend`)
  - "frontend" (Static service, root directory `frontend`)

## Prerequisites
- GitHub repo connected to Railway OR Railway CLI installed (`npm i -g @railway/cli`) and logged in (`railway login`).
- Node 18+.

## Step 1: Provision a Railway Project
1. In Railway dashboard: New Project → Empty Project.
2. Add Service → Redis. Name it `redis`.

## Step 2: Add the Backend service
The backend service must build from the monorepo root to access the `shared` workspace.

- Root Directory: `.` (project root, **not** `backend`)
- Build Command:
  ```bash
  npm ci && npm run build --workspace=@dinner-app/shared && npm run build --workspace=@dinner-app/backend
  ```
- Start Command:
  ```bash
  npm start --workspace=@dinner-app/backend
  ```
- Variables (Service → Variables):
  - `PORT`: Railway injects automatically; no need to set. Ensure server uses it.
  - `FRONTEND_URL`: set to your frontend domain once created (temporary: `*` during initial bring-up, then lock it down).
  - Redis (link variables from Redis service using Railway's reference syntax):
    - `REDIS_HOST`: `${{redis.REDIS_HOST}}` or `${{redis.HOST}}`
    - `REDIS_PORT`: `${{redis.REDIS_PORT}}` or `${{redis.PORT}}`
    - `REDIS_PASSWORD`: `${{redis.REDIS_PASSWORD}}` (optional if Railway Redis doesn't require AUTH)

Notes
- **Monorepo dependency**: The backend imports `@dinner-app/shared` types (backend/src/server.ts:14-17). Building from root ensures npm workspaces resolve correctly.
- The backend code reads these envs:
  - `PORT` and `FRONTEND_URL` in `backend/src/server.ts`
  - `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` in `backend/src/redis/client.ts`
- CORS and Socket.IO must allow the final frontend origin.
- Railway variable syntax `${{service.VAR}}` references environment variables from other services in the same project.

## Step 3: Add the Frontend service (Static)
The frontend service must build from the monorepo root to access the `shared` workspace.

- Root Directory: `.` (project root, **not** `frontend`)
- Build Command:
  ```bash
  npm ci && npm run build --workspace=@dinner-app/shared && npm run build --workspace=@dinner-app/frontend
  ```
- Publish Directory: `frontend/dist` (Railway will serve files from this subdirectory)

Variables (build-time only)
- `VITE_API_BASE_URL`: Set to the backend API URL with `/api`, e.g. `https://<backend-domain>/api`
- `VITE_BACKEND_URL`: Set to the backend Socket.IO base URL, e.g. `https://<backend-domain>`

**Important**: Vite embeds these variables at build time (frontend/src/services/apiClient.ts:6, frontend/src/services/socketService.ts:23). You **must redeploy the frontend service** after changing these variables.

## Step 4: Generate Domains and wire CORS
1. Open the Frontend service → Settings → Domains → Generate Domain. Copy the domain (e.g., `https://dinner-frontend.up.railway.app`).
2. Open the Backend service → Settings → Domains → Generate Domain. Copy the domain (e.g., `https://dinner-backend.up.railway.app`).
3. Set backend variable `FRONTEND_URL` to the frontend domain.
4. Set frontend variables:
   - `VITE_API_BASE_URL` to `https://dinner-backend.up.railway.app/api`
   - `VITE_BACKEND_URL` to `https://dinner-backend.up.railway.app`
5. Redeploy both services so config takes effect.

## Step 5: Configure Health Checks (Optional but Recommended)
Railway can monitor your backend service health using the `/health` endpoint.

- Backend exposes `/health` at backend/src/server.ts:34-40
- Returns `200` if Redis is reachable, `503` otherwise
- Configure in Railway: Backend Service → Settings → Health Check → Path: `/health`

## Step 6: WebSockets on Railway
- Railway supports WebSockets on generated and custom domains. Socket.IO works out of the box.
- Ensure CORS origins are correct in the backend (`FRONTEND_URL`).
- The frontend uses `VITE_BACKEND_URL` for Socket.IO.

## Step 7: CI/CD options
- **GitHub integration (recommended)**: Connect the repo to Railway and configure two services with Root Directory set to `.` (root) for both. Configure different start commands to distinguish them.
- **Railway CLI**: Deploy from root directory:
  ```bash
  railway init  # link to the project
  railway up    # deploys the service
  ```
  Note: You'll need separate Railway service configurations for backend vs frontend.

## Step 8: Post-Deployment Validation
After deploying, verify the following:

### 1. Backend Health
```bash
curl https://<backend-domain>/health
# Expected: {"status":"healthy","redis":true}
```

### 2. Frontend Bundle Size
- Navigate to Frontend service → Deployments → [latest] → Logs
- Check build output for bundle size
- **Requirement**: Main bundle must be <200KB (FR-014 in project constitution)
- If oversized, investigate with: `npm run build --workspace=@dinner-app/frontend` locally and check `frontend/dist/assets/*.js`

### 3. WebSocket Connection
- Open frontend in browser: `https://<frontend-domain>`
- Create a session
- Check browser console for Socket.IO connection success (no CORS errors)
- Join session from second device/tab to verify real-time sync

### 4. Redis Session Expiration
- Create a session in the UI
- Use Railway Redis CLI: `redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD`
- Run: `TTL session:<code>` (replace `<code>` with your 6-char session code)
- **Expected**: ~1800 seconds (30 minutes)
- Wait 30 minutes and verify session is auto-deleted

### 5. CORS Configuration
- Verify `FRONTEND_URL` in backend matches exact frontend domain (including `https://`)
- Test from frontend domain only (not localhost) to validate CORS

## Environment Variable Matrix

### Backend Service
- `PORT` — Injected by Railway (e.g., `3000`, `8080`). No manual configuration needed.
- `FRONTEND_URL` — `https://<frontend-domain>` (exact match required for CORS)
- `REDIS_HOST` — `${{redis.REDIS_HOST}}` or `${{redis.HOST}}`
- `REDIS_PORT` — `${{redis.REDIS_PORT}}` or `${{redis.PORT}}`
- `REDIS_PASSWORD` — `${{redis.REDIS_PASSWORD}}` (may be optional depending on Railway Redis config)

**Railway Variable Syntax**: `${{service_name.VARIABLE_NAME}}` references environment variables from other services. For example, `${{redis.HOST}}` pulls the `HOST` variable from the `redis` service in the same project.

### Frontend Service (build-time variables)
- `VITE_API_BASE_URL` — `https://<backend-domain>/api`
- `VITE_BACKEND_URL` — `https://<backend-domain>`

**Note**: These are embedded during the Vite build process. Changing them requires redeploying the frontend service.

## Troubleshooting
- 502/timeout: Confirm backend listens on `process.env.PORT` and service exposes an HTTP server.
- CORS errors: Double-check `FRONTEND_URL` and that it matches the exact protocol + domain of the frontend.
- Socket.IO connection errors: Verify `VITE_BACKEND_URL` and backend CORS origin.
- Redis auth errors: Ensure `REDIS_PASSWORD` is set and sourced from the Redis service. Verify `REDIS_HOST`/`REDIS_PORT` mapping.
- Static site not serving: Ensure Frontend service Publish Directory is `dist` and build completes successfully.

## References to code
```19:27:backend/src/server.ts
const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
...
app.use(cors({ origin: FRONTEND_URL }));
```

```6:14:backend/src/redis/client.ts
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
```

```23:24:frontend/src/services/socketService.ts
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
```

```6:6:frontend/src/services/apiClient.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
```

## Optional: Single service (reverse proxy)
You could serve the built frontend from the backend service (e.g., by copying `frontend/dist` into an `express.static` directory). Railway recommends separate services for simplicity and clearer scaling, but a single service is possible with a custom build script.
