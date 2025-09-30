import Redis from 'ioredis';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
let subscriber = null;
export async function initializeSessionExpiryNotifier(io) {
    subscriber = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
    });
    try {
        await subscriber.config('SET', 'notify-keyspace-events', 'Ex');
        console.log('✓ Redis keyspace notifications enabled');
    }
    catch (error) {
        console.error('Failed to enable Redis keyspace notifications:', error);
    }
    await subscriber.subscribe('__keyevent@0__:expired');
    subscriber.on('message', (channel, key) => {
        if (channel === '__keyevent@0__:expired' && key.startsWith('session:')) {
            handleSessionExpired(io, key);
        }
    });
    subscriber.on('error', (error) => {
        console.error('Redis subscriber error:', error.message);
    });
    console.log('✓ Session expiry notifier initialized');
}
function handleSessionExpired(io, key) {
    const sessionCode = key.replace('session:', '');
    if (!sessionCode || sessionCode.length !== 6) {
        console.warn(`Invalid session code from expired key: ${key}`);
        return;
    }
    console.log(`Session expired: ${sessionCode}`);
    io.to(sessionCode).emit('session:expired', {
        sessionCode,
        reason: 'inactivity',
        message: 'Session has expired due to inactivity',
    });
}
export async function disconnectSessionExpiryNotifier() {
    if (subscriber) {
        await subscriber.quit();
        subscriber = null;
        console.log('Session expiry notifier disconnected');
    }
}
//# sourceMappingURL=sessionExpiryNotifier.js.map