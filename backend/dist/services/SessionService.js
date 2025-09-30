import { redis } from '../redis/client.js';
import * as SessionModel from '../models/Session.js';
import * as ParticipantModel from '../models/Participant.js';
import { refreshSessionTtl, calculateExpireAt, getExpiresAtISO } from '../redis/ttl-utils.js';
export function generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
export async function createSession(hostName) {
    let sessionCode = generateSessionCode();
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    while (attempts < MAX_ATTEMPTS) {
        const exists = await redis.exists(`session:${sessionCode}`);
        if (!exists)
            break;
        sessionCode = generateSessionCode();
        attempts++;
    }
    if (attempts >= MAX_ATTEMPTS) {
        throw new Error('Failed to generate unique session code');
    }
    const tempHostId = `temp-${Date.now()}`;
    const session = await SessionModel.createSession(sessionCode, tempHostId, hostName);
    const expireAt = calculateExpireAt();
    await refreshSessionTtl(sessionCode, []);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;
    return {
        sessionCode,
        hostName,
        participantCount: 1,
        state: session.state,
        expiresAt: getExpiresAtISO(expireAt),
        shareableLink,
    };
}
export async function getSession(sessionCode) {
    const session = await SessionModel.getSession(sessionCode);
    if (!session) {
        return null;
    }
    const participants = await ParticipantModel.listParticipants(sessionCode);
    const host = participants.find((p) => p.isHost);
    const hostName = host ? host.displayName : session.hostName;
    const ttl = await redis.ttl(`session:${sessionCode}`);
    if (ttl < 0) {
        return null;
    }
    const expireAt = Math.floor(Date.now() / 1000) + ttl;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;
    return {
        sessionCode,
        hostName: hostName || 'Unknown Host',
        participantCount: session.participantCount,
        state: session.state,
        expiresAt: getExpiresAtISO(expireAt),
        shareableLink,
    };
}
export async function joinSession(sessionCode, participantId, displayName) {
    const session = await SessionModel.getSession(sessionCode);
    if (!session) {
        throw new Error('SESSION_NOT_FOUND');
    }
    if (session.participantCount >= 4) {
        throw new Error('SESSION_FULL');
    }
    await ParticipantModel.addParticipant(sessionCode, participantId, displayName, false);
    const newCount = await SessionModel.incrementParticipantCount(sessionCode);
    await SessionModel.updateLastActivity(sessionCode);
    const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
    await refreshSessionTtl(sessionCode, participantIds);
    return {
        participantId,
        sessionCode,
        participantName: displayName,
        participantCount: newCount,
    };
}
export async function expireSession(sessionCode) {
    await SessionModel.updateSessionState(sessionCode, 'expired');
    await SessionModel.deleteSession(sessionCode);
}
//# sourceMappingURL=SessionService.js.map