import { z } from 'zod';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
const sessionJoinPayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/, 'Session code must be 6 alphanumeric characters'),
    displayName: z.string().min(1, 'Display name required').max(50, 'Display name too long'),
});
export async function handleSessionJoin(socket, payload, callback) {
    try {
        const validation = sessionJoinPayloadSchema.safeParse(payload);
        if (!validation.success) {
            const reason = validation.error.errors[0].message;
            console.warn('Rejected session:join', {
                socketId: socket.id,
                sessionCode: payload.sessionCode,
                reason,
            });
            return callback({
                success: false,
                error: 'Invalid payload: ' + reason,
            });
        }
        const { sessionCode, displayName } = validation.data;
        const session = await SessionModel.getSession(sessionCode);
        if (!session) {
            console.warn('Rejected session:join', {
                socketId: socket.id,
                sessionCode,
                reason: 'session_not_found',
            });
            return callback({
                success: false,
                error: 'Session not found or has expired',
            });
        }
        const existingParticipants = await ParticipantModel.listParticipants(sessionCode);
        const existingParticipant = existingParticipants.find(p => p.displayName === displayName);
        let isHost = false;
        let isRejoin = false;
        if (existingParticipant) {
            isRejoin = true;
            isHost = existingParticipant.isHost;
            await ParticipantModel.removeParticipant(sessionCode, existingParticipant.participantId);
            await ParticipantModel.addParticipant(sessionCode, socket.id, displayName, isHost);
        }
        else {
            const currentCount = await ParticipantModel.countParticipants(sessionCode);
            if (currentCount >= 4) {
                console.warn('Rejected session:join', {
                    socketId: socket.id,
                    sessionCode,
                    reason: 'session_full',
                    participantCount: currentCount,
                });
                return callback({
                    success: false,
                    error: 'Session is full (maximum 4 participants)',
                });
            }
            isHost = currentCount === 0;
            await ParticipantModel.addParticipant(sessionCode, socket.id, displayName, isHost);
        }
        const newCount = await ParticipantModel.countParticipants(sessionCode);
        if (newCount > 4) {
            await ParticipantModel.removeParticipant(sessionCode, socket.id);
            console.warn('Rejected session:join', {
                socketId: socket.id,
                sessionCode,
                reason: 'session_full_after_add',
                participantCount: newCount,
            });
            return callback({
                success: false,
                error: 'Session is full (maximum 4 participants)',
            });
        }
        await SessionModel.setParticipantCount(sessionCode, newCount);
        await SessionModel.updateLastActivity(sessionCode);
        await socket.join(sessionCode);
        const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
        await refreshSessionTtl(sessionCode, participantIds);
        const participants = await ParticipantModel.listParticipants(sessionCode);
        callback({
            success: true,
            participantId: socket.id,
            sessionCode,
            displayName,
            participantCount: newCount,
            participants: participants.map((p) => ({
                participantId: p.participantId,
                displayName: p.displayName,
                isHost: p.isHost,
            })),
        });
        socket.to(sessionCode).emit('participant:joined', {
            participantId: socket.id,
            displayName,
            participantCount: newCount,
        });
        console.log(`✓ ${displayName} ${isRejoin ? 'rejoined' : 'joined'} session ${sessionCode} (${newCount}/4)`);
    }
    catch (error) {
        console.error('Error in session:join handler:', error);
        callback({
            success: false,
            error: 'An error occurred while joining the session',
        });
    }
}
//# sourceMappingURL=joinHandler.js.map