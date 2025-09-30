// TTL refresh utilities using Lua scripts for atomic operations
// Based on: specs/001-dinner-decider-enables/data-model.md

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { redis } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Lua script
const refreshTtlScript = fs.readFileSync(
  path.join(__dirname, 'refresh-ttl.lua'),
  'utf-8'
);

// Session TTL duration (30 minutes in seconds)
export const SESSION_TTL_SECONDS = 30 * 60;

/**
 * Calculates the new expiration timestamp (current time + 30 minutes)
 */
export function calculateExpireAt(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

/**
 * Atomically refreshes TTL on all session-related keys
 * @param sessionCode - The session code
 * @param participantIds - Array of participant IDs in the session
 * @returns The new expireAt timestamp
 */
export async function refreshSessionTtl(
  sessionCode: string,
  participantIds: string[]
): Promise<number> {
  const expireAt = calculateExpireAt();

  // Build list of all keys to refresh
  const keys = [
    `session:${sessionCode}`,
    `session:${sessionCode}:participants`,
    `session:${sessionCode}:results`,
  ];

  // Add participant metadata keys
  participantIds.forEach((participantId) => {
    keys.push(`participant:${participantId}`);
    keys.push(`session:${sessionCode}:${participantId}:selections`);
  });

  // Execute Lua script to atomically set EXPIREAT on all keys
  await redis.eval(refreshTtlScript, keys.length, ...keys, expireAt);

  return expireAt;
}

/**
 * Gets the ISO 8601 timestamp for when a session will expire
 * @param expireAt - Unix timestamp in seconds
 */
export function getExpiresAtISO(expireAt: number): string {
  return new Date(expireAt * 1000).toISOString();
}