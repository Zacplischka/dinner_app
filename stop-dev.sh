#!/usr/bin/env bash

# Dinner Decider - Stop Local Development Script
# This script stops all running development services

set -e  # Exit on error

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Dinner Decider - Local Development${NC}\n"

# Stop backend
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping backend (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID
        echo -e "${GREEN}✓ Backend stopped${NC}"
    else
        echo -e "${YELLOW}Backend already stopped${NC}"
    fi
    rm logs/backend.pid
else
    echo -e "${YELLOW}No backend PID file found${NC}"
fi

# Stop frontend
if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${YELLOW}Stopping frontend (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID
        echo -e "${GREEN}✓ Frontend stopped${NC}"
    else
        echo -e "${YELLOW}Frontend already stopped${NC}"
    fi
    rm logs/frontend.pid
else
    echo -e "${YELLOW}No frontend PID file found${NC}"
fi

# Ask if user wants to stop Redis
echo -e "\n${YELLOW}Stop Redis container? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    if docker ps | grep -q dinner-redis; then
        echo -e "${YELLOW}Stopping Redis container...${NC}"
        docker stop dinner-redis > /dev/null 2>&1
        docker rm dinner-redis > /dev/null 2>&1
        echo -e "${GREEN}✓ Redis stopped and removed${NC}"
    else
        echo -e "${YELLOW}Redis container not running${NC}"
    fi
else
    echo -e "${YELLOW}Redis container left running${NC}"
fi

echo -e "\n${GREEN}✓ Development environment stopped${NC}\n"