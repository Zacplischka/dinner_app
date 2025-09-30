# Railway Deployment Configuration

This monorepo requires per-service configuration in the Railway dashboard.

## Backend Service Configuration

### Build Settings
- **Build Command**: `npm run build -w shared && npm run build -w backend && npm run postbuild`
- **Watch Patterns**:
  ```
  backend/**
  shared/**
  package.json
  package-lock.json
  ```

### Deploy Settings
- **Start Command**: `cd backend && node dist/server.js`
- **Root Directory**: (leave empty)

## Frontend Service Configuration

### Build Settings
- **Build Command**: `npm run build -w shared && npm run build -w frontend`
- **Watch Patterns**:
  ```
  frontend/**
  shared/**
  package.json
  package-lock.json
  ```

### Deploy Settings
- **Start Command**: `npm run preview -w frontend`
- **Root Directory**: (leave empty)

## Environment Variables

### Backend Service
- `REDIS_HOST` - Set by Railway Redis addon
- `REDIS_PORT` - Set by Railway Redis addon
- `REDIS_PASSWORD` - Set by Railway Redis addon
- `FRONTEND_URL` - Set to frontend service URL (e.g., `https://frontend-production-bdfc.up.railway.app`)

### Frontend Service
- `VITE_API_URL` - Set to backend service URL (e.g., `https://backend-production-4ce9.up.railway.app`)

## Deployment Trigger

Both services deploy automatically on push to `main` branch, but only when their watch patterns match changed files.# Railway monorepo deployment configured successfully
