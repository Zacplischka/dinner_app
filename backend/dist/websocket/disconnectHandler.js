import * as ParticipantModel from '../models/Participant.js';
import { markParticipantOffline } from '../redis/presence-utils.js';
export async function handleDisconnect(socket, _io, reason) {
    try {
        console.log(`Socket ${socket.id} disconnected: ${reason}`);
        const participant = await ParticipantModel.getParticipant(socket.id);
        if (!participant) {
            return;
        }
        const { sessionCode, displayName } = participant;
        await markParticipantOffline(sessionCode, socket.id);
        const participantCount = await ParticipantModel.countParticipants(sessionCode);
        socket.to(sessionCode).emit('participant:left', {
            participantId: socket.id,
            displayName,
            participantCount,
            isOnline: false,
        });
        console.log(`✓ ${displayName} disconnected from ${sessionCode} (session preserved)`);
    }
    catch (error) {
        console.error('Error in disconnect handler:', error);
    }
}
//# sourceMappingURL=disconnectHandler.js.map