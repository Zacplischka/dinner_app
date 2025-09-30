#!/usr/bin/env bash

# Dinner Decider - Local Development Startup Script
# This script starts Redis, backend, and frontend for local development

set -e  # Exit on error

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🍽️  Starting Dinner Decider - Local Development${NC}\n"

# Check if Redis is running
echo -e "${YELLOW}Checking Redis...${NC}"
if ! docker ps | grep -q redis; then
    echo -e "${YELLOW}Starting Redis container...${NC}"
    docker run -d -p 6379:6379 --name dinner-redis redis:7-alpine
    echo -e "${GREEN}✓ Redis started${NC}"
else
    echo -e "${GREEN}✓ Redis already running${NC}"
fi

# Wait for Redis to be ready
echo -e "${YELLOW}Waiting for Redis to be ready...${NC}"
sleep 2

# Test Redis connection
if redis-cli -h localhost -p 6379 PING > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis is ready${NC}\n"
else
    echo -e "${RED}✗ Redis connection failed${NC}"
    echo -e "${YELLOW}Tip: Make sure Docker is running${NC}"
    exit 1
fi

# Check if backend/.env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Creating backend/.env file...${NC}"
    cat > backend/.env <<EOF
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
EOF
    echo -e "${GREEN}✓ Created backend/.env${NC}\n"
fi

# Check if frontend/.env exists
if [ ! -f "frontend/.env" ]; then
    echo -e "${YELLOW}Creating frontend/.env file...${NC}"
    cat > frontend/.env <<EOF
VITE_API_BASE_URL=http://localhost:3001/api
VITE_BACKEND_URL=http://localhost:3001
EOF
    echo -e "${GREEN}✓ Created frontend/.env${NC}\n"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}\n"
fi

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

# Start backend and frontend in background
echo -e "${GREEN}Starting backend on http://localhost:3001${NC}"
(cd "$SCRIPT_DIR/backend" && npm run dev > "$SCRIPT_DIR/logs/backend.log" 2>&1) &
BACKEND_PID=$!

echo -e "${GREEN}Starting frontend on http://localhost:3000${NC}\n"
(cd "$SCRIPT_DIR/frontend" && npm run dev > "$SCRIPT_DIR/logs/frontend.log" 2>&1) &
FRONTEND_PID=$!

# Save PIDs to file for easy cleanup
echo $BACKEND_PID > "$SCRIPT_DIR/logs/backend.pid"
echo $FRONTEND_PID > "$SCRIPT_DIR/logs/frontend.pid"

# Wait for servers to start
echo -e "${YELLOW}Waiting for servers to start...${NC}"
sleep 5

# Check if servers are running
if kill -0 $BACKEND_PID 2>/dev/null && kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "\n${GREEN}✓ All services started successfully!${NC}\n"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 Dinner Decider is ready!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    echo -e "   Frontend:  ${GREEN}http://localhost:3000${NC}"
    echo -e "   Backend:   ${GREEN}http://localhost:3001${NC}"
    echo -e "   Health:    ${GREEN}http://localhost:3001/health${NC}"
    echo -e "   Redis:     ${GREEN}localhost:6379${NC}\n"
    echo -e "${YELLOW}Logs:${NC}"
    echo -e "   Backend:   ${YELLOW}logs/backend.log${NC}"
    echo -e "   Frontend:  ${YELLOW}logs/frontend.log${NC}\n"
    echo -e "${YELLOW}To stop all services, run:${NC} ./stop-dev.sh\n"
    echo -e "${YELLOW}To view logs in real-time:${NC}"
    echo -e "   Backend:   ${YELLOW}tail -f logs/backend.log${NC}"
    echo -e "   Frontend:  ${YELLOW}tail -f logs/frontend.log${NC}\n"
else
    echo -e "${RED}✗ Failed to start services${NC}"
    echo -e "${YELLOW}Check logs for details:${NC}"
    echo -e "   Backend:  logs/backend.log"
    echo -e "   Frontend: logs/frontend.log"
    exit 1
fi