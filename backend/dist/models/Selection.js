import { redis } from '../redis/client.js';
export async function submitSelections(sessionCode, participantId, optionIds) {
    if (optionIds.length === 0) {
        throw new Error('Must select at least 1 option');
    }
    await redis.sadd(`session:${sessionCode}:${participantId}:selections`, ...optionIds);
}
export async function getSelections(sessionCode, participantId) {
    return await redis.smembers(`session:${sessionCode}:${participantId}:selections`);
}
export async function getAllSelections(sessionCode, participantIds) {
    const allSelections = {};
    for (const participantId of participantIds) {
        const selections = await getSelections(sessionCode, participantId);
        allSelections[participantId] = selections;
    }
    return allSelections;
}
export async function hasSubmitted(sessionCode, participantId) {
    const count = await redis.scard(`session:${sessionCode}:${participantId}:selections`);
    return count > 0;
}
export async function getSubmittedCount(sessionCode, participantIds) {
    let count = 0;
    for (const participantId of participantIds) {
        if (await hasSubmitted(sessionCode, participantId)) {
            count++;
        }
    }
    return count;
}
export async function clearSelections(sessionCode, participantId) {
    await redis.del(`session:${sessionCode}:${participantId}:selections`);
}
export async function clearAllSelections(sessionCode, participantIds) {
    const pipeline = redis.pipeline();
    participantIds.forEach((participantId) => {
        pipeline.del(`session:${sessionCode}:${participantId}:selections`);
    });
    pipeline.del(`session:${sessionCode}:results`);
    await pipeline.exec();
}
//# sourceMappingURL=Selection.js.map