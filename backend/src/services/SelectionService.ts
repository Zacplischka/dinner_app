// Selection service - Business logic for participant selections
// Based on: specs/001-dinner-decider-enables/plan.md

import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { redis } from '../redis/client.js';

/**
 * Submit selections for a participant
 * Validates that Place IDs exist in session's restaurant list and participant hasn't already submitted
 */
export async function submitSelections(
  sessionCode: string,
  participantId: string,
  placeIds: string[]
): Promise<void> {
  // Validate that placeIds array is not empty
  if (!placeIds || placeIds.length === 0) {
    throw new Error('INVALID_RESTAURANTS');
  }

  // Get valid Place IDs for this session
  const validPlaceIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);

  // Validate all placeIds exist in session's restaurant list
  const invalidPlaceIds = placeIds.filter(id => !validPlaceIds.includes(id));
  if (invalidPlaceIds.length > 0) {
    throw new Error('INVALID_RESTAURANTS');
  }

  // Check if participant has already submitted (FR-026)
  const existingSelections = await SelectionModel.getSelections(sessionCode, participantId);
  if (existingSelections.length > 0) {
    throw new Error('ALREADY_SUBMITTED');
  }

  // Store selections
  await SelectionModel.submitSelections(sessionCode, participantId, placeIds);
}

/**
 * Get count of participants who have submitted
 */
export async function getSubmittedCount(sessionCode: string): Promise<number> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);

  let submittedCount = 0;
  for (const participantId of participantIds) {
    const selections = await SelectionModel.getSelections(sessionCode, participantId);
    if (selections.length > 0) {
      submittedCount++;
    }
  }

  return submittedCount;
}

/**
 * Clear all selections for a session (used in restart - FR-012)
 */
export async function clearSelections(sessionCode: string): Promise<void> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
  await SelectionModel.clearAllSelections(sessionCode, participantIds);
}