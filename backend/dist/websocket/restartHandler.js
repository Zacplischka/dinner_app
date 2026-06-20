import { z } from 'zod';
import * as SelectionService from '../services/SelectionService.js';
import * as ParticipantModel from '../models/Participant.js';
import * as SessionModel from '../models/Session.js';
import { refreshSessionTtl } from '../redis/ttl-utils.js';
import { redis } from '../redis/client.js';
const sessionRestartPayloadSchema = z.object({
    sessionCode: z.string().regex(/^[A-Z0-9]{6}$/),
});
export async function handleSessionRestart(socket, io, payload, callback) {
    try {
        const validation = sessionRestartPayloadSchema.safeParse(payload);
        if (!validation.success) {
            console.warn(`Rejected session:restart for socket ${socket.id}: invalid payload - ${validation.error.errors[0].message}`);
            return callback({
                success: false,
                error: 'Invalid payload: ' + validation.error.errors[0].message,
            });
        }
        const { sessionCode } = validation.data;
        const session = await SessionModel.getSession(sessionCode);
        if (!session) {
            console.warn(`Rejected session:restart for ${sessionCode}: session not found`);
            return callback({
                success: false,
                error: 'Session not found or has expired',
            });
        }
        const isInSession = await ParticipantModel.isParticipantInSession(sessionCode, socket.id);
        if (!isInSession) {
            console.warn(`Rejected session:restart for ${sessionCode}: socket ${socket.id} is not a participant`);
            return callback({
                success: false,
                error: 'You are not a participant in this session',
            });
        }
        await SelectionService.clearSelections(sessionCode);
        const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
        const pipeline = redis.pipeline();
        participantIds.forEach((participantId) => {
            pipeline.hset(`participant:${participantId}`, 'hasSubmitted', '0');
        });
        await pipeline.exec();
        await SessionModel.updateSessionState(sessionCode, 'selecting');
        await SessionModel.updateLastActivity(sessionCode);
        await refreshSessionTtl(sessionCode, participantIds);
        callback({ success: true });
        io.in(sessionCode).emit('session:restarted', {
            sessionCode,
            message: 'Session restarted. Make new selections.',
        });
        console.log(`✓ Session ${sessionCode} restarted`);
    }
    catch (error) {
        console.error('Error in session:restart handler:', error);
        callback({
            success: false,
            error: 'An error occurred while restarting the session',
        });
    }
}
//# sourceMappingURL=restartHandler.js.map