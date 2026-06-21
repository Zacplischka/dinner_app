import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { redis } from '../redis/client.js';
export async function submitSelections(sessionCode, participantId, placeIds) {
    const participant = await ParticipantModel.getParticipant(participantId);
    if (participant?.hasSubmitted) {
        console.warn('Rejected duplicate selection submission', {
            sessionCode,
            participantId,
        });
        throw new Error('ALREADY_SUBMITTED');
    }
    if (placeIds && placeIds.length > 0) {
        const validPlaceIds = await redis.smembers(`session:${sessionCode}:restaurant_ids`);
        const invalidPlaceIds = placeIds.filter(id => !validPlaceIds.includes(id));
        if (invalidPlaceIds.length > 0) {
            console.warn('Rejected selections with invalid restaurants', {
                sessionCode,
                participantId,
                invalidCount: invalidPlaceIds.length,
            });
            throw new Error('INVALID_RESTAURANTS');
        }
    }
    await SelectionModel.submitSelections(sessionCode, participantId, placeIds);
    console.log('Selections submitted', {
        sessionCode,
        participantId,
        selectionCount: placeIds.length,
    });
}
export async function getSubmittedCount(sessionCode) {
    const participants = await ParticipantModel.listParticipants(sessionCode);
    return participants.filter(p => p.hasSubmitted).length;
}
export async function clearSelections(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    await SelectionModel.clearAllSelections(sessionCode, participantIds);
    console.log('Session selections cleared', {
        sessionCode,
        participantCount: participantIds.length,
    });
}
//# sourceMappingURL=SelectionService.js.map