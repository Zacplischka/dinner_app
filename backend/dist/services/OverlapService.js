import { redis } from '../redis/client.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SelectionModel from '../models/Selection.js';
import { getDinnerOptionById } from '../constants/dinnerOptions.js';
export async function calculateOverlap(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    const participants = await ParticipantModel.listParticipants(sessionCode);
    if (participantIds.length === 0) {
        return {
            overlappingOptions: [],
            allSelections: {},
            hasOverlap: false,
        };
    }
    const selectionKeys = participantIds.map((id) => `session:${sessionCode}:${id}:selections`);
    let overlappingOptionIds = [];
    if (selectionKeys.length === 1) {
        overlappingOptionIds = await redis.smembers(selectionKeys[0]);
    }
    else {
        overlappingOptionIds = await redis.sinter(...selectionKeys);
    }
    const overlappingOptions = overlappingOptionIds
        .map((optionId) => getDinnerOptionById(optionId))
        .filter((option) => option !== undefined);
    const allSelections = {};
    for (const participant of participants) {
        const selections = await SelectionModel.getSelections(sessionCode, participant.participantId);
        allSelections[participant.displayName] = selections;
    }
    return {
        overlappingOptions,
        allSelections,
        hasOverlap: overlappingOptions.length > 0,
    };
}
export async function storeResults(sessionCode, overlappingOptionIds) {
    if (overlappingOptionIds.length > 0) {
        await redis.sadd(`session:${sessionCode}:results`, ...overlappingOptionIds);
    }
    else {
        await redis.sadd(`session:${sessionCode}:results`, '__empty__');
    }
}
//# sourceMappingURL=OverlapService.js.map