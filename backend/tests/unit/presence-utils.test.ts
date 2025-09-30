// Unit tests for presence utility functions
// Tests Redis-based online/offline participant tracking

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { redis } from '../../src/redis/client.js';
import {
  markParticipantOnline,
  markParticipantOffline,
  isParticipantOnline,
  getOnlineParticipants,
  getParticipantsOnlineStatus,
  clearOnlineParticipants,
} from '../../src/redis/presence-utils.js';

const TEST_SESSION = 'TEST01';
const PARTICIPANT_1 = 'socket-id-1';
const PARTICIPANT_2 = 'socket-id-2';
const PARTICIPANT_3 = 'socket-id-3';

describe('Presence Utilities', () => {
  beforeEach(async () => {
    // Clean up test data before each test
    await redis.del(`session:${TEST_SESSION}:online`);
  });

  afterAll(async () => {
    // Clean up after all tests
    await redis.del(`session:${TEST_SESSION}:online`);
  });

  it('should mark participant as online', async () => {
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);

    const isOnline = await isParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    expect(isOnline).toBe(true);
  });

  it('should mark participant as offline', async () => {
    // First mark as online
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    expect(await isParticipantOnline(TEST_SESSION, PARTICIPANT_1)).toBe(true);

    // Then mark as offline
    await markParticipantOffline(TEST_SESSION, PARTICIPANT_1);
    expect(await isParticipantOnline(TEST_SESSION, PARTICIPANT_1)).toBe(false);
  });

  it('should return false for participant who was never online', async () => {
    const isOnline = await isParticipantOnline(TEST_SESSION, 'never-joined');
    expect(isOnline).toBe(false);
  });

  it('should get all online participants', async () => {
    // Mark multiple participants as online
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_2);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_3);

    const onlineParticipants = await getOnlineParticipants(TEST_SESSION);
    expect(onlineParticipants).toHaveLength(3);
    expect(onlineParticipants).toContain(PARTICIPANT_1);
    expect(onlineParticipants).toContain(PARTICIPANT_2);
    expect(onlineParticipants).toContain(PARTICIPANT_3);
  });

  it('should get online status for multiple participants', async () => {
    // Mark some participants as online
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_3);

    const status = await getParticipantsOnlineStatus(TEST_SESSION, [
      PARTICIPANT_1,
      PARTICIPANT_2,
      PARTICIPANT_3,
    ]);

    expect(status[PARTICIPANT_1]).toBe(true);
    expect(status[PARTICIPANT_2]).toBe(false);
    expect(status[PARTICIPANT_3]).toBe(true);
  });

  it('should return empty object for empty participant list', async () => {
    const status = await getParticipantsOnlineStatus(TEST_SESSION, []);
    expect(status).toEqual({});
  });

  it('should clear all online participants', async () => {
    // Mark multiple participants as online
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_2);

    expect(await getOnlineParticipants(TEST_SESSION)).toHaveLength(2);

    // Clear all
    await clearOnlineParticipants(TEST_SESSION);

    expect(await getOnlineParticipants(TEST_SESSION)).toHaveLength(0);
  });

  it('should handle marking same participant online multiple times', async () => {
    // Mark participant online multiple times (idempotent)
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    await markParticipantOnline(TEST_SESSION, PARTICIPANT_1);

    const onlineParticipants = await getOnlineParticipants(TEST_SESSION);
    expect(onlineParticipants).toHaveLength(1);
    expect(onlineParticipants[0]).toBe(PARTICIPANT_1);
  });

  it('should handle marking offline participant offline', async () => {
    // Mark participant offline who was never online (no-op)
    await markParticipantOffline(TEST_SESSION, PARTICIPANT_1);

    const isOnline = await isParticipantOnline(TEST_SESSION, PARTICIPANT_1);
    expect(isOnline).toBe(false);
  });
});