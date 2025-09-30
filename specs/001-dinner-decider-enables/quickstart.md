# Quickstart Guide: Dinner Decider

**Feature**: 001-dinner-decider-enables
**Date**: 2025-09-30
**Estimated Setup Time**: 5 minutes

---

## Prerequisites

Before starting, ensure you have:

- **Node.js 20 LTS** or later ([download](https://nodejs.org/))
- **npm 10+** (comes with Node.js)
- **Docker** (for Redis) ([download](https://www.docker.com/get-started))
- **Modern browser**: Chrome 100+, Firefox 100+, Safari 15+, or Edge 100+

---

## Quick Start (5 minutes)

### 1. Start Redis

```bash
# Pull and run Redis 7.x in Docker
docker run -d --name dinner-redis -p 6379:6379 redis:7-alpine

# Verify Redis is running
docker ps | grep dinner-redis
```

### 2. Install Dependencies

```bash
# From repository root
npm install

# This installs dependencies for:
# - backend (Express, Socket.IO, Redis client)
# - frontend (React, Vite, Tailwind CSS)
# - shared (TypeScript types, Zod schemas)
```

### 3. Start Development Servers

```bash
# Terminal 1: Start backend server (port 3001)
cd backend
npm run dev

# Terminal 2: Start frontend dev server (port 3000)
cd frontend
npm run dev
```

### 4. Open Application

1. Open browser to [http://localhost:3000](http://localhost:3000)
2. You should see the Dinner Decider home screen
3. Click **"Create Session"** to start a new dinner decision session

---

## User Flow Walkthrough

### Scenario: 3 Friends Deciding on Dinner

#### Step 1: Alice Creates a Session

1. **Navigate to homepage**: [http://localhost:3000](http://localhost:3000)
2. **Click "Create Session"**
3. **Enter name**: "Alice"
4. **Click "Create"**
5. **Result**: Session code displayed (e.g., "ABC123")
6. **Action**: Share the session code or link with friends

#### Step 2: Bob and Charlie Join

**Bob's browser:**
1. Navigate to [http://localhost:3000](http://localhost:3000)
2. Click **"Join Session"**
3. Enter session code: "ABC123"
4. Enter name: "Bob"
5. Click **"Join"**
6. **Result**: Lobby screen shows "Alice, Bob" as participants

**Charlie's browser (new tab or device):**
1. Navigate to [http://localhost:3000](http://localhost:3000)
2. Click **"Join Session"**
3. Enter session code: "ABC123"
4. Enter name: "Charlie"
5. Click **"Join"**
6. **Result**: All browsers update in real-time showing "Alice, Bob, Charlie"

#### Step 3: All Participants Select Options

**Each participant (Alice, Bob, Charlie):**
1. Sees the same list of dinner options (Pizza Palace, Sushi Spot, Thai Kitchen, etc.)
2. Selects their preferred restaurants (e.g., Alice: Pizza, Sushi, Thai)
3. Clicks **"Submit Selections"**
4. Sees waiting screen: "Waiting for others to submit..."
5. **Privacy**: No one sees others' selections until all submit

#### Step 4: View Results

**When all 3 participants submit:**
1. All browsers automatically update to Results screen
2. **Displays overlapping options**: Restaurants that ALL three selected
3. Example: "Sushi Spot, Thai Kitchen" (overlap)
4. **Shows all selections**: "Alice chose: Pizza, Sushi, Thai. Bob chose: Sushi, Thai, Mexican. Charlie chose: Thai, Sushi, Indian."

#### Step 5: Handle No Overlap

**If no overlap:**
1. Results screen shows: "No matching options found"
2. Click **"Restart Session"** to select again with same participants
3. Previous selections are cleared
4. All participants return to selection screen

---

## Verification Steps

### Manual Testing Checklist

- [ ] **Session Creation**: Session code is 6 alphanumeric characters
- [ ] **Join via Code**: Second browser can join using session code
- [ ] **Join via Link**: Click shareable link opens pre-filled join page
- [ ] **Real-Time Updates**: Participant list updates when someone joins
- [ ] **Participant Limit**: 5th participant cannot join (session full message)
- [ ] **Selection Privacy**: Selections remain hidden until all submit
- [ ] **Overlap Calculation**: Only overlapping options appear in results
- [ ] **No Overlap**: "No matching options" message displays correctly
- [ ] **Session Restart**: Restart button clears selections and returns to selection screen
- [ ] **Mobile UI**: Test on 390px viewport (iPhone 12 Pro emulation)
- [ ] **Touch Targets**: All buttons are at least 44×44px
- [ ] **Session Expiration**: Session expires after 30 minutes of inactivity (optional long-running test)

---

## Running Tests

### Backend Tests

```bash
cd backend

# Run all backend tests
npm test

# Run specific test suites
npm run test:contract      # OpenAPI contract validation
npm run test:unit          # Business logic (overlap calculation, code generation)
npm run test:integration   # Redis + WebSocket flows

# Watch mode for development
npm run test:watch
```

### Frontend Tests

```bash
cd frontend

# Run all frontend tests
npm test

# Run specific test suites
npm run test:unit          # Component unit tests (Vitest + React Testing Library)
npm run test:e2e           # Playwright end-to-end tests (headless browser)

# Watch mode
npm run test:watch

# E2E with UI (see browser automation)
npm run test:e2e:ui
```

### End-to-End Test (Full Flow)

```bash
# From repository root
npm run test:e2e:full

# This runs a Playwright test simulating:
# 1. Alice creates session
# 2. Bob joins session
# 3. Charlie joins session
# 4. All three select options
# 5. Results display overlap
# 6. Restart session flow
```

---

## Development Workflow

### Adding a New Feature

1. **Write Tests First (TDD)**:
   ```bash
   cd backend/tests/unit
   # Create failing test for new feature
   npm run test:watch  # Keep running in background
   ```

2. **Implement Feature**:
   ```bash
   cd backend/src
   # Implement minimum code to pass test
   ```

3. **Refactor**:
   ```bash
   # Improve code quality while keeping tests green
   ```

4. **Update Contracts** (if API changes):
   ```bash
   # Edit specs/001-dinner-decider-enables/contracts/openapi.yaml
   npm run test:contract  # Ensure contract tests pass
   ```

### Debugging

#### Backend Debugging

```bash
cd backend

# Enable debug logging
DEBUG=* npm run dev

# Or debug specific namespaces
DEBUG=socket.io:* npm run dev
DEBUG=redis:* npm run dev
```

#### Redis Debugging

```bash
# Connect to Redis CLI
docker exec -it dinner-redis redis-cli

# Inspect session keys
KEYS session:*

# Get session metadata
HGETALL session:ABC123

# Check TTL
TTL session:ABC123

# Get participants
SMEMBERS session:ABC123:participants

# Get selections
SMEMBERS session:ABC123:socket-uuid-1:selections

# Calculate overlap manually
SINTER session:ABC123:socket-uuid-1:selections session:ABC123:socket-uuid-2:selections
```

#### Frontend Debugging

```bash
cd frontend

# Vite dev server has HMR and error overlay
npm run dev

# Build and preview production bundle
npm run build
npm run preview

# Analyze bundle size
npm run build -- --mode analyze
```

---

## Common Issues

### Issue: Redis Connection Failed

**Symptom**: Backend logs show `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution**:
```bash
# Check if Redis is running
docker ps | grep dinner-redis

# If not running, start it
docker start dinner-redis

# Or create new container
docker run -d --name dinner-redis -p 6379:6379 redis:7-alpine
```

### Issue: Port Already in Use

**Symptom**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in frontend/.env
PORT=3001 npm run dev
```

### Issue: WebSocket Connection Failed

**Symptom**: Frontend shows "Disconnected" status

**Solution**:
1. Verify backend is running on port 3001
2. Check browser console for CORS errors
3. Ensure `backend/src/server.ts` has CORS enabled:
   ```typescript
   const io = new Server(server, {
     cors: { origin: 'http://localhost:3000' }
   });
   ```

### Issue: Session Not Found

**Symptom**: "Session ABC123 not found" error

**Possible Causes**:
1. Session expired (30-minute TTL)
2. Redis was restarted (in-memory data lost)
3. Typo in session code

**Solution**:
- Create a new session
- For persistent testing, increase TTL temporarily in `backend/src/constants.ts`

---

## Performance Validation

### Latency Targets

Test with multiple concurrent sessions:

```bash
# Run load test (requires k6 or similar)
cd backend
npm run test:load

# Expected results:
# - Session creation: <500ms p95
# - Selection submission: <200ms p95
# - WebSocket broadcast: <200ms p95
```

### Bundle Size Validation

```bash
cd frontend

# Build production bundle
npm run build

# Check bundle sizes
ls -lh dist/assets/

# Expected:
# - index.[hash].js: ~30KB gzipped (app code)
# - vendor.[hash].js: ~40KB gzipped (React + deps)
# - Total initial load: <100KB gzipped
```

### Memory Usage

```bash
# Check Redis memory usage
docker exec dinner-redis redis-cli INFO memory

# Expected for 50 concurrent sessions:
# used_memory_human: <1MB
```

---

## Next Steps

After completing the quickstart:

1. **Read the Spec**: [spec.md](./spec.md) for detailed requirements
2. **Review Contracts**: [contracts/](./contracts/) for API/WebSocket schemas
3. **Understand Data Model**: [data-model.md](./data-model.md) for Redis structure
4. **Implement Tasks**: [tasks.md](./tasks.md) for ordered development tasks (generated by `/tasks` command)

---

## Additional Resources

- **Feature Specification**: [spec.md](./spec.md)
- **Implementation Plan**: [plan.md](./plan.md)
- **Research Findings**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **API Contracts**: [contracts/](./contracts/)

---

## Clean Up

When done testing:

```bash
# Stop development servers (Ctrl+C in both terminals)

# Stop and remove Redis container
docker stop dinner-redis
docker rm dinner-redis

# Or keep Redis running for next session
docker stop dinner-redis  # Stop only, preserves data until restart
```

---

**Quickstart Complete!** You're now ready to build the Dinner Decider application following the TDD workflow outlined in [tasks.md](./tasks.md).