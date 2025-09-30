// Selection service - Business logic for participant selections
// Based on: specs/001-dinner-decider-enables/plan.md

import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { validateOptionIds } from '../constants/dinnerOptions.js';

/**
 * Submit selections for a participant
 * Validates that optionIds exist and participant hasn't already submitted
 */
export async function submitSelections(
  sessionCode: string,
  participantId: string,
  optionIds: string[]
): Promise<void> {
  // Validate all optionIds exist in static DINNER_OPTIONS
  if (!validateOptionIds(optionIds)) {
    throw new Error('INVALID_OPTIONS');
  }

  // Check if participant has already submitted (FR-026)
  const existingSelections = await SelectionModel.getSelections(sessionCode, participantId);
  if (existingSelections.length > 0) {
    throw new Error('ALREADY_SUBMITTED');
  }

  // Store selections
  await SelectionModel.submitSelections(sessionCode, participantId, optionIds);
}

/**
 * Check if all participants have submitted selections
 */
export async function checkAllSubmitted(sessionCode: string): Promise<boolean> {
  const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
  const totalParticipants = participantIds.length;

  // Count how many have submitted
  let submittedCount = 0;
  for (const participantId of participantIds) {
    const selections = await SelectionModel.getSelections(sessionCode, participantId);
    if (selections.length > 0) {
      submittedCount++;
    }
  }

  return submittedCount === totalParticipants;
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