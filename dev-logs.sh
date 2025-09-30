#!/bin/bash

# Dinner Decider - View Development Logs
# This script displays logs from backend and frontend in real-time

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}📋 Dinner Decider - Development Logs${NC}\n"

# Check if logs directory exists
if [ ! -d "logs" ]; then
    echo -e "${YELLOW}No logs directory found. Start the app first with ./start-dev.sh${NC}"
    exit 1
fi

# Check which logs to display
case "$1" in
    backend)
        echo -e "${GREEN}Showing backend logs (Ctrl+C to exit)${NC}\n"
        tail -f logs/backend.log
        ;;
    frontend)
        echo -e "${GREEN}Showing frontend logs (Ctrl+C to exit)${NC}\n"
        tail -f logs/frontend.log
        ;;
    *)
        echo -e "${YELLOW}Usage: ./dev-logs.sh [backend|frontend]${NC}"
        echo -e "${YELLOW}Or view both in separate terminals:${NC}\n"
        echo -e "  Terminal 1: ${GREEN}./dev-logs.sh backend${NC}"
        echo -e "  Terminal 2: ${GREEN}./dev-logs.sh frontend${NC}\n"
        echo -e "${YELLOW}Available log files:${NC}"
        if [ -f "logs/backend.log" ]; then
            BACKEND_SIZE=$(wc -l < logs/backend.log)
            echo -e "  Backend:  ${GREEN}logs/backend.log${NC} ($BACKEND_SIZE lines)"
        fi
        if [ -f "logs/frontend.log" ]; then
            FRONTEND_SIZE=$(wc -l < logs/frontend.log)
            echo -e "  Frontend: ${GREEN}logs/frontend.log${NC} ($FRONTEND_SIZE lines)"
        fi
        echo ""
        exit 1
        ;;
esac