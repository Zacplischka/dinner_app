#!/usr/bin/env bash

# Kill any existing processes on the ports
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start Redis if not running
if ! docker ps | grep -q redis; then
    docker run -d -p 6379:6379 --name dinner-redis redis:7-alpine
fi

# Start backend
cd backend && npm run dev &

# Start frontend
cd frontend && npm run dev &

echo "✅ Backend: http://localhost:3001"
echo "✅ Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop"

wait