import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from './client.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const refreshTtlScript = fs.readFileSync(path.join(__dirname, 'refresh-ttl.lua'), 'utf-8');
export const SESSION_TTL_SECONDS = 30 * 60;
export function calculateExpireAt() {
    return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}
export async function refreshSessionTtl(sessionCode, participantIds) {
    const expireAt = calculateExpireAt();
    const keys = [
        `session:${sessionCode}`,
        `session:${sessionCode}:participants`,
        `session:${sessionCode}:results`,
        `session:${sessionCode}:online`,
    ];
    participantIds.forEach((participantId) => {
        keys.push(`participant:${participantId}`);
        keys.push(`session:${sessionCode}:${participantId}:selections`);
    });
    await redis.eval(refreshTtlScript, keys.length, ...keys, expireAt);
    return expireAt;
}
export function getExpiresAtISO(expireAt) {
    return new Date(expireAt * 1000).toISOString();
}
//# sourceMappingURL=ttl-utils.js.map