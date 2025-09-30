import { redis } from './client.js';
export async function markParticipantOnline(sessionCode, participantId) {
    await redis.sadd(`session:${sessionCode}:online`, participantId);
}
export async function markParticipantOffline(sessionCode, participantId) {
    await redis.srem(`session:${sessionCode}:online`, participantId);
}
export async function isParticipantOnline(sessionCode, participantId) {
    const result = await redis.sismember(`session:${sessionCode}:online`, participantId);
    return result === 1;
}
export async function getOnlineParticipants(sessionCode) {
    return redis.smembers(`session:${sessionCode}:online`);
}
export async function getParticipantsOnlineStatus(sessionCode, participantIds) {
    if (participantIds.length === 0) {
        return {};
    }
    const pipeline = redis.pipeline();
    for (const participantId of participantIds) {
        pipeline.sismember(`session:${sessionCode}:online`, participantId);
    }
    const results = await pipeline.exec();
    const status = {};
    participantIds.forEach((participantId, index) => {
        const result = results?.[index];
        status[participantId] = result?.[1] === 1;
    });
    return status;
}
export async function clearOnlineParticipants(sessionCode) {
    await redis.del(`session:${sessionCode}:online`);
}
//# sourceMappingURL=presence-utils.js.map