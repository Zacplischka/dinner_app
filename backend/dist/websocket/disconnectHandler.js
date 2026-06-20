import * as ParticipantModel from '../models/Participant.js';
export async function handleDisconnect(socket, _io, reason) {
    try {
        console.log(`Socket ${socket.id} disconnected: ${reason}`);
        const participant = await ParticipantModel.getParticipant(socket.id);
        if (!participant) {
            console.warn(`Disconnect for socket ${socket.id} had no participant record`);
            return;
        }
        const { sessionCode, displayName } = participant;
        const participantCount = await ParticipantModel.countParticipants(sessionCode);
        socket.to(sessionCode).emit('participant:disconnected', {
            participantId: socket.id,
            displayName,
            participantCount,
        });
        console.log(`✓ ${displayName} disconnected from ${sessionCode} (session preserved)`);
    }
    catch (error) {
        console.error('Error in disconnect handler:', error);
    }
}
//# sourceMappingURL=disconnectHandler.js.map