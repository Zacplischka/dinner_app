import Redis from 'ioredis';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
export const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis reconnecting in ${delay}ms (attempt ${times})...`);
        return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
});
redis.on('connect', () => {
    console.log('✓ Redis connected');
});
redis.on('ready', () => {
    console.log('✓ Redis ready');
});
redis.on('error', (error) => {
    console.error('Redis error:', error.message);
});
redis.on('close', () => {
    console.log('Redis connection closed');
});
redis.on('reconnecting', () => {
    console.log('Redis reconnecting...');
});
export async function pingRedis() {
    try {
        const result = await redis.ping();
        return result === 'PONG';
    }
    catch (error) {
        console.error('Redis ping failed:', error);
        return false;
    }
}
export async function disconnectRedis() {
    try {
        await redis.quit();
        console.log('Redis disconnected gracefully');
    }
    catch (error) {
        console.error('Error disconnecting Redis:', error);
        redis.disconnect();
    }
}
//# sourceMappingURL=client.js.map