// Express + Socket.IO server initialization
// Based on: specs/001-dinner-decider-enables/plan.md

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { redis, pingRedis } from './redis/client.js';
import { validateDinnerOptions } from './constants/dinnerOptions.js';
import sessionsRouter from './api/sessions.js';
import optionsRouter from './api/options.js';

// Import shared types
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dinner-app/shared/types';

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Initialize Express app
const app = express();

// Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// REST API routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/options', optionsRouter);

// Health check endpoint
app.get('/health', async (req, res) => {
  const redisHealthy = await pingRedis();
  res.status(redisHealthy ? 200 : 503).json({
    status: redisHealthy ? 'healthy' : 'unhealthy',
    redis: redisHealthy,
  });
});

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with typed events
const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

// Import WebSocket handlers
import { handleSessionJoin } from './websocket/joinHandler.js';
import { handleSelectionSubmit } from './websocket/submitHandler.js';
import { handleSessionRestart } from './websocket/restartHandler.js';
import { handleDisconnect } from './websocket/disconnectHandler.js';

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  if (socket.recovered) {
    console.log(`Socket ${socket.id} recovered from disconnect`);
  }

  // T041: session:join event handler
  socket.on('session:join', (payload, callback) => {
    handleSessionJoin(socket, payload, callback);
  });

  // T042: selection:submit event handler
  socket.on('selection:submit', (payload, callback) => {
    handleSelectionSubmit(socket, io, payload, callback);
  });

  // T043: session:restart event handler
  socket.on('session:restart', (payload, callback) => {
    handleSessionRestart(socket, io, payload, callback);
  });

  // T045: disconnect handler
  socket.on('disconnect', (reason) => {
    handleDisconnect(socket, io, reason);
  });
});

// Startup validation
async function validateStartup(): Promise<void> {
  // Validate Redis connection
  const redisHealthy = await pingRedis();
  if (!redisHealthy) {
    throw new Error('Redis connection failed');
  }
  console.log('✓ Redis connection validated');

  // Validate DINNER_OPTIONS for duplicates
  validateDinnerOptions();
  console.log('✓ Dinner options validated (no duplicates)');
}

// Start server
async function startServer() {
  try {
    await validateStartup();

    httpServer.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`🔗 Frontend URL: ${FRONTEND_URL}\n`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
  await redis.quit();
  process.exit(0);
});

// Only start server if run directly (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { app, io, httpServer };