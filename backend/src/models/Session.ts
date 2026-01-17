// Session model - Redis operations for session management
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';
import type { Session } from '@dinder/shared/types';

/**
 * Create a new session in Redis
 */
export async function createSession(
  sessionCode: string,
  hostId: string,
  hostName?: string,
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  },
  searchRadiusMiles?: number
): Promise<Session> {
  const now = Math.floor(Date.now() / 1000);

  const session: Session = {
    sessionCode,
    hostId,
    state: 'waiting',
    participantCount: 1,
    createdAt: now,
    lastActivityAt: now,
    hostName,
    location,
    searchRadiusMiles,
  };

  // Store session metadata as Hash
  const sessionData: Record<string, string | number> = {
    createdAt: session.createdAt,
    hostId: session.hostId,
    state: session.state,
    participantCount: session.participantCount,
    lastActivityAt: session.lastActivityAt,
  };

  if (hostName) {
    sessionData.hostName = hostName;
  }

  if (location) {
    sessionData.locationLat = location.latitude;
    sessionData.locationLng = location.longitude;
    if (location.address) {
      sessionData.locationAddress = location.address;
    }
  }

  if (searchRadiusMiles !== undefined) {
    sessionData.searchRadiusMiles = searchRadiusMiles;
  }

  await redis.hset(`session:${sessionCode}`, sessionData);

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

  const session: Session = {
    sessionCode,
    hostId: data.hostId,
    state: data.state as 'waiting' | 'selecting' | 'complete' | 'expired',
    participantCount: parseInt(data.participantCount, 10),
    createdAt: parseInt(data.createdAt, 10),
    lastActivityAt: parseInt(data.lastActivityAt, 10),
    hostName: data.hostName,
  };

  // Add location if present
  if (data.locationLat && data.locationLng) {
    session.location = {
      latitude: parseFloat(data.locationLat),
      longitude: parseFloat(data.locationLng),
      address: data.locationAddress,
    };
  }

  // Add search radius if present
  if (data.searchRadiusMiles) {
    session.searchRadiusMiles = parseFloat(data.searchRadiusMiles);
  }

  return session;
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
 * Set participant count to a specific value
 */
export async function setParticipantCount(sessionCode: string, count: number): Promise<void> {
  await redis.hset(`session:${sessionCode}`, 'participantCount', count);
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