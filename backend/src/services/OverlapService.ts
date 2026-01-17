// Overlap calculation service - Calculate intersection of selections
// Based on: specs/001-dinner-decider-enables/data-model.md

import { redis } from '../redis/client.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SelectionModel from '../models/Selection.js';
import type { Restaurant } from '@dinder/shared/types';

/**
 * Calculate overlapping options using Redis SINTER
 * Returns restaurants that ALL participants selected
 */
export async function calculateOverlap(
  sessionCode: string
): Promise<{
  overlappingOptions: Restaurant[];
  allSelections: Record<string, string[]>;
  restaurantNames: Record<string, string>;
  hasOverlap: boolean;
}> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
  const participants = await ParticipantModel.listParticipants(sessionCode);

  if (participantIds.length === 0) {
    return {
      overlappingOptions: [],
      allSelections: {},
      restaurantNames: {},
      hasOverlap: false,
    };
  }

  // Build selection keys for SINTER
  const selectionKeys = participantIds.map(
    (id) => `session:${sessionCode}:${id}:selections`
  );

  // Calculate intersection using Redis SINTER (O(N*M) where N = smallest set size)
  let overlappingPlaceIds: string[] = [];

  if (selectionKeys.length === 1) {
    // Single participant: their selections are the overlap (FR-021)
    overlappingPlaceIds = await redis.smembers(selectionKeys[0]);
  } else {
    // Multiple participants: calculate intersection
    overlappingPlaceIds = await redis.sinter(...selectionKeys);
  }

  // Map Place IDs to Restaurant objects
  const overlappingOptions: Restaurant[] = [];
  for (const placeId of overlappingPlaceIds) {
    const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
    if (restaurantData) {
      overlappingOptions.push(JSON.parse(restaurantData));
    }
  }

  // Build allSelections map for transparency (displayName -> placeIds)
  const allSelections: Record<string, string[]> = {};

  for (const participant of participants) {
    const selections = await SelectionModel.getSelections(
      sessionCode,
      participant.participantId
    );
    allSelections[participant.displayName] = selections;
  }

  // Build restaurantNames map for ALL selected placeIds (not just overlapping)
  const allPlaceIds = new Set<string>();
  for (const selections of Object.values(allSelections)) {
    for (const placeId of selections) {
      allPlaceIds.add(placeId);
    }
  }

  const restaurantNames: Record<string, string> = {};
  for (const placeId of allPlaceIds) {
    const restaurantData = await redis.hget(`session:${sessionCode}:restaurants`, placeId);
    if (restaurantData) {
      const restaurant = JSON.parse(restaurantData) as Restaurant;
      restaurantNames[placeId] = restaurant.name;
    }
  }

  return {
    overlappingOptions,
    allSelections,
    restaurantNames,
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