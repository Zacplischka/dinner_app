// Express + Socket.IO server initialization
// Based on: specs/001-dinner-decider-enables/plan.md

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';
import { redis, pingRedis } from './redis/client.js';
import { createSessionsRouter } from './api/sessions.js';
import { createOptionsRouter } from './api/options.js';
import { createFriendsRouter } from './api/friends.js';
import { createComparisonRouter } from './api/comparison.js';
import { createSessionStore } from './store/sessionStore.js';
import { createSessionService } from './services/SessionService.js';
import { createFriendsService } from './services/FriendsService.js';
import { createComparisonService } from './services/ComparisonService.js';
import { createApifyClient } from './services/apifyClient.js';
import * as friendsStore from './store/friendsStore.js';
import * as comparisonSnapshotStore from './store/comparisonSnapshotStore.js';
import * as RestaurantSearchService from './services/RestaurantSearchService.js';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import {
  getSocketAuthToken,
  getSocketUser,
  setSocketUser,
  type SocketData,
} from './websocket/socketAuth.js';

// Import shared types
import type { ClientToServerEvents, ServerToClientEvents } from '@dinder/shared/types';

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Allowed origins for CORS (supports multiple origins for dev + production)
const allowedOrigins = [
  'http://localhost:3000',
  'https://www.dinder.it.com',
  'https://dinder.it.com',
  FRONTEND_URL,
].filter(Boolean);

// Composition root: the only place production stores and services are
// constructed. Everything else receives them by injection.
const sessionStore = createSessionStore(redis);
const sessionService = createSessionService({
  store: sessionStore,
  searchNearbyRestaurants: (...args) => RestaurantSearchService.searchNearbyRestaurants(...args),
});
const friendsService = createFriendsService({ store: friendsStore });
const apifyClient = createApifyClient({ token: config.apify.token || '' });
const comparisonService = createComparisonService({
  runActor: (...args) => apifyClient.runActor(...args),
  uberEatsActorId: config.apify.uberEatsActorId,
  doorDashActorId: config.apify.doorDashActorId,
  fetchPlaceDetails: (...args) => RestaurantSearchService.fetchPlaceDetails(...args),
  snapshotStore: comparisonSnapshotStore,
  freshnessMs: 20 * 60_000,
  failureFreshnessMs: 2 * 60_000,
  settleCapMs: 300_000,
});

// Initialize Express app
const app = express();
app.set('trust proxy', 1); // Railway terminates requests at one edge proxy.

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
// Request logging: request IDs, per-request child loggers (req.log).
// Must precede express.json() so body-parse errors still get an X-Request-Id.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) || randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customProps: (req) => {
      const user = (req as AuthenticatedRequest).user;
      return user ? { userId: user.id } : {};
    },
  })
);

app.use(express.json());

// REST API routes
app.use('/api/sessions', createSessionsRouter(sessionService));
app.use('/api/options', createOptionsRouter(sessionStore));
app.use(
  '/api/comparison',
  createComparisonRouter({
    searchNearbyVenues: (...args) => RestaurantSearchService.searchNearbyVenues(...args),
    reverseGeocodeSuburb: (...args) => RestaurantSearchService.reverseGeocodeSuburb(...args),
    fetchPlacePhoto: (...args) => RestaurantSearchService.fetchPlacePhoto(...args),
    photoCache: redis,
    comparisonService,
  })
);
app.use('/api', createFriendsRouter(friendsService)); // Friends, users, and invites routes

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

// Global error safety net (must come after all routes)
app.use(errorHandler);

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with typed events
const io = new SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },
});

// Import WebSocket handlers (they run over the store/service built above)
import { handleSessionJoin } from './websocket/joinHandler.js';
import { handleSelectionSubmit } from './websocket/submitHandler.js';
import { handleSessionRestart } from './websocket/restartHandler.js';
import { handleSessionLeave } from './websocket/leaveHandler.js';
import { handleDisconnect } from './websocket/disconnectHandler.js';

// Import auth middleware
import { verifyToken, type AuthenticatedRequest } from './middleware/auth.js';

// Import session expiry notifier
import {
  initializeSessionExpiryNotifier,
  disconnectSessionExpiryNotifier,
} from './redis/sessionExpiryNotifier.js';

// Socket.IO authentication middleware (optional - doesn't reject unauthenticated)
io.use((socket, next) => {
  const token = getSocketAuthToken(socket.handshake.auth);

  if (!token) {
    // Always allow connection (auth is optional for now)
    next();
    return;
  }

  void (async () => {
    const user = await verifyToken(token);
    if (user) {
      // Attach user info to socket for later use
      setSocketUser(socket, user);
      logger.info({ socketId: socket.id, userId: user.id }, 'Socket authenticated');
    }

    // Always allow connection (auth is optional for now)
    next();
  })();
});

// WebSocket connection handling
io.on('connection', (socket) => {
  const user = getSocketUser(socket);
  const socketLog = logger.child({ socketId: socket.id });
  socketLog.info({ userId: user?.id }, 'Socket connected');

  if (socket.recovered) {
    socketLog.info('Socket recovered from disconnect');
  }

  // T041: session:join event handler
  socket.on('session:join', (payload, callback) => {
    void handleSessionJoin(socket, payload, callback, sessionService);
  });

  // T042: selection:submit event handler
  socket.on('selection:submit', (payload, callback) => {
    void handleSelectionSubmit(socket, io, payload, callback, sessionService);
  });

  // T043: session:restart event handler
  socket.on('session:restart', (payload, callback) => {
    void handleSessionRestart(socket, io, payload, callback, sessionService);
  });

  // session:leave event handler - intentional departure
  socket.on('session:leave', (payload, callback) => {
    void handleSessionLeave(socket, io, payload, callback, sessionService);
  });

  // T045: disconnect handler
  socket.on('disconnect', (reason) => {
    void handleDisconnect(socket, io, reason, sessionStore);
  });
});

// Startup validation
async function validateStartup(): Promise<void> {
  // Validate Redis connection
  const redisHealthy = await pingRedis();
  if (!redisHealthy) {
    throw new Error('Redis connection failed');
  }
  logger.info('Redis connection validated');
}

// Start server
async function startServer() {
  try {
    await validateStartup();

    // Initialize session expiry notifier
    await initializeSessionExpiryNotifier(io);

    httpServer.listen(PORT, () => {
      logger.info({ port: PORT, frontendUrl: FRONTEND_URL }, 'Server running, WebSocket ready');
    });
  } catch (error) {
    logger.error({ err: error }, 'Server startup failed');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  void (async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
    await disconnectSessionExpiryNotifier();
    await redis.quit();
    process.exit(0);
  })();
});

process.on('SIGINT', () => {
  void (async () => {
    logger.info('SIGINT received, shutting down gracefully');
    httpServer.close(() => {
      logger.info('HTTP server closed');
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

// Instances exported for contract/integration tests, which must exercise
// (and spy on) the same objects the routes and handlers close over.
export { app, io, httpServer, sessionStore, sessionService };
