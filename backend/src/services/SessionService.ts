// Session service - Business logic for session lifecycle
// Based on: specs/001-dinner-decider-enables/plan.md

import { redis } from '../redis/client.js';
import * as SessionModel from '../models/Session.js';
import * as ParticipantModel from '../models/Participant.js';
import { refreshSessionTtl, calculateExpireAt, getExpiresAtISO } from '../redis/ttl-utils.js';
// Session type imported but not used directly in this service

/**
 * Generate a unique 6-character alphanumeric session code (uppercase)
 */
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new session with the given host
 * Returns session data including code and shareable link
 */
export async function createSession(hostName: string): Promise<{
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
}> {
  // Generate unique session code
  let sessionCode = generateSessionCode();
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  // Ensure uniqueness (extremely unlikely to collide, but good practice)
  while (attempts < MAX_ATTEMPTS) {
    const exists = await redis.exists(`session:${sessionCode}`);
    if (!exists) break;
    sessionCode = generateSessionCode();
    attempts++;
  }

  if (attempts >= MAX_ATTEMPTS) {
    throw new Error('Failed to generate unique session code');
  }

  // Create session (host will be added when they join via WebSocket)
  // Note: hostId is temporary and not used since host joins via WebSocket
  const tempHostId = `temp-${Date.now()}`;
  const session = await SessionModel.createSession(sessionCode, tempHostId);

  // Set TTL on session keys (no participants yet)
  const expireAt = calculateExpireAt();
  await refreshSessionTtl(sessionCode, []);

  // Generate shareable link
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;

  return {
    sessionCode,
    hostName,
    participantCount: 0,
    state: session.state,
    expiresAt: getExpiresAtISO(expireAt),
    shareableLink,
  };
}

/**
 * Get session details
 */
export async function getSession(sessionCode: string): Promise<{
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
} | null> {
  const session = await SessionModel.getSession(sessionCode);

  if (!session) {
    return null;
  }

  // Get host participant to retrieve hostName
  const participants = await ParticipantModel.listParticipants(sessionCode);
  const host = participants.find((p) => p.isHost);

  if (!host) {
    return null;
  }

  // Calculate expiresAt from TTL
  const ttl = await redis.ttl(`session:${sessionCode}`);

  // Guard against negative TTL values
  // TTL -2 means key doesn't exist, -1 means no expiry set
  if (ttl < 0) {
    return null; // Session expired or doesn't exist
  }

  const expireAt = Math.floor(Date.now() / 1000) + ttl;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;

  return {
    sessionCode,
    hostName: host.displayName,
    participantCount: session.participantCount,
    state: session.state,
    expiresAt: getExpiresAtISO(expireAt),
    shareableLink,
  };
}

/**
 * Join an existing session
 * Enforces 1-4 participant limit
 */
export async function joinSession(
  sessionCode: string,
  participantId: string,
  displayName: string
): Promise<{
  participantId: string;
  sessionCode: string;
  participantName: string;
  participantCount: number;
}> {
  // Check session exists
  const session = await SessionModel.getSession(sessionCode);
  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  // Check participant limit (FR-004, FR-005)
  const currentCount = await ParticipantModel.countParticipants(sessionCode);
  if (currentCount >= 4) {
    throw new Error('SESSION_FULL');
  }

  // Add participant
  await ParticipantModel.addParticipant(sessionCode, participantId, displayName, false);

  // Increment participant count
  const newCount = await SessionModel.incrementParticipantCount(sessionCode);

  // Update last activity
  await SessionModel.updateLastActivity(sessionCode);

  // Refresh TTL
  const participantIds = await redis.smembers(`session:${sessionCode}:participants`);
  await refreshSessionTtl(sessionCode, participantIds);

  return {
    participantId,
    sessionCode,
    participantName: displayName,
    participantCount: newCount,
  };
}

/**
 * Expire a session (cleanup)
 */
export async function expireSession(sessionCode: string): Promise<void> {
  await SessionModel.updateSessionState(sessionCode, 'expired');
  await SessionModel.deleteSession(sessionCode);
}