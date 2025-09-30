// Overlap calculation service - Calculate intersection of selections
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SelectionModel from '../models/Selection.js';
import { DINNER_OPTIONS, getDinnerOptionById } from '../constants/dinnerOptions.js';
import type { DinnerOption } from '../constants/dinnerOptions.js';

/**
 * Calculate overlapping options using Redis SINTER
 * Returns options that ALL participants selected
 */
export async function calculateOverlap(
  sessionCode: string
): Promise<{
  overlappingOptions: DinnerOption[];
  allSelections: Record<string, string[]>;
  hasOverlap: boolean;
}> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
  const participants = await ParticipantModel.listParticipants(sessionCode);

  if (participantIds.length === 0) {
    return {
      overlappingOptions: [],
      allSelections: {},
      hasOverlap: false,
    };
  }

  // Build selection keys for SINTER
  const selectionKeys = participantIds.map(
    (id) => `session:${sessionCode}:${id}:selections`
  );

  // Calculate intersection using Redis SINTER (O(N*M) where N = smallest set size)
  let overlappingOptionIds: string[] = [];

  if (selectionKeys.length === 1) {
    // Single participant: their selections are the overlap (FR-021)
    overlappingOptionIds = await redis.smembers(selectionKeys[0]);
  } else {
    // Multiple participants: calculate intersection
    overlappingOptionIds = await redis.sinter(...selectionKeys);
  }

  // Map optionIds to DinnerOption objects
  const overlappingOptions = overlappingOptionIds
    .map((optionId) => getDinnerOptionById(optionId))
    .filter((option): option is DinnerOption => option !== undefined);

  // Build allSelections map for transparency (displayName -> optionIds)
  const allSelections: Record<string, string[]> = {};

  for (const participant of participants) {
    const selections = await SelectionModel.getSelections(
      sessionCode,
      participant.participantId
    );
    allSelections[participant.displayName] = selections;
  }

  return {
    overlappingOptions,
    allSelections,
    hasOverlap: overlappingOptions.length > 0,
  };
}

/**
 * Store results in Redis (optional, for persistence)
 */
export async function storeResults(
  sessionCode: string,
  overlappingOptionIds: string[]
): Promise<void> {
  if (overlappingOptionIds.length > 0) {
    await redis.sadd(`session:${sessionCode}:results`, ...overlappingOptionIds);
  } else {
    // Ensure results key exists even if empty (for TTL)
    await redis.sadd(`session:${sessionCode}:results`, '__empty__');
  }
}