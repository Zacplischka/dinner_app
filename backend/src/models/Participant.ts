// Participant model - Redis operations for participant management
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';
import type { Participant } from '@dinder/shared/types';

/**
 * Add a participant to a session
 */
export async function addParticipant(
  sessionCode: string,
  participantId: string,
  displayName: string,
  isHost: boolean = false
): Promise<Participant> {
  const now = Math.floor(Date.now() / 1000);

  const participant: Participant = {
    participantId,
    displayName,
    sessionCode,
    joinedAt: now,
    hasSubmitted: false,
    isHost,
  };

  // Add to session participants Set
  await redis.sadd(`session:${sessionCode}:participants`, participantId);

  // Store participant metadata Hash
  await redis.hset(`participant:${participantId}`, {
    displayName,
    sessionCode,
    joinedAt: now,
    isHost: isHost ? '1' : '0',
    hasSubmitted: '0',
  });

  return participant;
}

/**
 * Get participant by ID
 */
export async function getParticipant(participantId: string): Promise<Participant | null> {
  const data = await redis.hgetall(`participant:${participantId}`);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    participantId,
    displayName: data.displayName,
    sessionCode: data.sessionCode,
    joinedAt: parseInt(data.joinedAt, 10),
    hasSubmitted: data.hasSubmitted === '1',
    isHost: data.isHost === '1',
  };
}

/**
 * Get all participants in a session
 */
export async function listParticipants(sessionCode: string): Promise<Participant[]> {
  const participantIds = await redis.smembers(`session:${sessionCode}:participants`);

  const participants: Participant[] = [];

  for (const participantId of participantIds) {
    const participant = await getParticipant(participantId);
    if (participant) {
      participants.push(participant);
    }
  }

  return participants;
}

/**
 * Get participant count for a session
 */
export async function countParticipants(sessionCode: string): Promise<number> {
  return await redis.scard(`session:${sessionCode}:participants`);
}

/**
 * Get participant IDs only (for efficiency)
 */
export async function listParticipantIds(sessionCode: string): Promise<string[]> {
  return await redis.smembers(`session:${sessionCode}:participants`);
}

/**
 * Check if participant is in session
 */
export async function isParticipantInSession(
  sessionCode: string,
  participantId: string
): Promise<boolean> {
  return (await redis.sismember(`session:${sessionCode}:participants`, participantId)) === 1;
}

/**
 * Mark participant as having submitted
 */
export async function markParticipantSubmitted(participantId: string): Promise<void> {
  await redis.hset(`participant:${participantId}`, 'hasSubmitted', '1');
}

/**
 * Remove participant from session
 */
export async function removeParticipant(
  sessionCode: string,
  participantId: string
): Promise<void> {
  const pipeline = redis.pipeline();

  // Remove from participants set
  pipeline.srem(`session:${sessionCode}:participants`, participantId);

  // Delete participant metadata
  pipeline.del(`participant:${participantId}`);

  // Delete participant selections
  pipeline.del(`session:${sessionCode}:${participantId}:selections`);

  await pipeline.exec();
}