// Express + Socket.IO server initialization
// Based on: specs/001-dinner-decider-enables/plan.md

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { redis, pingRedis } from './redis/client.js';
import sessionsRouter from './api/sessions.js';
import optionsRouter from './api/options.js';
import friendsRouter from './api/friends.js';

// Import shared types
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@dinder/shared/types';

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
app.use('/api', friendsRouter); // Friends, users, and invites routes

// Health check endpoint
app.get('/health', (_req, res) => {
  void (async () => {
    const redisHealthy = await pingRedis();
    res.status(redisHealthy ? 200 : 503).json({
      status: redisHealthy ? 'healthy' : 'unhealthy',
      redis: redisHealthy,
    });
  })();
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
import { handleSessionLeave } from './websocket/leaveHandler.js';
import { handleDisconnect } from './websocket/disconnectHandler.js';

// Import auth middleware
import { verifyToken } from './middleware/auth.js';

// Import session expiry notifier
import { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } from './redis/sessionExpiryNotifier.js';

// Socket.IO authentication middleware (optional - doesn't reject unauthenticated)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (token) {
    const user = verifyToken(token);
    if (user) {
      // Attach user info to socket for later use
      (socket as any).user = user;
      console.log(`Socket ${socket.id} authenticated as user ${user.id}`);
    }
  }

  // Always allow connection (auth is optional for now)
  next();
});

// WebSocket connection handling
io.on('connection', (socket) => {
  const user = (socket as any).user;
  console.log(`Socket connected: ${socket.id}${user ? ` (user: ${user.email || user.id})` : ' (anonymous)'}`);

  if (socket.recovered) {
    console.log(`Socket ${socket.id} recovered from disconnect`);
  }

  // T041: session:join event handler
  socket.on('session:join', (payload, callback) => {
    void handleSessionJoin(socket, payload, callback);
  });

  // T042: selection:submit event handler
  socket.on('selection:submit', (payload, callback) => {
    void handleSelectionSubmit(socket, io, payload, callback);
  });

  // T043: session:restart event handler
  socket.on('session:restart', (payload, callback) => {
    void handleSessionRestart(socket, io, payload, callback);
  });

  // session:leave event handler - intentional departure
  socket.on('session:leave', (payload, callback) => {
    void handleSessionLeave(socket, io, payload, callback);
  });

  // T045: disconnect handler
  socket.on('disconnect', (reason) => {
    void handleDisconnect(socket, io, reason);
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
}

// Start server
async function startServer() {
  try {
    await validateStartup();

    // Initialize session expiry notifier
    await initializeSessionExpiryNotifier(io);

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
process.on('SIGTERM', () => {
  void (async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
    await disconnectSessionExpiryNotifier();
    await redis.quit();
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
    await disconnectSessionExpiryNotifier();
    await redis.quit();
    process.exit(0);
  })();
});

// Only start server if run directly (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}

export { app, io, httpServer };
