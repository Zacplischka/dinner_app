# 🍽️ Dinner Decider

A real-time web application that helps groups of 2-4 people decide on a restaurant by finding overlapping preferences. No authentication required - just create a session, share the code, make selections, and see what everyone agrees on!

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://frontend-production-bdfc.up.railway.app)
[![Backend Status](https://img.shields.io/badge/backend-healthy-success)](https://backend-production-4ce9.up.railway.app/health)

## 🌟 Features

- **No Sign-Up Required**: Honor system - just enter your name and go
- **Real-Time Collaboration**: WebSocket-powered live updates as participants join and submit
- **Private Selections**: Your choices stay hidden until everyone submits
- **Smart Matching**: Instantly see restaurants that everyone agrees on
- **Mobile-First Design**: Optimized for phones with Tailwind CSS
- **Auto-Expiration**: Sessions automatically clean up after 30 minutes of inactivity
- **Shareable Links**: Easy session codes and shareable URLs

## 🚀 Live Demo

- **Frontend**: https://frontend-production-bdfc.up.railway.app
- **Backend API**: https://backend-production-4ce9.up.railway.app
- **Health Check**: https://backend-production-4ce9.up.railway.app/health

## 🏗️ Tech Stack

### Frontend
- **React 18.x** with TypeScript
- **Vite 5.x** for blazing-fast builds
- **Tailwind CSS 3.x** for styling
- **Socket.IO Client 4.x** for real-time communication
- **Zustand 4.x** for state management
- **React Router 6.x** for navigation

### Backend
- **Node.js 20 LTS** with TypeScript
- **Express 4.x** for REST API
- **Socket.IO 4.x** for WebSocket server
- **Redis 7.x** for session storage with native TTL
- **Zod** for schema validation

### Testing
- **Vitest 1.x** for unit tests
- **Supertest 6.x** for API contract tests
- **Playwright 1.x** for E2E tests

### Deployment
- **Railway** (Frontend + Backend)
- **Railway Redis** with public TCP proxy

## 📦 Project Structure

```
dinner_app/
├── backend/              # Express + Socket.IO server
│   ├── src/
│   │   ├── api/         # REST endpoints
│   │   ├── models/      # Data models
│   │   ├── services/    # Business logic
│   │   ├── websocket/   # Socket.IO handlers
│   │   ├── redis/       # Redis client + Lua scripts
│   │   └── server.ts
│   └── tests/           # Contract, integration, unit tests
│
├── frontend/            # React + Vite app
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route pages
│   │   ├── services/    # API & Socket.IO clients
│   │   ├── stores/      # Zustand state
│   │   └── App.tsx
│   └── tests/           # Unit + E2E tests
│
└── shared/              # Shared TypeScript types
    └── types/           # Contracts between FE/BE
```

## 🛠️ Local Development

### Prerequisites
- Node.js 20 LTS or higher
- Docker (for local Redis)
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd dinner_app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start Redis**
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

4. **Start backend** (in terminal 1)
   ```bash
   cd backend
   npm run dev
   # Backend runs on http://localhost:3001
   ```

5. **Start frontend** (in terminal 2)
   ```bash
   cd frontend
   npm run dev
   # Frontend runs on http://localhost:3000
   ```

6. **Open browser**
   - Navigate to http://localhost:3000
   - Create a session and test!

### Environment Variables

**Backend** (`backend/.env`):
```bash
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FRONTEND_URL=http://localhost:3000
```

**Frontend** (`frontend/.env`):
```bash
# Development uses localhost by default
VITE_API_BASE_URL=http://localhost:3001/api
VITE_BACKEND_URL=http://localhost:3001
```

**Frontend Production** (`frontend/.env.production`):
```bash
# Production URLs (already configured)
VITE_API_BASE_URL=https://backend-production-4ce9.up.railway.app/api
VITE_BACKEND_URL=https://backend-production-4ce9.up.railway.app
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires frontend + backend running)
npm run test:e2e

# Contract tests (validates API schemas)
cd backend && npm run test:contract
```

## 📚 How It Works

### Session Flow

1. **Create Session**: Host enters their name and gets a 6-character session code
2. **Join Session**: Participants enter the code and their names
3. **Select Options**: Everyone privately selects restaurants they'd be interested in
4. **Submit**: Once all participants submit, results are revealed
5. **Results**: See which restaurants everyone agreed on
6. **Restart**: Host can restart for a new round with same participants

### Key Features

- **Private Selections**: Selections are stored per-participant in Redis and only revealed when all submit (FR-008, FR-023)
- **Real-Time Updates**: Socket.IO rooms broadcast participant joins, submissions, and results
- **Session Expiration**: Redis TTL automatically cleans up inactive sessions after 30 minutes (FR-019)
- **Smart Overlap Calculation**: Set intersection finds restaurants everyone selected

## 🚢 Deployment

See [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) for detailed Railway deployment instructions.

### Quick Deploy Summary

**Backend**:
- Service: `backend`
- Build: Monorepo workspace build with Lua script copy
- Environment: Redis connection + FRONTEND_URL for CORS

**Frontend**:
- Service: `frontend`
- Build: Vite build with production env vars
- Environment: `RAILPACK_SPA_OUTPUT_DIR=frontend/dist` + backend URLs

**Redis**:
- Service: `redis-bbxI`
- Public TCP proxy enabled for connection

## 📖 API Documentation

### REST Endpoints

**POST /api/sessions**
- Create new session
- Body: `{ "hostName": "string" }`
- Returns: Session code, shareable link, expiration time

**GET /api/sessions/:code**
- Get session details
- Returns: Session state, participants, expiration

**GET /api/options**
- Get list of dinner options (hardcoded list)
- Returns: Array of `{ id, name, cuisine }`

### WebSocket Events

See `specs/001-dinner-decider-enables/contracts/websocket-events.md` for full event documentation.

**Client → Server**:
- `session:join` - Join a session with display name
- `selection:submit` - Submit restaurant selections
- `session:restart` - Restart session (host only)

**Server → Client**:
- `participant:joined` - New participant joined
- `participant:submitted` - Participant submitted selections
- `session:results` - All submitted, results revealed
- `session:expired` - Session expired due to inactivity
- `error` - Server-side error

## 🤝 Contributing

This project was built following Test-Driven Development (TDD) principles:

1. Write tests first (contract → integration → E2E)
2. Implement features to pass tests
3. Refactor while keeping tests green

See `specs/001-dinner-decider-enables/` for detailed specifications and architecture decisions.

## 📄 License

MIT

## 🙏 Acknowledgments

Built with Claude Code for rapid full-stack development with real-time features.

---

**Questions or Issues?**
- Check [DEPLOYMENT_STATUS.md](./DEPLOYMENT_STATUS.md) for deployment details
- Review [deploy.md](./deploy.md) for Railway-specific configuration
- See [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) for complete deployment walkthrough