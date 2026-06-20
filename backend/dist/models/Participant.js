import { redis } from '../redis/client.js';
export async function addParticipant(sessionCode, participantId, displayName, isHost = false) {
    const now = Math.floor(Date.now() / 1000);
    const participant = {
        participantId,
        displayName,
        sessionCode,
        joinedAt: now,
        hasSubmitted: false,
        isHost,
    };
    await redis.sadd(`session:${sessionCode}:participants`, participantId);
    await redis.hset(`participant:${participantId}`, {
        displayName,
        sessionCode,
        joinedAt: now,
        isHost: isHost ? '1' : '0',
        hasSubmitted: '0',
    });
    return participant;
}
export async function getParticipant(participantId) {
    const data = await redis.hgetall(`participant:${participantId}`);
    if (!data || Object.keys(data).length === 0) {
        return null;
    }
    return {
        participantId,
        displayName: data.displayName,
        sessionCode: data.sessionCode,
        joinedAt: parseInt(data.joinedAt, 10),
        hasSubmitted: data.hasSubmitted === '1',
        isHost: data.isHost === '1',
    };
}
export async function listParticipants(sessionCode) {
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    const participants = [];
    for (const participantId of participantIds) {
        const participant = await getParticipant(participantId);
        if (participant) {
            participants.push(participant);
        }
    }
    return participants;
}
export async function countParticipants(sessionCode) {
    return await redis.scard(`session:${sessionCode}:participants`);
}
export async function listParticipantIds(sessionCode) {
    return await redis.smembers(`session:${sessionCode}:participants`);
}
export async function isParticipantInSession(sessionCode, participantId) {
    return (await redis.sismember(`session:${sessionCode}:participants`, participantId)) === 1;
}
export async function markParticipantSubmitted(participantId) {
    await redis.hset(`participant:${participantId}`, 'hasSubmitted', '1');
}
export async function removeParticipant(sessionCode, participantId) {
    const pipeline = redis.pipeline();
    pipeline.srem(`session:${sessionCode}:participants`, participantId);
    pipeline.del(`participant:${participantId}`);
    pipeline.del(`session:${sessionCode}:${participantId}:selections`);
    await pipeline.exec();
}
//# sourceMappingURL=Participant.js.map