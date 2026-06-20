import { z } from 'zod';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
const sessionLeavePayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
});
export async function handleSessionLeave(socket, _io, payload, callback) {
    try {
        const validation = sessionLeavePayloadSchema.safeParse(payload);
        if (!validation.success) {
            return callback({
                success: false,
                error: 'Invalid payload: ' + validation.error.errors[0].message,
            });
        }
        const { sessionCode } = validation.data;
        const session = await SessionModel.getSession(sessionCode);
        if (!session) {
            return callback({
                success: false,
                error: 'Session not found or has expired',
            });
        }
        const participant = await ParticipantModel.getParticipant(socket.id);
        if (!participant) {
            return callback({
                success: false,
                error: 'You are not a participant in this session',
            });
        }
        const { displayName } = participant;
        await ParticipantModel.removeParticipant(sessionCode, socket.id);
        const newCount = await ParticipantModel.countParticipants(sessionCode);
        await socket.leave(sessionCode);
        callback({ success: true });
        socket.to(sessionCode).emit('participant:left', {
            participantId: socket.id,
            displayName,
            participantCount: newCount,
        });
        console.log(`✓ ${displayName} left session ${sessionCode} (${newCount}/4 remaining)`);
    }
    catch (error) {
        console.error('Error in session:leave handler:', error);
        callback({
            success: false,
            error: 'An error occurred while leaving the session',
        });
    }
}
//# sourceMappingURL=leaveHandler.js.map