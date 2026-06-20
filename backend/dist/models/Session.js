import { redis } from '../redis/client.js';
export async function createSession(sessionCode, hostId, hostName, location, searchRadiusMiles) {
    const now = Math.floor(Date.now() / 1000);
    const session = {
        sessionCode,
        hostId,
        state: 'waiting',
        participantCount: 1,
        createdAt: now,
        lastActivityAt: now,
        hostName,
        location,
        searchRadiusMiles,
    };
    const sessionData = {
        createdAt: session.createdAt,
        hostId: session.hostId,
        state: session.state,
        participantCount: session.participantCount,
        lastActivityAt: session.lastActivityAt,
    };
    if (hostName) {
        sessionData.hostName = hostName;
    }
    if (location) {
        sessionData.locationLat = location.latitude;
        sessionData.locationLng = location.longitude;
        if (location.address) {
            sessionData.locationAddress = location.address;
        }
    }
    if (searchRadiusMiles !== undefined) {
        sessionData.searchRadiusMiles = searchRadiusMiles;
    }
    await redis.hset(`session:${sessionCode}`, sessionData);
    return session;
}
export async function getSession(sessionCode) {
    const data = await redis.hgetall(`session:${sessionCode}`);
    if (!data || Object.keys(data).length === 0) {
        return null;
    }
    const session = {
        sessionCode,
        hostId: data.hostId,
        state: data.state,
        participantCount: parseInt(data.participantCount, 10),
        createdAt: parseInt(data.createdAt, 10),
        lastActivityAt: parseInt(data.lastActivityAt, 10),
        hostName: data.hostName,
    };
    if (data.locationLat && data.locationLng) {
        session.location = {
            latitude: parseFloat(data.locationLat),
            longitude: parseFloat(data.locationLng),
            address: data.locationAddress,
        };
    }
    if (data.searchRadiusMiles) {
        session.searchRadiusMiles = parseFloat(data.searchRadiusMiles);
    }
    return session;
}
export async function updateSessionState(sessionCode, state) {
    await redis.hset(`session:${sessionCode}`, 'state', state);
}
export async function updateLastActivity(sessionCode) {
    const now = Math.floor(Date.now() / 1000);
    await redis.hset(`session:${sessionCode}`, 'lastActivityAt', now);
}
export async function incrementParticipantCount(sessionCode) {
    return await redis.hincrby(`session:${sessionCode}`, 'participantCount', 1);
}
export async function setParticipantCount(sessionCode, count) {
    await redis.hset(`session:${sessionCode}`, 'participantCount', count);
}
export async function deleteSession(sessionCode) {
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    const pipeline = redis.pipeline();
    pipeline.del(`session:${sessionCode}`);
    pipeline.del(`session:${sessionCode}:participants`);
    pipeline.del(`session:${sessionCode}:results`);
    participantIds.forEach((participantId) => {
        pipeline.del(`participant:${participantId}`);
        pipeline.del(`session:${sessionCode}:${participantId}:selections`);
    });
    await pipeline.exec();
}
//# sourceMappingURL=Session.js.map