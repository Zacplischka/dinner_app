// Session model - Redis operations for session management
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';
import type { Session } from '@dinner-app/shared/types';

/**
 * Create a new session in Redis
 */
export async function createSession(
  sessionCode: string,
  hostId: string
): Promise<Session> {
  const now = Math.floor(Date.now() / 1000);

  const session: Session = {
    sessionCode,
    hostId,
    state: 'waiting',
    participantCount: 1,
    createdAt: now,
    lastActivityAt: now,
  };

  // Store session metadata as Hash
  await redis.hset(`session:${sessionCode}`, {
    createdAt: session.createdAt,
    hostId: session.hostId,
    state: session.state,
    participantCount: session.participantCount,
    lastActivityAt: session.lastActivityAt,
  });

  return session;
}

/**
 * Get session by code
 */
export async function getSession(sessionCode: string): Promise<Session | null> {
  const data = await redis.hgetall(`session:${sessionCode}`);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    sessionCode,
    hostId: data.hostId,
    state: data.state as 'waiting' | 'selecting' | 'complete' | 'expired',
    participantCount: parseInt(data.participantCount, 10),
    createdAt: parseInt(data.createdAt, 10),
    lastActivityAt: parseInt(data.lastActivityAt, 10),
  };
}

/**
 * Update session state
 */
export async function updateSessionState(
  sessionCode: string,
  state: 'waiting' | 'selecting' | 'complete' | 'expired'
): Promise<void> {
  await redis.hset(`session:${sessionCode}`, 'state', state);
}

/**
 * Update last activity timestamp
 */
export async function updateLastActivity(sessionCode: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await redis.hset(`session:${sessionCode}`, 'lastActivityAt', now);
}

/**
 * Increment participant count
 */
export async function incrementParticipantCount(sessionCode: string): Promise<number> {
  return await redis.hincrby(`session:${sessionCode}`, 'participantCount', 1);
}

/**
 * Delete session and all related keys
 */
export async function deleteSession(sessionCode: string): Promise<void> {
  // Get participant IDs to delete their keys
  const participantIds = await redis.smembers(`session:${sessionCode}:participants`);

  const pipeline = redis.pipeline();

  // Delete session hash
  pipeline.del(`session:${sessionCode}`);

  // Delete participants set
  pipeline.del(`session:${sessionCode}:participants`);

  // Delete results set
  pipeline.del(`session:${sessionCode}:results`);

  // Delete each participant's metadata and selections
  participantIds.forEach((participantId) => {
    pipeline.del(`participant:${participantId}`);
    pipeline.del(`session:${sessionCode}:${participantId}:selections`);
  });

  await pipeline.exec();
}