// Selection model - Redis operations for participant selections
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';

/**
 * Submit participant's selections
 */
export async function submitSelections(
  sessionCode: string,
  participantId: string,
  optionIds: string[]
): Promise<void> {
  if (optionIds.length === 0) {
    throw new Error('Must select at least 1 option');
  }

  // Store selections as a Set
  await redis.sadd(`session:${sessionCode}:${participantId}:selections`, ...optionIds);
}

/**
 * Get participant's selections
 */
export async function getSelections(
  sessionCode: string,
  participantId: string
): Promise<string[]> {
  return await redis.smembers(`session:${sessionCode}:${participantId}:selections`);
}

/**
 * Get all participants' selections for a session
 */
export async function getAllSelections(
  sessionCode: string,
  participantIds: string[]
): Promise<Record<string, string[]>> {
  const allSelections: Record<string, string[]> = {};

  for (const participantId of participantIds) {
    const selections = await getSelections(sessionCode, participantId);
    allSelections[participantId] = selections;
  }

  return allSelections;
}

/**
 * Check if participant has already submitted selections
 */
export async function hasSubmitted(
  sessionCode: string,
  participantId: string
): Promise<boolean> {
  const count = await redis.scard(`session:${sessionCode}:${participantId}:selections`);
  return count > 0;
}

/**
 * Get count of participants who have submitted
 */
export async function getSubmittedCount(
  sessionCode: string,
  participantIds: string[]
): Promise<number> {
  let count = 0;

  for (const participantId of participantIds) {
    if (await hasSubmitted(sessionCode, participantId)) {
      count++;
    }
  }

  return count;
}

/**
 * Clear selections for a specific participant
 */
export async function clearSelections(
  sessionCode: string,
  participantId: string
): Promise<void> {
  await redis.del(`session:${sessionCode}:${participantId}:selections`);
}

/**
 * Clear all selections for a session (used in restart)
 */
export async function clearAllSelections(
  sessionCode: string,
  participantIds: string[]
): Promise<void> {
  const pipeline = redis.pipeline();

  participantIds.forEach((participantId) => {
    pipeline.del(`session:${sessionCode}:${participantId}:selections`);
  });

  // Also clear results
  pipeline.del(`session:${sessionCode}:results`);

  await pipeline.exec();
}