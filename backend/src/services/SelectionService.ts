// Selection service - Business logic for participant selections
// Based on: specs/001-dinner-decider-enables/plan.md

import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { redis } from '../redis/client.js';

/**
 * Submit selections for a participant
 * Validates that Place IDs exist in session's restaurant list and participant hasn't already submitted
 * Note: Empty selections are allowed - a user may not like any options, and that's valid.
 */
export async function submitSelections(
  sessionCode: string,
  participantId: string,
  placeIds: string[]
): Promise<void> {
  // Check if participant has already submitted (FR-026)
  // Use the hasSubmitted flag from participant model instead of checking selections
  // This allows empty selections to be submitted once
  const participant = await ParticipantModel.getParticipant(participantId);
  if (participant?.hasSubmitted) {
    throw new Error('ALREADY_SUBMITTED');
  }

  // Only validate placeIds if there are any
  if (placeIds && placeIds.length > 0) {
    // Get valid Place IDs for this session
    const validPlaceIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);

    // Validate all placeIds exist in session's restaurant list
    const invalidPlaceIds = placeIds.filter(id => !validPlaceIds.includes(id));
    if (invalidPlaceIds.length > 0) {
      throw new Error('INVALID_RESTAURANTS');
    }
  }

  // Store selections (can be empty array)
  await SelectionModel.submitSelections(sessionCode, participantId, placeIds);
}

/**
 * Get count of participants who have submitted
 * Uses the hasSubmitted flag from participant model (not selection count)
 * This correctly handles empty selections.
 */
export async function getSubmittedCount(sessionCode: string): Promise<number> {
  const participants = await ParticipantModel.listParticipants(sessionCode);
  return participants.filter(p => p.hasSubmitted).length;
}

/**
 * Clear all selections for a session (used in restart - FR-012)
 */
export async function clearSelections(sessionCode: string): Promise<void> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
  await SelectionModel.clearAllSelections(sessionCode, participantIds);
}