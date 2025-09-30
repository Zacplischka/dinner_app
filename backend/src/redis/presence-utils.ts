// Redis utility functions for tracking participant online presence
// Based on: Issue #6 - Realtime presence indicators

import { redis } from './client.js';

/**
 * Add a participant to the online set for a session
 */
export async function markParticipantOnline(
  sessionCode: string,
  participantId: string
): Promise<void> {
  await redis.sadd(`session:${sessionCode}:online`, participantId);
}

/**
 * Remove a participant from the online set for a session
 */
export async function markParticipantOffline(
  sessionCode: string,
  participantId: string
): Promise<void> {
  await redis.srem(`session:${sessionCode}:online`, participantId);
}

/**
 * Check if a participant is currently online
 */
export async function isParticipantOnline(
  sessionCode: string,
  participantId: string
): Promise<boolean> {
  const result = await redis.sismember(`session:${sessionCode}:online`, participantId);
  return result === 1;
}

/**
 * Get all online participants for a session
 */
export async function getOnlineParticipants(sessionCode: string): Promise<string[]> {
  return redis.smembers(`session:${sessionCode}:online`);
}

/**
 * Check if multiple participants are online (batch operation)
 * Returns a map of participantId -> isOnline
 */
export async function getParticipantsOnlineStatus(
  sessionCode: string,
  participantIds: string[]
): Promise<Record<string, boolean>> {
  if (participantIds.length === 0) {
    return {};
  }

  const pipeline = redis.pipeline();
  for (const participantId of participantIds) {
    pipeline.sismember(`session:${sessionCode}:online`, participantId);
  }

  const results = await pipeline.exec();
  const status: Record<string, boolean> = {};

  participantIds.forEach((participantId, index) => {
    const result = results?.[index];
    status[participantId] = result?.[1] === 1;
  });

  return status;
}

/**
 * Clear all online participants for a session (used on session restart)
 */
export async function clearOnlineParticipants(sessionCode: string): Promise<void> {
  await redis.del(`session:${sessionCode}:online`);
}