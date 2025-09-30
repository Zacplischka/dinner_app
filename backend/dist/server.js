import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { redis, pingRedis } from './redis/client.js';
import { validateDinnerOptions } from './constants/dinnerOptions.js';
import sessionsRouter from './api/sessions.js';
import optionsRouter from './api/options.js';
const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());
app.use('/api/sessions', sessionsRouter);
app.use('/api/options', optionsRouter);
app.get('/health', (_req, res) => {
    void (async () => {
        const redisHealthy = await pingRedis();
        res.status(redisHealthy ? 200 : 503).json({
            status: redisHealthy ? 'healthy' : 'unhealthy',
            redis: redisHealthy,
        });
    })();
});
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST'],
    },
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
    },
});
import { handleSessionJoin } from './websocket/joinHandler.js';
import { handleSelectionSubmit } from './websocket/submitHandler.js';
import { handleSessionRestart } from './websocket/restartHandler.js';
import { handleDisconnect } from './websocket/disconnectHandler.js';
import { initializeSessionExpiryNotifier, disconnectSessionExpiryNotifier } from './redis/sessionExpiryNotifier.js';
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    if (socket.recovered) {
        console.log(`Socket ${socket.id} recovered from disconnect`);
    }
    socket.on('session:join', (payload, callback) => {
        void handleSessionJoin(socket, payload, callback);
    });
    socket.on('selection:submit', (payload, callback) => {
        void handleSelectionSubmit(socket, io, payload, callback);
    });
    socket.on('session:restart', (payload, callback) => {
        void handleSessionRestart(socket, io, payload, callback);
    });
    socket.on('disconnect', (reason) => {
        void handleDisconnect(socket, io, reason);
    });
});
async function validateStartup() {
    const redisHealthy = await pingRedis();
    if (!redisHealthy) {
        throw new Error('Redis connection failed');
    }
    console.log('✓ Redis connection validated');
    validateDinnerOptions();
    console.log('✓ Dinner options validated (no duplicates)');
}
async function startServer() {
    try {
        await validateStartup();
        await initializeSessionExpiryNotifier(io);
        httpServer.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 WebSocket server ready`);
            console.log(`🔗 Frontend URL: ${FRONTEND_URL}\n`);
        });
    }
    catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}
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
if (import.meta.url === `file://${process.argv[1]}`) {
    void startServer();
}
export { app, io, httpServer };
//# sourceMappingURL=server.js.map