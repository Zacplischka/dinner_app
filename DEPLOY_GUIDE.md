# 🚀 Railway Deployment Guide - Dinner Decider

Complete guide for deploying the Dinner Decider application to Railway, including all critical configuration settings and troubleshooting.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Redis Service Setup](#redis-service-setup)
4. [Backend Service Setup](#backend-service-setup)
5. [Frontend Service Setup](#frontend-service-setup)
6. [Critical Configuration Settings](#critical-configuration-settings)
7. [Deployment Verification](#deployment-verification)
8. [Troubleshooting](#troubleshooting)
9. [Maintenance](#maintenance)

---

## Prerequisites

### Required Tools
- [Railway CLI](https://docs.railway.app/develop/cli) installed
- Railway account with project access
- Git repository with code

### Required Files
Ensure these files exist in your repository:
- `frontend/.env.production` - Production backend URLs
- `railway.backend.toml` - Backend build configuration (backup)
- `backend/src/redis/*.lua` - Redis Lua scripts

---

## Project Setup

### 1. Create Railway Project

```bash
# Login to Railway
railway login

# Link to existing project or create new one
railway link
# OR
railway init
```

### 2. Project Structure

Your Railway project should have **3 services**:
1. **redis-bbxI** - Redis database
2. **backend** - Express + Socket.IO API
3. **frontend** - React Vite static site

---

## Redis Service Setup

### 1. Create Redis Service

In Railway dashboard:
1. Click "New Service" → "Database" → "Add Redis"
2. Name it `redis-bbxI` (or your preferred name)
3. **CRITICAL**: Enable public TCP proxy for external connections

### 2. Enable Public TCP Proxy

1. Go to Redis service → Settings → Networking
2. Enable "TCP Proxy"
3. Note the public connection details:
   - Host: `trolley.proxy.rlwy.net` (or similar)
   - Port: `45643` (example port)
   - Password: Auto-generated secure password

### 3. Connection Verification

```bash
# Test Redis connection
redis-cli -h trolley.proxy.rlwy.net -p 45643 -a YOUR_PASSWORD PING
# Expected: PONG
```

**⚠️ IMPORTANT**: The backend service MUST use the public TCP proxy connection, not the internal Railway URL, due to monorepo workspace isolation during builds.

---

## Backend Service Setup

### 1. Create Backend Service

```bash
# Switch to backend service context
railway service backend
```

Or create via dashboard:
1. Click "New Service" → "Empty Service"
2. Name it `backend`

### 2. Configure Environment Variables

**CRITICAL**: Set these environment variables in Railway dashboard (Service → Variables):

```bash
# Redis Connection (use public TCP proxy)
REDIS_HOST=trolley.proxy.rlwy.net
REDIS_PORT=45643
REDIS_PASSWORD=NdWQhNfocmjMIeGstBdNyxaQEaDQpPsR

# CORS Configuration
FRONTEND_URL=https://frontend-production-bdfc.up.railway.app

# Optional
PORT=3001  # Railway will override with $PORT
NODE_ENV=production
```

**⚠️ CRITICAL SETTINGS**:
- `REDIS_HOST` must be the **public proxy host**, not Railway internal URL
- `REDIS_PORT` must be the **public proxy port**
- `REDIS_PASSWORD` must match your Redis service password
- `FRONTEND_URL` must be your **exact frontend Railway domain** for CORS

### 3. Backend Railway Configuration

Create or verify `railway.backend.toml`:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install --workspace=@dinner-app/shared --workspace=@dinner-app/backend && npm run build --workspace=@dinner-app/shared && npm run build --workspace=@dinner-app/backend && cp backend/src/redis/*.lua backend/dist/redis/"

[deploy]
startCommand = "cd backend && node dist/server.js"
```

**⚠️ CRITICAL**: The `cp backend/src/redis/*.lua backend/dist/redis/` command is **MANDATORY** - it copies Lua scripts needed for Redis TTL operations. Without this, the backend will crash on startup.

### 4. Deploy Backend

```bash
railway service backend
railway up
```

### 5. Verify Backend Deployment

```bash
# Check health endpoint
curl https://backend-production-4ce9.up.railway.app/health
# Expected: {"status":"ok","timestamp":"..."}

# Check Redis connection
curl https://backend-production-4ce9.up.railway.app/api/options
# Expected: {"options":[...]}
```

---

## Frontend Service Setup

### 1. Create Frontend Service

```bash
# Switch to frontend service context
railway service frontend
```

Or create via dashboard:
1. Click "New Service" → "Empty Service"
2. Name it `frontend`

### 2. Configure Environment Variables

**CRITICAL**: Set these environment variables in Railway dashboard (Service → Variables):

```bash
# Backend URLs - MUST match your backend Railway domain
VITE_API_BASE_URL=https://backend-production-4ce9.up.railway.app/api
VITE_BACKEND_URL=https://backend-production-4ce9.up.railway.app

# Nixpacks SPA Configuration - MANDATORY
RAILPACK_SPA_OUTPUT_DIR=frontend/dist
```

**⚠️ CRITICAL SETTINGS**:

1. **`VITE_API_BASE_URL`** and **`VITE_BACKEND_URL`**:
   - Must use **HTTPS** (not HTTP)
   - Must include `/api` suffix for API base URL
   - Must match your backend Railway domain **exactly**
   - These are embedded into the frontend build at **build time**

2. **`RAILPACK_SPA_OUTPUT_DIR=frontend/dist`**:
   - **MANDATORY** for Nixpacks to detect static site in monorepo
   - Without this, Nixpacks will fail to find a start command
   - Must point to the exact dist directory relative to project root

### 3. Frontend Production Environment File

Verify `frontend/.env.production` exists and contains:

```bash
# Production environment variables for Railway deployment
VITE_API_BASE_URL=https://backend-production-4ce9.up.railway.app/api
VITE_BACKEND_URL=https://backend-production-4ce9.up.railway.app
```

**Purpose**: This file ensures production URLs are used even if Railway environment variables aren't properly injected during build (fallback mechanism).

**⚠️ IMPORTANT**:
- Commit this file to git (exception to .env security rule for static sites)
- Update URLs if backend domain changes
- Railway env vars override this file if set

### 4. Deploy Frontend

```bash
railway service frontend
railway up
```

**Build Process**:
1. Nixpacks detects Node.js monorepo
2. Installs dependencies for shared + frontend workspaces
3. Builds shared workspace first
4. Builds frontend with Vite (embeds `VITE_*` env vars)
5. Detects `RAILPACK_SPA_OUTPUT_DIR` and serves static files
6. Serves with SPA routing support

### 5. Verify Frontend Deployment

```bash
# Check frontend loads
curl -I https://frontend-production-bdfc.up.railway.app
# Expected: HTTP/2 200

# Check production URLs are embedded
curl -s https://frontend-production-bdfc.up.railway.app | grep 'src=' | head -1
# Get the JS bundle hash, e.g., index-CKSMsjgL.js

# Verify no localhost references
curl -s https://frontend-production-bdfc.up.railway.app/assets/index-CKSMsjgL.js | grep localhost
# Expected: (no output)

# Verify production backend URLs
curl -s https://frontend-production-bdfc.up.railway.app/assets/index-CKSMsjgL.js | grep 'backend-production'
# Expected: backend-production-4ce9.up.railway.app
```

---

## Critical Configuration Settings

### ⚠️ Must-Have Settings Summary

| Service | Variable | Value | Why Critical |
|---------|----------|-------|--------------|
| Backend | `REDIS_HOST` | Public TCP proxy host | Internal Railway URLs fail in monorepo builds |
| Backend | `REDIS_PORT` | Public TCP proxy port | Must match Redis public port |
| Backend | `REDIS_PASSWORD` | Redis password | Authentication required |
| Backend | `FRONTEND_URL` | Frontend Railway domain | CORS will block requests otherwise |
| Frontend | `RAILPACK_SPA_OUTPUT_DIR` | `frontend/dist` | Nixpacks can't find start command without this |
| Frontend | `VITE_API_BASE_URL` | Backend `/api` URL | Embedded at build time for API calls |
| Frontend | `VITE_BACKEND_URL` | Backend base URL | Embedded at build time for WebSocket |

### Railway Configuration Files

**DO NOT use `railway.toml` for frontend** - Let Nixpacks auto-detect with `RAILPACK_SPA_OUTPUT_DIR`.

**DO use `railway.backend.toml` for backend** - Rename to `railway.toml` when deploying backend:

```bash
# When deploying backend
mv railway.toml railway.frontend.toml  # Save frontend config
mv railway.backend.toml railway.toml    # Use backend config
railway service backend
railway up

# When deploying frontend
mv railway.toml railway.backend.toml    # Save backend config
mv railway.frontend.toml railway.toml   # Use frontend config (if needed)
railway service frontend
railway up
```

**Alternative**: Deploy each service from Railway dashboard without config files, using environment variables only.

---

## Deployment Verification

### Full Stack Health Check

```bash
# 1. Backend Health
curl https://backend-production-4ce9.up.railway.app/health
# ✅ Expected: {"status":"ok",...}

# 2. Redis Connection
curl https://backend-production-4ce9.up.railway.app/api/options
# ✅ Expected: {"options":[...]}

# 3. Frontend Assets
curl -I https://frontend-production-bdfc.up.railway.app
# ✅ Expected: HTTP/2 200

# 4. Frontend API Connection
# Open browser DevTools and visit:
# https://frontend-production-bdfc.up.railway.app
# ✅ Check console for "Socket connected: [ID]"
```

### Manual E2E Test

1. Visit https://frontend-production-bdfc.up.railway.app
2. Click "Create Session"
3. Enter a name and click "Create Session"
4. Verify session code appears (e.g., T5YLRH)
5. Verify "1/4 participants" shows your name
6. ✅ If all work → Deployment successful!

---

## Troubleshooting

### Issue 1: Frontend Shows "Failed to Fetch"

**Symptoms**:
- Browser console: `Failed to fetch`
- Network tab: Requests to `localhost:3001`

**Cause**: Frontend build has `localhost` URLs instead of production backend

**Fix**:
1. Verify `frontend/.env.production` has correct URLs
2. Verify Railway env vars `VITE_API_BASE_URL` and `VITE_BACKEND_URL` are set
3. Clear Vite build cache and redeploy:
   ```bash
   rm -rf frontend/dist frontend/node_modules/.vite
   railway service frontend
   railway up
   ```

### Issue 2: Backend Crashes with "refresh-ttl.lua not found"

**Symptoms**:
- Backend logs: `Error: Script not found`
- Backend exits immediately after start

**Cause**: Lua scripts not copied to `dist/` folder during build

**Fix**:
1. Verify `railway.backend.toml` build command includes:
   ```bash
   cp backend/src/redis/*.lua backend/dist/redis/
   ```
2. Redeploy backend

### Issue 3: "No start command was found"

**Symptoms**:
- Railway build logs: "No start command was found"
- Deployment fails

**Cause**: Frontend - missing `RAILPACK_SPA_OUTPUT_DIR` env var

**Fix**:
```bash
railway service frontend
railway variables --set RAILPACK_SPA_OUTPUT_DIR=frontend/dist
railway up
```

### Issue 4: CORS Errors

**Symptoms**:
- Browser console: `CORS policy: No 'Access-Control-Allow-Origin' header`
- API requests fail

**Cause**: Backend `FRONTEND_URL` doesn't match actual frontend domain

**Fix**:
1. Get exact frontend URL from Railway dashboard
2. Update backend env var:
   ```bash
   railway service backend
   railway variables --set FRONTEND_URL=https://frontend-production-bdfc.up.railway.app
   ```
3. Restart backend (Railway auto-restarts on env var change)

### Issue 5: WebSocket Connection Fails

**Symptoms**:
- Browser console: `WebSocket connection failed`
- No real-time updates

**Cause**: Frontend using wrong WebSocket URL

**Fix**:
1. Check browser DevTools → Network → WS tab
2. Verify WebSocket connects to production backend, not localhost
3. If wrong, rebuild frontend with correct `VITE_BACKEND_URL`

### Issue 6: Redis Connection Timeout

**Symptoms**:
- Backend logs: `Error: Redis connection timeout`
- Backend can't start

**Cause**: Using internal Railway Redis URL instead of public TCP proxy

**Fix**:
1. Get Redis public TCP proxy details from Railway dashboard
2. Update backend env vars:
   ```bash
   railway service backend
   railway variables --set REDIS_HOST=trolley.proxy.rlwy.net
   railway variables --set REDIS_PORT=45643
   railway variables --set REDIS_PASSWORD=YOUR_PASSWORD
   ```

---

## Maintenance

### Updating Backend URLs

If backend Railway domain changes:

1. Update frontend environment variables:
   ```bash
   railway service frontend
   railway variables --set VITE_API_BASE_URL=https://NEW-BACKEND-URL.up.railway.app/api
   railway variables --set VITE_BACKEND_URL=https://NEW-BACKEND-URL.up.railway.app
   ```

2. Update `frontend/.env.production` locally:
   ```bash
   # Edit frontend/.env.production with new URLs
   git add frontend/.env.production
   git commit -m "Update production backend URLs"
   git push
   ```

3. Redeploy frontend:
   ```bash
   railway service frontend
   railway up
   ```

### Updating Frontend URLs

If frontend Railway domain changes:

1. Update backend CORS:
   ```bash
   railway service backend
   railway variables --set FRONTEND_URL=https://NEW-FRONTEND-URL.up.railway.app
   ```

2. Backend will auto-restart with new CORS settings

### Monitoring

```bash
# View backend logs
railway service backend
railway logs

# View frontend logs
railway service frontend
railway logs

# Check Redis stats
railway service redis-bbxI
railway logs
```

### Rollback

```bash
# View deployments
railway service backend
railway status

# Rollback to previous deployment
railway rollback <deployment-id>
```

---

## Summary Checklist

Before deploying, ensure:

**Redis**:
- ✅ Public TCP proxy enabled
- ✅ Connection details noted

**Backend**:
- ✅ `REDIS_HOST` = public proxy host
- ✅ `REDIS_PORT` = public proxy port
- ✅ `REDIS_PASSWORD` = correct password
- ✅ `FRONTEND_URL` = exact frontend domain
- ✅ Build command includes Lua script copy
- ✅ Health endpoint responds

**Frontend**:
- ✅ `RAILPACK_SPA_OUTPUT_DIR=frontend/dist` set
- ✅ `VITE_API_BASE_URL` = backend `/api` URL
- ✅ `VITE_BACKEND_URL` = backend base URL
- ✅ `frontend/.env.production` committed
- ✅ No `localhost` references in built JS
- ✅ WebSocket connects successfully

**Verification**:
- ✅ Can create session
- ✅ Session code displays
- ✅ Real-time updates work
- ✅ No CORS errors
- ✅ No console errors

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Deployment Status**: See `DEPLOYMENT_STATUS.md`
- **Project Specs**: See `specs/001-dinner-decider-enables/`

---

**Last Updated**: 2025-09-30
**Deployment Status**: ✅ Fully Operational