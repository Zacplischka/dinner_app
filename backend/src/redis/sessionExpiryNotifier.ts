// Redis keyspace notifications listener for session expiration
// Emits session:expired events via Socket.IO when sessions expire

import Redis from 'ioredis';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinner-app/shared/types';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let subscriber: Redis | null = null;

/**
 * Initialize session expiry notifier
 * Listens for Redis keyspace notifications on expired session keys
 */
export async function initializeSessionExpiryNotifier(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  // Create dedicated Redis subscriber connection (required for pub/sub)
  subscriber = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
  });

  // Enable keyspace notifications for expired events
  // 'Ex' = keyspace events for expired keys
  try {
    await subscriber.config('SET', 'notify-keyspace-events', 'Ex');
    console.log('✓ Redis keyspace notifications enabled');
  } catch (error) {
    console.error('Failed to enable Redis keyspace notifications:', error);
    // Some Redis instances may have CONFIG disabled; log but continue
  }

  // Subscribe to expired events on database 0
  await subscriber.subscribe('__keyevent@0__:expired');

  // Handle expired key events
  subscriber.on('message', (channel: string, key: string) => {
    if (channel === '__keyevent@0__:expired' && key.startsWith('session:')) {
      handleSessionExpired(io, key);
    }
  });

  subscriber.on('error', (error) => {
    console.error('Redis subscriber error:', error.message);
  });

  console.log('✓ Session expiry notifier initialized');
}

/**
 * Handle session expiration
 * Extract session code and emit to all participants in that room
 */
function handleSessionExpired(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  key: string
): void {
  // Extract session code from key format: "session:ABC123"
  const sessionCode = key.replace('session:', '');

  if (!sessionCode || sessionCode.length !== 6) {
    console.warn(`Invalid session code from expired key: ${key}`);
    return;
  }

  console.log(`Session expired: ${sessionCode}`);

  // Emit session:expired to all participants in the session room
  io.to(sessionCode).emit('session:expired', {
    sessionCode,
    reason: 'inactivity',
    message: 'Session has expired due to inactivity',
  });
}

/**
 * Cleanup and disconnect subscriber
 */
export async function disconnectSessionExpiryNotifier(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    console.log('Session expiry notifier disconnected');
  }
}