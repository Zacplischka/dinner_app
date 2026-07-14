// SessionService unit tests - business rules exercised through a service
// instance built over an injected in-memory store and a stubbed restaurant
// search fn. No real Redis, no network, no module mocks.

import { logger } from '../../src/logger.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { config } from '../../src/config/index.js';
import { createSessionStore } from '../../src/store/sessionStore.js';
import { createSessionService, generateSessionCode, MAX_PARTICIPANTS } from '../../src/services/SessionService.js';
import { DomainError } from '../../src/services/DomainError.js';

describe('SessionService', () => {
  const testSessionCode = 'TEST1';
  const originalFrontendUrl = config.frontendUrl;

  let redis: Redis;
  let store: ReturnType<typeof createSessionStore>;
  let searchNearbyRestaurants: ReturnType<typeof vi.fn>;
  let SessionService: ReturnType<typeof createSessionService>;

  beforeEach(async () => {
    // ioredis-mock instances share one in-process data store; flush per test.
    redis = new RedisMock();
    await redis.flushall();
    store = createSessionStore(redis);
    searchNearbyRestaurants = vi.fn();
    SessionService = createSessionService({ store, searchNearbyRestaurants });

    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    config.frontendUrl = originalFrontendUrl;
    vi.restoreAllMocks();
  });

  describe('createSession code generation', () => {
    it('generates five-character uppercase alphanumeric codes', () => {
      expect(generateSessionCode()).toMatch(/^[A-Z0-9]{5}$/);
    });

    it('should log created sessions with operational context', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

      const result = await SessionService.createSession('Alice');

      expect(logSpy).toHaveBeenCalledWith({
        sessionCode: result.sessionCode,
        hasLocation: false,
        searchRadiusMiles: undefined,
        participantCount: 1,
        restaurantCount: 0,
      }, 'Session created');
    });

    it('should warn when session code generation collides', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await redis.hset('session:AAAAA', {
        hostId: 'existing-host',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      let calls = 0;
      const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
        calls++;
        return calls <= 5 ? 0 : 0.03;
      });

      const result = await SessionService.createSession('Alice');

      expect(result.sessionCode).toBe('BBBBB');
      expect(randomSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith({
        sessionCode: 'AAAAA',
        attempt: 1,
      }, 'Session code collision during createSession');
    });

    it('should fail after repeated session code collisions', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      await redis.hset('session:AAAAA', {
        hostId: 'existing-host',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(SessionService.createSession('Alice')).rejects.toThrow(
        'Failed to generate unique session code'
      );
      expect(errorSpy).toHaveBeenCalledWith({
        attempts: 10,
      }, 'Failed to generate unique session code');
    });
  });

  describe('getSession', () => {
    it('should return null when the session has no TTL', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await redis.hset(`session:${testSessionCode}`, {
        hostId: 'host-1',
        hostName: 'Alice',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });

      await expect(SessionService.getSession(testSessionCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith({
        sessionCode: testSessionCode,
        ttl: -1,
      }, 'Session lookup returned invalid TTL');
    });

    it('should prefer the joined host participant display name', async () => {
      config.frontendUrl = 'http://localhost:3000';
      const result = await SessionService.createSession('Original Host');
      await store.addParticipant(result.sessionCode, {
        participantId: 'host-participant',
        displayName: 'Joined Host',
        isHost: true,
      });

      const session = await SessionService.getSession(result.sessionCode);

      expect(session?.hostName).toBe('Joined Host');
      expect(session?.shareableLink).toBe(`http://localhost:3000/join?code=${result.sessionCode}`);
    });

    it('should use an unknown host fallback and custom frontend URL', async () => {
      config.frontendUrl = 'https://frontend.example.test';
      await redis.hset('session:NOHST', {
        hostId: 'host-1',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      await redis.expire('session:NOHST', 1800);

      const session = await SessionService.getSession('NOHST');

      expect(session?.hostName).toBe('Unknown Host');
      expect(session?.shareableLink).toBe('https://frontend.example.test/join?code=NOHST');
    });
  });

  describe('joinSession', () => {
    it('should reject missing sessions with a SESSION_NOT_FOUND domain error', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      const error = await SessionService.joinSession(testSessionCode, 'participant-1', 'Bob').then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('SESSION_NOT_FOUND');

      expect(warnSpy).toHaveBeenCalledWith({
        sessionCode: testSessionCode,
        participantId: 'participant-1',
        reason: 'session_not_found',
      }, 'Rejected session join');
    });

    it('should reject a fifth participant with a SESSION_FULL domain error', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-2', 'Bob');
      await SessionService.joinSession(session.sessionCode, 'socket-3', 'Cara');
      await SessionService.joinSession(session.sessionCode, 'socket-4', 'Dan');

      const error = await SessionService.joinSession(session.sessionCode, 'participant-5', 'Eve').then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('SESSION_FULL');
      expect(warnSpy).toHaveBeenCalledWith({
        sessionCode: session.sessionCode,
        participantId: 'participant-5',
        reason: 'session_full',
        participantCount: 4,
      }, 'Rejected session join');
    });

    it('should keep the host slot reserved: cap non-hosts at 3 but still admit the host', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-1', 'Bob');
      await SessionService.joinSession(session.sessionCode, 'socket-2', 'Cara');
      const third = await SessionService.joinSession(session.sessionCode, 'socket-3', 'Dan');
      expect(third.participantCount).toBe(4); // 3 joined + reserved host slot

      await expect(
        SessionService.joinSession(session.sessionCode, 'socket-4', 'Eve')
      ).rejects.toMatchObject({ code: 'SESSION_FULL' });

      const host = await SessionService.joinSession(session.sessionCode, 'host-socket', 'Alice');
      expect(host).toMatchObject({ isHost: true, participantCount: 4 });
    });

    it('should give the host slot to the joiner matching the session hostName', async () => {
      const session = await SessionService.createSession('Alice');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');

      expect(result.isHost).toBe(true);
      expect(result.participantCount).toBe(1);
      expect(result.participants).toEqual([
        expect.objectContaining({ participantId: 'socket-1', displayName: 'Alice', isHost: true }),
      ]);
    });

    it('should treat a same-name join as a rejoin that replaces the old participant', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-old', 'Alice');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-new', 'Alice');

      expect(result).toMatchObject({
        participantId: 'socket-new',
        participantCount: 1,
        isHost: true,
        isRejoin: true,
      });
      expect(result.participants).toEqual([
        expect.objectContaining({ participantId: 'socket-new', displayName: 'Alice', isHost: true }),
      ]);
      await expect(store.getParticipant('socket-old')).resolves.toBeNull();
    });

    it('should log successful joins with the updated participant count', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      const session = await SessionService.createSession('Alice');

      const result = await SessionService.joinSession(session.sessionCode, 'participant-1', 'Bob');

      expect(result).toMatchObject({
        participantId: 'participant-1',
        sessionCode: session.sessionCode,
        participantName: 'Bob',
        participantCount: 2,
        isHost: false,
        isRejoin: false,
      });
      expect(logSpy).toHaveBeenCalledWith({
        sessionCode: session.sessionCode,
        participantId: 'participant-1',
        participantCount: 2,
      }, 'Participant joined session');
    });
  });

  describe('joinSession race', () => {
    it('should roll back and reject when a concurrent join overfills the session', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const racyStore = {
        ...store,
        // simulate a concurrent join landing between the cap check and the add
        addParticipant: async (code: string, p: Parameters<typeof store.addParticipant>[1]) => {
          await store.addParticipant(code, p);
          return MAX_PARTICIPANTS + 1;
        },
      };
      const racyService = createSessionService({ store: racyStore, searchNearbyRestaurants });
      const session = await racyService.createSession('Alice');

      await expect(
        racyService.joinSession(session.sessionCode, 'late-socket', 'Alice')
      ).rejects.toMatchObject({ code: 'SESSION_FULL' });
      await expect(store.getParticipant('late-socket')).resolves.toBeNull();
    });
  });

  describe('createSession with location', () => {
    it('should create a shareable link from default and custom frontend URLs', async () => {
      delete process.env.FRONTEND_URL;

      const defaultResult = await SessionService.createSession('Alice');

      expect(defaultResult.shareableLink).toBe(
        `http://localhost:3000/join?code=${defaultResult.sessionCode}`
      );

      config.frontendUrl = 'https://frontend.example.test';

      const customResult = await SessionService.createSession('Bob');

      expect(customResult.shareableLink).toBe(
        `https://frontend.example.test/join?code=${customResult.sessionCode}`
      );
    });

    it('should search for nearby restaurants', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      const mockRestaurants = [
        { placeId: 'place1', name: 'Restaurant 1', rating: 4.5, priceLevel: 2, cuisineType: 'Italian', address: '123 Main St' },
        { placeId: 'place2', name: 'Restaurant 2', rating: 4.2, priceLevel: 3, cuisineType: 'Chinese', address: '456 Oak Ave' },
      ];
      searchNearbyRestaurants.mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      expect(searchNearbyRestaurants).toHaveBeenCalledWith({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: expect.closeTo(8046.7, 1), // 5 miles in meters (allow 1 meter tolerance)
        maxResults: 20,
      });

      expect(result.restaurantCount).toBe(2);
      expect(logSpy).toHaveBeenCalledWith({
        sessionCode: result.sessionCode,
        hasLocation: true,
        searchRadiusMiles: 5,
        participantCount: 1,
        restaurantCount: 2,
      }, 'Session created');
    });

    it('should store restaurant Place IDs in Redis Set', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const placeIds = await redis.smembers(`session:${result.sessionCode}:restaurant_ids`);
      expect(placeIds).toContain('place1');
    });

    it('should store full restaurant data in Redis Hash', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2, cuisineType: 'Italian' },
      ]);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const restaurantData = await redis.hget(
        `session:${result.sessionCode}:restaurants`,
        'place1'
      );

      const restaurant = JSON.parse(restaurantData!);
      expect(restaurant.name).toBe('R1');
      expect(restaurant.rating).toBe(4.5);
    });

    it('should throw error if no restaurants found', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      searchNearbyRestaurants.mockResolvedValue([]);

      const error = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      ).then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('NO_RESTAURANTS_FOUND');

      expect(warnSpy).toHaveBeenCalledWith({
        sessionCode: expect.any(String),
        searchRadiusMiles: 5,
      }, 'No restaurants found during session creation');
    });

    it('should set TTL on restaurant keys', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      const ttl = await redis.ttl(`session:${result.sessionCode}:restaurant_ids`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(1800); // 30 minutes
    });

    it('should convert miles to meters correctly', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);

      await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        10
      );

      expect(searchNearbyRestaurants).toHaveBeenCalledWith({
        latitude: 37.7749,
        longitude: -122.4194,
        radiusMeters: expect.closeTo(16093.4, 1), // 10 miles in meters (allow 1 meter tolerance)
        maxResults: 20,
      });
    });
  });

  describe('submitSelections', () => {
    async function createTwoParticipantSession(): Promise<string> {
      const { sessionCode } = await SessionService.createSession('Alice');
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      return sessionCode;
    }

    it('records a submission and returns counts without results while others are pending', async () => {
      const sessionCode = await createTwoParticipantSession();

      const result = await SessionService.submitSelections(sessionCode, 'p-alice', []);

      expect(result).toEqual({ submittedCount: 1, participantCount: 2 });
      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).not.toBe('complete');
    });

    it('computes results and marks the session complete when the last participant submits', async () => {
      const sessionCode = await createTwoParticipantSession();
      await SessionService.submitSelections(sessionCode, 'p-alice', []);

      const result = await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(result.submittedCount).toBe(2);
      expect(result.participantCount).toBe(2);
      expect(result.results).toMatchObject({ hasOverlap: false, overlappingOptions: [] });
      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).toBe('complete');
    });

    it('rejects submissions to missing sessions', async () => {
      await expect(
        SessionService.submitSelections('NOPE9', 'p-alice', [])
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('rejects submissions from non-participants', async () => {
      const sessionCode = await createTwoParticipantSession();

      await expect(
        SessionService.submitSelections(sessionCode, 'p-stranger', [])
      ).rejects.toMatchObject({ code: 'NOT_IN_SESSION' });
    });
  });

  describe('leaveSession', () => {
    async function createTwoParticipantSession(): Promise<string> {
      const { sessionCode } = await SessionService.createSession('Alice');
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      return sessionCode;
    }

    it('rejects leaves from missing sessions', async () => {
      await expect(
        SessionService.leaveSession('NOPE9', 'p-alice')
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('rejects leaves from non-participants', async () => {
      const sessionCode = await createTwoParticipantSession();

      await expect(
        SessionService.leaveSession(sessionCode, 'p-stranger')
      ).rejects.toMatchObject({ code: 'NOT_IN_SESSION' });
    });

    it('re-reserves the host slot when the host leaves', async () => {
      const sessionCode = await createTwoParticipantSession();

      const result = await SessionService.leaveSession(sessionCode, 'p-alice');

      // 1 remaining + the host slot reserved again, matching joinSession's rule
      expect(result).toMatchObject({ displayName: 'Alice', participantCount: 2 });
      const session = await SessionService.getSession(sessionCode);
      expect(session?.participantCount).toBe(2);
    });

    it('persists the reduced participantCount', async () => {
      const sessionCode = await createTwoParticipantSession();

      const result = await SessionService.leaveSession(sessionCode, 'p-bob');

      expect(result).toMatchObject({ displayName: 'Bob', participantCount: 1 });
      expect(result.results).toBeUndefined();
      const session = await SessionService.getSession(sessionCode);
      expect(session?.participantCount).toBe(1);
    });

    it('completes the session when everyone remaining has submitted', async () => {
      const sessionCode = await createTwoParticipantSession();
      await SessionService.submitSelections(sessionCode, 'p-alice', []);

      const { results } = await SessionService.leaveSession(sessionCode, 'p-bob');

      expect(results).toMatchObject({ hasOverlap: false, overlappingOptions: [] });
      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).toBe('complete');
    });

    it('does not recompute results when the session is already complete', async () => {
      const sessionCode = await createTwoParticipantSession();
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      await SessionService.submitSelections(sessionCode, 'p-bob', []);

      const { results } = await SessionService.leaveSession(sessionCode, 'p-bob');

      expect(results).toBeUndefined();
    });
  });

  describe('restartSession', () => {
    it('rejects restarts from missing sessions', async () => {
      await expect(
        SessionService.restartSession('NOPE9', 'p-alice')
      ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    });

    it('rejects restarts from non-participants', async () => {
      const { sessionCode } = await SessionService.createSession('Alice');

      await expect(
        SessionService.restartSession(sessionCode, 'p-stranger')
      ).rejects.toMatchObject({ code: 'NOT_IN_SESSION' });
    });

    it('wipes submissions and puts the session back in selecting', async () => {
      const { sessionCode } = await SessionService.createSession('Alice');
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.submitSelections(sessionCode, 'p-alice', []);

      await SessionService.restartSession(sessionCode, 'p-alice');

      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).toBe('selecting');
    });
  });
});
