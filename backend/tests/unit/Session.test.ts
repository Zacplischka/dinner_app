import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Session from '../../src/models/Session.js';
import { redis } from '../../src/redis/client.js';

describe('Session Model', () => {
  const testSessionCode = 'TEST123';

  afterEach(async () => {
    // Clean up test data
    await redis.del(`session:${testSessionCode}`);
  });

  describe('createSession with location', () => {
    it('should store location data in Redis', async () => {
      const sessionCode = testSessionCode;
      const hostId = 'socket-id';
      const location = {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      };
      const searchRadiusMiles = 5;

      await Session.createSession(sessionCode, hostId, 'Alice', location, searchRadiusMiles);

      const sessionData = await redis.hgetall(`session:${sessionCode}`);
      expect(sessionData.locationLat).toBe('37.7749');
      expect(sessionData.locationLng).toBe('-122.4194');
      expect(sessionData.locationAddress).toBe('San Francisco, CA');
      expect(sessionData.searchRadiusMiles).toBe('5');
    });

    it('should retrieve location data from Redis', async () => {
      const sessionCode = testSessionCode;
      const location = {
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      };

      await Session.createSession(sessionCode, 'socket-id', 'Alice', location, 5);

      const session = await Session.getSession(sessionCode);
      expect(session?.location).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
        address: 'San Francisco, CA',
      });
      expect(session?.searchRadiusMiles).toBe(5);
    });

    it('should handle session without location (backward compatibility)', async () => {
      const sessionCode = testSessionCode;
      await Session.createSession(sessionCode, 'socket-id', 'Alice');

      const session = await Session.getSession(sessionCode);
      expect(session?.location).toBeUndefined();
      expect(session?.searchRadiusMiles).toBeUndefined();
    });
  });

  describe('createSession without location', () => {
    it('should create session with basic fields', async () => {
      const sessionCode = testSessionCode;
      const hostId = 'socket-id';

      const session = await Session.createSession(sessionCode, hostId, 'Alice');

      expect(session.sessionCode).toBe(sessionCode);
      expect(session.hostId).toBe(hostId);
      expect(session.state).toBe('waiting');
      expect(session.participantCount).toBe(1);
      expect(session.hostName).toBe('Alice');
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', async () => {
      const session = await Session.getSession('NONEXIST');
      expect(session).toBeNull();
    });
  });
});
