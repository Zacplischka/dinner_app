import { z } from 'zod';
import * as SelectionService from '../services/SelectionService.js';
import * as OverlapService from '../services/OverlapService.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
const selectionSubmitPayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
    selections: z.array(z.string()).min(1, 'Must select at least 1 option').max(50),
});
export async function handleSelectionSubmit(socket, io, payload, callback) {
    try {
        const validation = selectionSubmitPayloadSchema.safeParse(payload);
        if (!validation.success) {
            return callback({
                success: false,
                error: 'Invalid payload: ' + validation.error.errors[0].message,
            });
        }
        const { sessionCode, selections } = validation.data;
        const session = await SessionModel.getSession(sessionCode);
        if (!session) {
            return callback({
                success: false,
                error: 'Session not found or has expired',
            });
        }
        const isInSession = await ParticipantModel.isParticipantInSession(sessionCode, socket.id);
        if (!isInSession) {
            return callback({
                success: false,
                error: 'You are not a participant in this session',
            });
        }
        try {
            await SelectionService.submitSelections(sessionCode, socket.id, selections);
        }
        catch (error) {
            return callback({
                success: false,
                error: error instanceof Error && error.message === 'INVALID_OPTIONS'
                    ? 'One or more selected options are invalid'
                    : error instanceof Error && error.message === 'ALREADY_SUBMITTED'
                        ? 'You have already submitted your selections'
                        : 'Error submitting selections',
            });
        }
        await ParticipantModel.markParticipantSubmitted(socket.id);
        await SessionModel.updateLastActivity(sessionCode);
        const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
        await refreshSessionTtl(sessionCode, participantIds);
        callback({ success: true });
        const submittedCount = await SelectionService.getSubmittedCount(sessionCode);
        const participantCount = participantIds.length;
        socket.to(sessionCode).emit('participant:submitted', {
            participantId: socket.id,
            submittedCount,
            participantCount,
        });
        console.log(`✓ Participant ${socket.id} submitted (${submittedCount}/${participantCount})`);
        const allSubmitted = submittedCount === participantCount;
        if (allSubmitted) {
            const results = await OverlapService.calculateOverlap(sessionCode);
            await OverlapService.storeResults(sessionCode, results.overlappingOptions.map((opt) => opt.optionId));
            await refreshSessionTtl(sessionCode, participantIds);
            await SessionModel.updateSessionState(sessionCode, 'complete');
            io.in(sessionCode).emit('session:results', {
                sessionCode,
                overlappingOptions: results.overlappingOptions,
                allSelections: results.allSelections,
                hasOverlap: results.hasOverlap,
            });
            console.log(`✓ Session ${sessionCode} complete - ${results.hasOverlap ? 'Match found!' : 'No overlap'}`);
        }
    }
    catch (error) {
        console.error('Error in selection:submit handler:', error);
        callback({
            success: false,
            error: 'An error occurred while submitting selections',
        });
    }
}
//# sourceMappingURL=submitHandler.js.map