import * as SelectionModel from '../models/Selection.js';
import * as ParticipantModel from '../models/Participant.js';
import { validateOptionIds } from '../constants/dinnerOptions.js';
export async function submitSelections(sessionCode, participantId, optionIds) {
    if (!validateOptionIds(optionIds)) {
        throw new Error('INVALID_OPTIONS');
    }
    const existingSelections = await SelectionModel.getSelections(sessionCode, participantId);
    if (existingSelections.length > 0) {
        throw new Error('ALREADY_SUBMITTED');
    }
    await SelectionModel.submitSelections(sessionCode, participantId, optionIds);
}
export async function getSubmittedCount(sessionCode) {
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
export async function clearSelections(sessionCode) {
    const participantIds = await ParticipantModel.listParticipantIds(sessionCode);
    await SelectionModel.clearAllSelections(sessionCode, participantIds);
}
//# sourceMappingURL=SelectionService.js.map