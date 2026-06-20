import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { redis } from '../redis/client.js';
export async function submitSelections(sessionCode, participantId, placeIds) {
    const participant = await ParticipantModel.getParticipant(participantId);
    if (participant?.hasSubmitted) {
        throw new Error('ALREADY_SUBMITTED');
    }
    if (placeIds && placeIds.length > 0) {
        const validPlaceIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);
        const invalidPlaceIds = placeIds.filter(id => !validPlaceIds.includes(id));
        if (invalidPlaceIds.length > 0) {
            throw new Error('INVALID_RESTAURANTS');
        }
    }
    await SelectionModel.submitSelections(sessionCode, participantId, placeIds);
}
export async function getSubmittedCount(sessionCode) {
    const participants = await ParticipantModel.listParticipants(sessionCode);
    return participants.filter(p => p.hasSubmitted).length;
}
export async function clearSelections(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    await SelectionModel.clearAllSelections(sessionCode, participantIds);
}
//# sourceMappingURL=SelectionService.js.map