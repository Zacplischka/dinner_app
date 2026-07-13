# Railway Deployment Guide - Dinder

Three Railway services: **redis-bbxI** (Redis with public TCP proxy), **backend** (Express + Socket.IO), **frontend** (static Vite site). Both app services auto-deploy on push to `main`, filtered by watch patterns.

## Environment variables

| Service | Variable | Value | Why critical |
|---------|----------|-------|--------------|
| Backend | `REDIS_HOST` | Public TCP proxy host (`trolley.proxy.rlwy.net`) | Internal Railway URLs fail in monorepo builds |
| Backend | `REDIS_PORT` | Public TCP proxy port | Must match Redis public port |
| Backend | `REDIS_PASSWORD` | Redis service password (Railway dashboard) | Authentication required |
| Backend | `FRONTEND_URL` | `https://frontend-production-bdfc.up.railway.app` | CORS blocks requests otherwise |
| Frontend | `RAILPACK_SPA_OUTPUT_DIR` | `frontend/dist` | Nixpacks can't find a start command without it |
| Frontend | `VITE_API_BASE_URL` | `https://backend-production-4ce9.up.railway.app/api` | Embedded at build time for API calls |
| Frontend | `VITE_BACKEND_URL` | `https://backend-production-4ce9.up.railway.app` | Embedded at build time for WebSocket |

`frontend/.env.production` (committed) carries the two `VITE_*` URLs as a build-time fallback; Railway env vars override it. If either domain changes, update the other service's variable and redeploy.

Backend build/deploy config is in `backend/railway.json` (service Root Directory is `backend`). Frontend has no config file — Nixpacks detects the static site via `RAILPACK_SPA_OUTPUT_DIR`.

## Watch patterns

Set in the Railway dashboard per service:

- **Backend**: `backend/**`, `shared/**`, `package.json`, `package-lock.json`
- **Frontend**: `frontend/**`, `shared/**`, `package.json`, `package-lock.json`

## Deploy

```bash
railway login && railway link

railway service backend && railway up
railway service frontend && railway up

# Logs / rollback
railway logs
railway status && railway rollback <deployment-id>
```

## Smoke check

```bash
# Backend health + Redis connectivity
curl https://backend-production-4ce9.up.railway.app/health        # {"status":"ok",...}
curl https://backend-production-4ce9.up.railway.app/api/options   # {"options":[...]}

# Frontend up, no localhost baked into the bundle
curl -I https://frontend-production-bdfc.up.railway.app           # HTTP/2 200
curl -s https://frontend-production-bdfc.up.railway.app/assets/index-*.js | grep localhost  # no output
```

Then create a session in the browser and confirm the session code renders and "Socket connected" appears in the console.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Failed to fetch` / requests to localhost | Build embedded localhost URLs | Verify `VITE_*` vars and `frontend/.env.production`, then redeploy frontend |
| "No start command was found" | Missing `RAILPACK_SPA_OUTPUT_DIR` | `railway variables --set RAILPACK_SPA_OUTPUT_DIR=frontend/dist` |
| CORS errors | Backend `FRONTEND_URL` mismatch | Set it to the exact frontend domain; backend auto-restarts |
| Redis connection timeout | Using internal Redis URL | Switch `REDIS_*` vars to the public TCP proxy details |
