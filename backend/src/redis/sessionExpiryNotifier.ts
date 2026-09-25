// Emits session:expired to a Session's room when Redis expires its key.

import { logger } from '../logger.js';
import type { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import { sessionCodeFromExpiredKey } from '../store/sessionStore.js';
import { KEY_PREFIX, redis } from './client.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinder/shared/types';

let subscriber: Redis | null = null;

export async function initializeSessionExpiryNotifier(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Promise<void> {
  // A subscribed connection can do nothing else, so it needs its own.
  subscriber = redis.duplicate();

  // 'Ex' = keyevent notifications for expired keys.
  try {
    await subscriber.config('SET', 'notify-keyspace-events', 'Ex');
    logger.info('✓ Redis keyspace notifications enabled');
  } catch (error) {
    logger.error({ err: error }, 'Failed to enable Redis keyspace notifications');
    // Some Redis instances may have CONFIG disabled; log but continue
  }

  await subscriber.subscribe('__keyevent@0__:expired');

  subscriber.on('message', (channel: string, key: string) => {
    if (channel === '__keyevent@0__:expired') {
      handleSessionExpired(io, key);
    }
  });

  subscriber.on('error', (error) => {
    logger.error({ err: error.message }, 'Redis subscriber error');
  });

  logger.info('✓ Session expiry notifier initialized');
}

function handleSessionExpired(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  key: string
): void {
  // Keyspace notifications carry the raw key name — the client's keyPrefix
  // (test namespacing) is not stripped by ioredis, so strip it here.
  if (KEY_PREFIX && key.startsWith(KEY_PREFIX)) {
    key = key.slice(KEY_PREFIX.length);
  }
  // The store owns the key format; sub-keys (e.g. ...:results) return null
  const sessionCode = sessionCodeFromExpiredKey(key);

  if (!sessionCode) {
    return;
  }

  logger.info({ sessionCode }, 'Session expired');

  io.to(sessionCode).emit('session:expired', {
    sessionCode,
    reason: 'inactivity',
    message: 'Session has expired due to inactivity',
  });
}

export async function disconnectSessionExpiryNotifier(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    logger.info('Session expiry notifier disconnected');
  }
}
