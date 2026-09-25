// SessionService unit tests - business rules exercised through a service
// instance built over an injected in-memory store and a stubbed restaurant
// search fn. No real Redis, no network, no module mocks.

import { logger } from '../../src/logger.js';
import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { config } from '../../src/config/index.js';
import { createSessionStore } from '../../src/store/sessionStore.js';
import {
  createSessionService,
  generateSessionCode,
  MAX_PARTICIPANTS,
  type SessionServiceDeps,
} from '../../src/services/SessionService.js';
import { DomainError } from '../../src/services/DomainError.js';
import { createOrderService } from '../../src/services/OrderService.js';
import { SESSION_CODE_PATTERN, type Movie, type Recipe } from '@dinder/shared/types';
import { startedSession } from '../helpers/startedSession.js';

describe('SessionService', () => {
  const testSessionCode = 'TEST1';
  const originalFrontendUrl = config.frontendUrl;

  let redis: Redis;
  let store: ReturnType<typeof createSessionStore>;
  // Typed against the deps they stand in for, so a dependency that changes
  // shape fails here instead of passing wired wrong (#397).
  let searchNearbyRestaurants: MockedFunction<SessionServiceDeps['searchNearbyRestaurants']>;
  let dealRecipeDeck: MockedFunction<SessionServiceDeps['dealRecipeDeck']>;
  let redealMovieDeck: MockedFunction<SessionServiceDeps['redealMovieDeck']>;
  let mintShoppingList: MockedFunction<SessionServiceDeps['mintShoppingList']>;
  let SessionService: ReturnType<typeof createSessionService>;

  beforeEach(async () => {
    // ioredis-mock instances share one in-process data store; flush per test.
    redis = new RedisMock();
    await redis.flushall();
    store = createSessionStore(redis);
    searchNearbyRestaurants = vi.fn();
    dealRecipeDeck = vi.fn();
    redealMovieDeck = vi.fn();
    mintShoppingList = vi.fn(
      async (_sessionCode: string, _placeId: string): Promise<string | undefined> => undefined
    );
    SessionService = createSessionService({
      store,
      searchNearbyRestaurants,
      dealRecipeDeck,
      redealMovieDeck,
      mintShoppingList,
    });

    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    config.frontendUrl = originalFrontendUrl;
    vi.restoreAllMocks();
  });

  describe('createSession code generation', () => {
    it('generates five-character codes from the read-aloud-safe alphabet', () => {
      // No 0/O, 1/I, 5/S, 8/B or 2/Z — and still within the wire pattern.
      for (let i = 0; i < 500; i++) {
        const code = generateSessionCode();
        expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ34679]{5}$/);
        expect(code).toMatch(SESSION_CODE_PATTERN);
      }
    });

    it('should log created sessions with operational context', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

      const result = await SessionService.createSession('Alice');

      expect(logSpy).toHaveBeenCalledWith(
        {
          sessionCode: result.sessionCode,
          hasLocation: false,
          searchRadiusMiles: undefined,
          participantCount: 1,
        },
        'Session created'
      );
    });

    it('should warn when session code generation collides', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await redis.hset('session:AAAAA', {
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      let calls = 0;
      const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
        calls++;
        return calls <= 5 ? 0 : 0.04; // index 1 → B in the 29-symbol alphabet
      });

      const result = await SessionService.createSession('Alice');

      expect(result.sessionCode).toBe('BBBBB');
      expect(randomSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode: 'AAAAA',
          attempt: 1,
        },
        'Session code collision during createSession'
      );
    });

    it('should fail after repeated session code collisions', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      await redis.hset('session:AAAAA', {
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });
      vi.spyOn(Math, 'random').mockReturnValue(0);

      await expect(SessionService.createSession('Alice')).rejects.toThrow(
        'Failed to generate unique session code'
      );
      expect(errorSpy).toHaveBeenCalledWith(
        {
          attempts: 10,
        },
        'Failed to generate unique session code'
      );
    });
  });

  describe('getSession', () => {
    it('should return null when the session has no TTL', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await redis.hset(`session:${testSessionCode}`, {
        hostName: 'Alice',
        state: 'waiting',
        participantCount: '1',
        createdAt: '1700000000',
        lastActivityAt: '1700000000',
      });

      await expect(SessionService.getSession(testSessionCode)).resolves.toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode: testSessionCode,
          ttl: -1,
        },
        'Session lookup returned invalid TTL'
      );
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
    const place1 = [{ placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 }];

    it('should reject missing sessions with a SESSION_NOT_FOUND domain error', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      const error = await SessionService.joinSession(testSessionCode, 'participant-1', 'Bob').then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('SESSION_NOT_FOUND');

      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode: testSessionCode,
          participantId: 'participant-1',
          reason: 'session_not_found',
        },
        'Rejected session join'
      );
    });

    it('should reject a fifth participant with a SESSION_FULL domain error', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-2', 'Bob');
      await SessionService.joinSession(session.sessionCode, 'socket-3', 'Cara');
      await SessionService.joinSession(session.sessionCode, 'socket-4', 'Dan');

      const error = await SessionService.joinSession(
        session.sessionCode,
        'participant-5',
        'Eve'
      ).then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('SESSION_FULL');
      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode: session.sessionCode,
          participantId: 'participant-5',
          reason: 'session_full',
          participantCount: 4,
        },
        'Rejected session join'
      );
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

    it('should reject a duplicate name without its rejoin token and keep the original host', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-old', 'Alice');

      await expect(
        SessionService.joinSession(session.sessionCode, 'socket-impostor', 'Alice')
      ).rejects.toMatchObject({ code: 'DISPLAY_NAME_TAKEN' });

      await expect(store.getParticipant('socket-old')).resolves.toMatchObject({
        displayName: 'Alice',
        isHost: true,
      });
      await expect(store.getParticipant('socket-impostor')).resolves.toBeNull();
    });

    it('should allow a token-authorized rejoin after the session starts', async () => {
      const session = await SessionService.createSession('Alice');
      const firstJoin = await SessionService.joinSession(
        session.sessionCode,
        'socket-old',
        'Alice'
      );
      await store.updateState(session.sessionCode, 'selecting');

      const result = await SessionService.joinSession(
        session.sessionCode,
        'socket-new',
        'Alice',
        firstJoin.rejoinToken
      );

      expect(result).toMatchObject({
        participantId: 'socket-new',
        participantCount: 1,
        isHost: true,
        isRejoin: true,
        rejoinToken: firstJoin.rejoinToken,
      });
      expect(result.participants).toEqual([
        expect.objectContaining({
          participantId: 'socket-new',
          displayName: 'Alice',
          isHost: true,
        }),
      ]);
      await expect(store.getParticipant('socket-old')).resolves.toBeNull();
    });

    it('should preserve an already-recorded Submission across a token-matched rejoin with a new socket id', async () => {
      await startedSession(store, testSessionCode, place1);
      const session = { sessionCode: testSessionCode };

      const firstJoin = await SessionService.joinSession(
        session.sessionCode,
        'socket-alice',
        'Alice'
      );
      await SessionService.joinSession(session.sessionCode, 'p-bob', 'Bob');

      const submitResult = await SessionService.submitSelections(
        session.sessionCode,
        'socket-alice',
        ['place1']
      );
      expect(submitResult).toMatchObject({ submittedCount: 1, participantCount: 2 });
      expect(submitResult.results).toBeUndefined();

      // Past the 2-minute recovery window: a brand-new socket id.
      const rejoin = await SessionService.joinSession(
        session.sessionCode,
        'socket-alice-2',
        'Alice',
        firstJoin.rejoinToken
      );
      expect(rejoin.isRejoin).toBe(true);

      await expect(store.getParticipant('socket-alice-2')).resolves.toMatchObject({
        hasSubmitted: true,
      });
      await expect(
        redis.smembers(`session:${session.sessionCode}:socket-alice-2:selections`)
      ).resolves.toEqual(['place1']);

      // The rejoiner's carried Submission must still count towards completion.
      const bobSubmit = await SessionService.submitSelections(session.sessionCode, 'p-bob', [
        'place1',
      ]);
      expect(bobSubmit.submittedCount).toBe(2);
      expect(bobSubmit.results?.overlappingOptions).toEqual(
        expect.arrayContaining([expect.objectContaining({ placeId: 'place1' })])
      );
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    // #258: the Branch decides what a Participant's results screen offers, and
    // the join ack is the one place every Participant — host and joiner — passes
    // through, so it carries it.
    it('should carry the Session Branch on the join ack', async () => {
      const session = await SessionService.createSession('Alice', { branch: 'eatout' });

      const result = await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');

      expect(result.branch).toBe('eatout');
    });

    // A create naming no Branch predates the fork, when every Session was Eat Out.
    it('should open a create that names no Branch as an Eat Out lobby', async () => {
      const session = await SessionService.createSession('Alice');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');

      expect(result).toMatchObject({ branch: 'eatout', state: 'waiting' });
      expect(result.lobby).toMatchObject({ branch: 'eatout', deckSize: 20 });
    });

    // #284: the Invite Link's rule — anyone holding it can join while the
    // Session lives. Only the terminal states refuse.
    it('should admit a brand-new participant while the session is selecting', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await store.updateState(session.sessionCode, 'selecting');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');

      expect(result).toMatchObject({ participantCount: 2, isRejoin: false, state: 'selecting' });
      await expect(store.getParticipant('socket-bob')).resolves.toMatchObject({
        displayName: 'Bob',
      });
    });

    it('should keep a late joiner from completing until they submit, without touching prior Submissions', async () => {
      await startedSession(store, testSessionCode, place1);
      const session = { sessionCode: testSessionCode };
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      const first = await SessionService.submitSelections(session.sessionCode, 'socket-alice', [
        'place1',
      ]);
      expect(first).toMatchObject({ submittedCount: 1, participantCount: 2 });

      // Cara arrives mid-Deck: the denominator grows, nothing already recorded moves.
      await SessionService.joinSession(session.sessionCode, 'socket-cara', 'Cara');
      await expect(store.getParticipant('socket-alice')).resolves.toMatchObject({
        hasSubmitted: true, // joining resets nothing
      });

      // Bob was the last holdout before the join — his Submission no longer completes.
      const second = await SessionService.submitSelections(session.sessionCode, 'socket-bob', [
        'place1',
      ]);
      expect(second).toMatchObject({ submittedCount: 2, participantCount: 3 });
      expect(second.results).toBeUndefined();

      const third = await SessionService.submitSelections(session.sessionCode, 'socket-cara', [
        'place1',
      ]);
      expect(third).toMatchObject({ submittedCount: 3, participantCount: 3 });
      expect(third.results?.allSelections).toMatchObject({
        Alice: ['place1'],
        Bob: ['place1'],
        Cara: ['place1'],
      });
    });

    it('should tell a joiner who already submitted from the ack participants', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(session.sessionCode, 'selecting');
      await SessionService.submitSelections(session.sessionCode, 'socket-alice', []);

      const result = await SessionService.joinSession(session.sessionCode, 'socket-cara', 'Cara');

      expect(result.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ displayName: 'Alice', hasSubmitted: true }),
          expect.objectContaining({ displayName: 'Bob', hasSubmitted: false }),
          expect.objectContaining({ displayName: 'Cara', hasSubmitted: false }),
        ])
      );
    });

    it('should tell a joiner who has dropped from the ack participants', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.markDisconnected('socket-alice');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-cara', 'Cara');

      expect(result.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ displayName: 'Alice', isOnline: false }),
          expect.objectContaining({ displayName: 'Bob', isOnline: true }),
          expect.objectContaining({ displayName: 'Cara', isOnline: true }),
        ])
      );
    });

    it('should still refuse a fifth participant when the session is selecting', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await SessionService.joinSession(session.sessionCode, 'socket-cara', 'Cara');
      await SessionService.joinSession(session.sessionCode, 'socket-dan', 'Dan');
      await store.updateState(session.sessionCode, 'selecting');

      await expect(
        SessionService.joinSession(session.sessionCode, 'socket-eve', 'Eve')
      ).rejects.toMatchObject({ code: 'SESSION_FULL' });
    });

    it('should complete the session for those remaining when a late joiner leaves without submitting', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(session.sessionCode, 'selecting');
      await SessionService.submitSelections(session.sessionCode, 'socket-alice', []);
      await SessionService.joinSession(session.sessionCode, 'socket-cara', 'Cara');
      await SessionService.submitSelections(session.sessionCode, 'socket-bob', []);
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'selecting', // Cara is the last holdout
      });

      const left = await SessionService.leaveSession(session.sessionCode, 'socket-cara');

      expect(left.results).toBeDefined();
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    it('should refuse a complete session saying it has finished, not started', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await store.updateState(session.sessionCode, 'complete');

      await expect(
        SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob')
      ).rejects.toMatchObject({
        code: 'SESSION_ALREADY_STARTED',
        message: 'This session has finished',
      });
      await expect(store.getParticipant('socket-bob')).resolves.toBeNull();
    });

    it('should refuse an expired session', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await store.updateState(session.sessionCode, 'expired');

      await expect(
        SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob')
      ).rejects.toMatchObject({ code: 'SESSION_ALREADY_STARTED' });
      await expect(store.getParticipant('socket-bob')).resolves.toBeNull();
    });

    it('should still admit a rejoin with a valid token in a complete session, carrying the Submission', async () => {
      await startedSession(store, testSessionCode, place1);
      const session = { sessionCode: testSessionCode };
      const joined = await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await SessionService.submitSelections(session.sessionCode, 'socket-alice', ['place1']);
      await SessionService.submitSelections(session.sessionCode, 'socket-bob', ['place1']);
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });

      const rejoin = await SessionService.joinSession(
        session.sessionCode,
        'socket-alice-2',
        'Alice',
        joined.rejoinToken
      );

      expect(rejoin).toMatchObject({ isRejoin: true, state: 'complete' });
      await expect(store.getParticipant('socket-alice-2')).resolves.toMatchObject({
        hasSubmitted: true,
      });
    });

    // #283's flip side: joining a new Session leaves the old one for real, or
    // the old Session's completion waits forever on someone who left.
    it('should remove a participant from their old session when they join another', async () => {
      const first = await SessionService.createSession('Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-bob', 'Bob');
      const second = await SessionService.createSession('Cara');

      const result = await SessionService.joinSession(second.sessionCode, 'socket-bob', 'Bob');

      expect(result.leftSession).toMatchObject({
        sessionCode: first.sessionCode,
        displayName: 'Bob',
        participantCount: 1,
      });
      expect(result.leftSession?.results).toBeUndefined();
      await expect(store.isParticipant(first.sessionCode, 'socket-bob')).resolves.toBe(false);
      await expect(store.readSession(first.sessionCode)).resolves.toMatchObject({
        participantCount: 1,
      });
    });

    it('should complete the old session when its last holdout joins another', async () => {
      await startedSession(store, testSessionCode, place1);
      const first = { sessionCode: testSessionCode };
      await SessionService.joinSession(first.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-bob', 'Bob');
      await SessionService.submitSelections(first.sessionCode, 'socket-alice', ['place1']);
      const second = await SessionService.createSession('Cara');

      const result = await SessionService.joinSession(second.sessionCode, 'socket-bob', 'Bob');

      expect(result.leftSession?.results?.allSelections).toEqual({ Alice: ['place1'] });
      await expect(store.readSession(first.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    // #284 review: the closing Submission now sits inside the join's
    // read-then-add window — a Session that completes mid-join must back the
    // joiner out, mirroring the capacity re-check.
    it('should back out a joiner when the session completes while the join is in flight', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await store.updateState(session.sessionCode, 'selecting');

      const racyStore = {
        ...store,
        addParticipant: async (code: string, p: Parameters<typeof store.addParticipant>[1]) => {
          const size = await store.addParticipant(code, p);
          // The last holdout's Submission lands right after the add.
          await store.updateState(code, 'complete');
          return size;
        },
      };
      const racyService = createSessionService({
        store: racyStore,
        searchNearbyRestaurants,
        dealRecipeDeck,
        redealMovieDeck,
        mintShoppingList,
      });

      await expect(
        racyService.joinSession(session.sessionCode, 'socket-bob', 'Bob')
      ).rejects.toMatchObject({
        code: 'SESSION_ALREADY_STARTED',
        message: 'This session has finished',
      });
      await expect(store.isParticipant(session.sessionCode, 'socket-bob')).resolves.toBe(false);
    });

    // #284 review: the other half of the same race — a Participant who slipped
    // in beside the closing Submission must not re-complete the Session and
    // overwrite the broadcast Match with a narrower one.
    it('should refuse a submit that lands on an already-complete session', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(session.sessionCode, 'selecting');
      await SessionService.submitSelections(session.sessionCode, 'socket-alice', []);
      // The race resolved against Bob: the session completed without him.
      await store.updateState(session.sessionCode, 'complete');

      await expect(
        SessionService.submitSelections(session.sessionCode, 'socket-bob', [])
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(store.getParticipant('socket-bob')).resolves.toMatchObject({
        hasSubmitted: false,
      });
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    // #284 review: a refusal AFTER the old-Session departure committed must
    // still carry the departure, so the transport can tell the old room.
    it('should carry the committed old-session departure on a post-add refusal', async () => {
      await startedSession(store, testSessionCode, place1);
      const first = { sessionCode: testSessionCode };
      await SessionService.joinSession(first.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-bob', 'Bob');
      await SessionService.submitSelections(first.sessionCode, 'socket-alice', ['place1']);

      const second = await SessionService.createSession('Cara');
      await SessionService.joinSession(second.sessionCode, 'socket-cara', 'Cara');

      const racyStore = {
        ...store,
        addParticipant: async (code: string, p: Parameters<typeof store.addParticipant>[1]) => {
          // Concurrent joins slip in between the pre-check and this add.
          await store.addParticipant(code, { participantId: 'race-1', displayName: 'R1' });
          await store.addParticipant(code, { participantId: 'race-2', displayName: 'R2' });
          await store.addParticipant(code, { participantId: 'race-3', displayName: 'R3' });
          return store.addParticipant(code, p);
        },
      };
      const racyService = createSessionService({
        store: racyStore,
        searchNearbyRestaurants,
        dealRecipeDeck,
        redealMovieDeck,
        mintShoppingList,
      });

      // Bob (last holdout of `first`) tries the full second session.
      const outcome = await racyService
        .joinSession(second.sessionCode, 'socket-bob', 'Bob')
        .then(() => {
          throw new Error('expected SESSION_FULL');
        })
        .catch((error: unknown) => error as DomainError & { leftSession?: unknown });

      expect(outcome).toMatchObject({ code: 'SESSION_FULL' });
      expect(outcome.leftSession).toMatchObject({ sessionCode: first.sessionCode });
      expect(
        (outcome.leftSession as { results?: { allSelections: unknown } }).results?.allSelections
      ).toEqual({ Alice: ['place1'] });
      // The departure really committed: the old session completed without Bob.
      await expect(store.readSession(first.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    it('should not report a left session when rejoining the same session', async () => {
      const session = await SessionService.createSession('Alice');
      const joined = await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');

      const rejoin = await SessionService.joinSession(
        session.sessionCode,
        'socket-alice-2',
        'Alice',
        joined.rejoinToken
      );

      expect(rejoin.leftSession).toBeUndefined();
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
      expect(logSpy).toHaveBeenCalledWith(
        {
          sessionCode: session.sessionCode,
          participantId: 'participant-1',
          participantCount: 2,
        },
        'Participant joined session'
      );
    });
  });

  describe('joinSession race', () => {
    it('should reject one of two concurrent joins claiming the same display name', async () => {
      const session = await SessionService.createSession('Alice');

      const outcomes = await Promise.allSettled([
        SessionService.joinSession(session.sessionCode, 'socket-bob-1', 'Bob'),
        SessionService.joinSession(session.sessionCode, 'socket-bob-2', 'Bob'),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejection = outcomes.find((outcome) => outcome.status === 'rejected');
      expect(rejection).toMatchObject({ reason: { code: 'DISPLAY_NAME_TAKEN' } });
      expect(
        (await store.listParticipants(session.sessionCode)).filter(
          (participant) => participant.displayName === 'Bob'
        )
      ).toHaveLength(1);
    });

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
      const racyService = createSessionService({
        store: racyStore,
        searchNearbyRestaurants,
        dealRecipeDeck,
        redealMovieDeck,
        mintShoppingList,
      });
      const session = await racyService.createSession('Alice');

      await expect(
        racyService.joinSession(session.sessionCode, 'late-socket', 'Alice')
      ).rejects.toMatchObject({ code: 'SESSION_FULL' });
      await expect(store.getParticipant('late-socket')).resolves.toBeNull();
    });
  });

  describe('createSession', () => {
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

    it('should store the Branch default Deck size, or the size the Host asked for', async () => {
      const sizes = [];
      for (const branch of ['eatout', 'takeaway', 'cook', 'watch'] as const) {
        const { sessionCode } = await SessionService.createSession('Alice', { branch });
        sizes.push((await store.readSession(sessionCode))?.deckSize);
      }
      const chosen = await SessionService.createSession('Alice', { branch: 'cook', deckSize: 8 });

      expect(sizes).toEqual([20, 20, 15, 15]);
      expect((await store.readSession(chosen.sessionCode))?.deckSize).toBe(8);
    });

    it('should seed a Cook lobby with the meal type and Headcount it was created with', async () => {
      const { sessionCode, lobby } = await SessionService.createSession('Alice', {
        branch: 'cook',
        mealType: 'dessert',
        headcount: 6,
      });

      expect(lobby).toMatchObject({ branch: 'cook', mealType: 'dessert', headcount: 6 });
      expect((await store.readSession(sessionCode))?.headcount).toBe(6);
    });
  });

  describe('submitSelections', () => {
    async function createTwoParticipantSession(): Promise<string> {
      await startedSession(store, testSessionCode, []);
      await SessionService.joinSession(testSessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(testSessionCode, 'p-bob', 'Bob');
      return testSessionCode;
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
      await expect(SessionService.submitSelections('NOPE9', 'p-alice', [])).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
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
      await startedSession(store, testSessionCode, []);
      await SessionService.joinSession(testSessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(testSessionCode, 'p-bob', 'Bob');
      return testSessionCode;
    }

    it('rejects leaves from missing sessions', async () => {
      await expect(SessionService.leaveSession('NOPE9', 'p-alice')).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('rejects leaves from non-participants', async () => {
      const sessionCode = await createTwoParticipantSession();

      await expect(SessionService.leaveSession(sessionCode, 'p-stranger')).rejects.toMatchObject({
        code: 'NOT_IN_SESSION',
      });
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

  // #506: a Leave on a complete Session deletes the leaver's Selections, so a
  // rejoin that recomputed the Match over whoever is left could flip the Top
  // Pick away from the one everyone was shown.
  describe('a completed Session rejoined after a Leave', () => {
    async function completeAliceAndBob(): Promise<{
      sessionCode: string;
      rejoinToken: string;
      broadcast: Awaited<ReturnType<typeof SessionService.submitSelections>>['results'];
    }> {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, [
        { placeId: 'A', name: 'Apple Bistro', rating: 4.9 },
        { placeId: 'B', name: 'Bean Bar', rating: 4.0 },
        { placeId: 'C', name: 'Curry Club', rating: 4.5 },
      ]);
      const { rejoinToken } = await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      await SessionService.submitSelections(sessionCode, 'p-alice', ['A', 'B']);
      const { results: broadcast } = await SessionService.submitSelections(sessionCode, 'p-bob', [
        'B',
        'C',
      ]);
      return { sessionCode, rejoinToken, broadcast };
    }

    it('hands the rejoiner exactly the outcome that was broadcast', async () => {
      const { sessionCode, rejoinToken, broadcast } = await completeAliceAndBob();
      expect(broadcast?.topPick?.restaurant.placeId).toBe('B');

      await SessionService.leaveSession(sessionCode, 'p-bob');
      const rejoin = await SessionService.joinSession(
        sessionCode,
        'p-alice-2',
        'Alice',
        rejoinToken
      );

      expect(rejoin.results).toEqual({ sessionCode, ...broadcast });
    });

    it('recomputes when the stored outcome is unreadable, rather than failing the rejoin', async () => {
      const { sessionCode, rejoinToken, broadcast } = await completeAliceAndBob();
      await redis.hset(`session:${sessionCode}`, 'completedResults', '{not json');

      const rejoin = await SessionService.joinSession(
        sessionCode,
        'p-alice-2',
        'Alice',
        rejoinToken
      );

      // Nobody Left, so the recompute still matches the broadcast.
      expect(rejoin.results).toEqual({ sessionCode, ...broadcast });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ sessionCode }),
        'Stored Session outcome unreadable, recomputing'
      );
    });

    it('lets the rejoiner open the Group Order on their Top Pick', async () => {
      const { sessionCode, rejoinToken } = await completeAliceAndBob();
      await SessionService.leaveSession(sessionCode, 'p-bob');
      const rejoin = await SessionService.joinSession(
        sessionCode,
        'p-alice-2',
        'Alice',
        rejoinToken
      );

      // No Snapshot, so the order answers stale — past the outcome gate, not refused by it.
      const orders = createOrderService({ store, snapshotStore: { getLatest: async () => null } });
      await expect(
        orders.open(sessionCode, 'p-alice-2', rejoin.results?.topPick?.restaurant.placeId ?? '')
      ).resolves.toMatchObject({ reason: 'stale' });
    });

    it("keeps a Cook rejoiner's Top Pick on the Recipe its Shopping List was minted for", async () => {
      mintShoppingList.mockImplementation((sessionCode) =>
        store.claimShoppingListId(sessionCode, 'list-1')
      );
      const sessionCode = 'COOK1';
      await startedSession(store, sessionCode, [
        { kind: 'recipe', placeId: 'recA', name: 'Aglio e Olio', aggregateLikes: 900 },
        { kind: 'recipe', placeId: 'recB', name: 'Beef Rendang', aggregateLikes: 100 },
        { kind: 'recipe', placeId: 'recC', name: 'Caponata', aggregateLikes: 500 },
      ]);
      const { rejoinToken } = await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      await SessionService.submitSelections(sessionCode, 'p-alice', ['recA', 'recB']);
      await SessionService.submitSelections(sessionCode, 'p-bob', ['recB', 'recC']);

      await SessionService.leaveSession(sessionCode, 'p-bob');
      const rejoin = await SessionService.joinSession(
        sessionCode,
        'p-alice-2',
        'Alice',
        rejoinToken
      );

      expect(mintShoppingList).toHaveBeenCalledTimes(1);
      expect(mintShoppingList).toHaveBeenCalledWith(
        sessionCode,
        rejoin.results?.topPick?.restaurant.placeId
      );
      expect(rejoin.results?.shoppingListId).toBe('list-1');
    });

    // The window between a completion marking the Session complete and storing
    // its outcome must not serve the previous round's.
    it('forgets the outcome on Restart', async () => {
      const { sessionCode, rejoinToken } = await completeAliceAndBob();
      await SessionService.restartSession(sessionCode, 'p-alice');
      await store.updateState(sessionCode, 'complete');

      const rejoin = await SessionService.joinSession(
        sessionCode,
        'p-alice-2',
        'Alice',
        rejoinToken
      );

      expect(rejoin.results).toMatchObject({ overlappingOptions: [], hasOverlap: false });
    });
  });

  describe('Top Pick', () => {
    async function createSessionWithDeck(
      restaurants: Array<{
        placeId: string;
        name: string;
        rating?: number;
        openNow?: boolean;
      }>
    ): Promise<string> {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, restaurants);
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      return sessionCode;
    }

    async function createThreeParticipantSessionWithDeck(
      restaurants: Array<{
        placeId: string;
        name: string;
        rating?: number;
        openNow?: boolean;
      }>
    ): Promise<string> {
      const sessionCode = await createSessionWithDeck(restaurants);
      await SessionService.joinSession(sessionCode, 'p-cara', 'Cara');
      return sessionCode;
    }

    it('crowns the highest-rated Match member when the Match is non-empty', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.8 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1', 'r2']);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['r1', 'r2']);

      expect(results?.hasOverlap).toBe(true);
      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r2' }),
        likedBy: 2,
        of: 2,
      });
    });

    it('crowns the most-selected Restaurant when the Match is empty', async () => {
      const sessionCode = await createThreeParticipantSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.2 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      await SessionService.submitSelections(sessionCode, 'p-bob', ['r1']);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-cara', ['r2']);

      expect(results?.hasOverlap).toBe(false);
      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r1' }),
        likedBy: 2,
        of: 3,
      });
    });

    it('breaks a count tie by rating', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.8 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['r2']);

      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r2' }),
        likedBy: 1,
        of: 2,
      });
    });

    it('breaks a count-and-rating tie by name A-Z', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Zebra Diner', rating: 4.5 },
        { placeId: 'r2', name: 'Ant Bistro', rating: 4.5 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['r2']);

      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r2' }),
      });
    });

    it('falls back to the highest-rated deck Restaurant when every Submission is empty', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.8 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r2' }),
        likedBy: 0,
        of: 2,
      });
    });

    it('skips a closed deck Restaurant on the empty-submission fallback even when it is highest rated', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5, openNow: true },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.8, openNow: false },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r1' }),
      });
    });

    it('crowns the highest-rated Restaurant regardless of hours when every deck Restaurant is closed', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5, openNow: false },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.8, openNow: false },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(results?.topPick).toMatchObject({
        restaurant: expect.objectContaining({ placeId: 'r2' }),
      });
    });

    it('returns undefined when the deck is empty', async () => {
      const sessionCode = await createTwoParticipantSessionNoDeck();
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(results?.topPick).toBeUndefined();
    });

    async function createTwoParticipantSessionNoDeck(): Promise<string> {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, []);
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      return sessionCode;
    }

    it('does not call store.getDeck when the Match is non-empty', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
      ]);
      const getDeckSpy = vi.spyOn(store, 'getDeck');
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      await SessionService.submitSelections(sessionCode, 'p-bob', ['r1']);

      expect(getDeckSpy).not.toHaveBeenCalled();
    });

    it('calls store.getDeck at most once when the Match is empty', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
      ]);
      const getDeckSpy = vi.spyOn(store, 'getDeck');
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      await SessionService.submitSelections(sessionCode, 'p-bob', []);

      expect(getDeckSpy).toHaveBeenCalledTimes(1);
    });

    it('leaves both the sentinel and the crowned placeId in session:results on a zero-overlap completion', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Ramen House', rating: 4.5 },
        { placeId: 'r2', name: 'Pizza Place', rating: 4.2 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      await SessionService.submitSelections(sessionCode, 'p-bob', []);

      const members = await redis.smembers(`session:${sessionCode}:results`);
      expect(members.sort()).toEqual(['__empty__', 'r1'].sort());
    });

    it('leaves only the sentinel in session:results when the deck is empty', async () => {
      const sessionCode = await createTwoParticipantSessionNoDeck();
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      await SessionService.submitSelections(sessionCode, 'p-bob', []);

      const members = await redis.smembers(`session:${sessionCode}:results`);
      expect(members).toEqual(['__empty__']);
    });

    // The Deck deals Restaurants or Recipes (#254). Recipes are seeded straight
    // into a started lobby (this suite fakes the real dealer) — the
    // point is that the crowning mechanics need no fork, only a per-kind
    // middle rung.
    describe('Recipe Deck', () => {
      async function createSessionWithRecipeDeck(entries: Recipe[]): Promise<string> {
        const sessionCode = 'COOK1';
        await startedSession(store, sessionCode, entries);
        await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
        await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
        return sessionCode;
      }

      it('breaks a count tie by aggregate likes', async () => {
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
          { kind: 'recipe', placeId: 'rec2', name: 'Beef Rendang', aggregateLikes: 640 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', ['rec1']);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['rec2']);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'rec2' }),
          likedBy: 1,
          of: 2,
        });
      });

      it('breaks a count-and-likes tie by name A-Z', async () => {
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'rec1', name: 'Zucchini Slice', aggregateLikes: 90 },
          { kind: 'recipe', placeId: 'rec2', name: 'Anzac Biscuits', aggregateLikes: 90 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', ['rec1']);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['rec2']);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'rec2' }),
        });
      });

      // The empty-Submission fallback reaches the Deck through the open-now sink,
      // which a Recipe passes because it has no hours to be shut. That much the
      // compiler owns; what this asserts is that the fallback still crowns on the
      // Recipe's own rung once it gets there.
      it('crowns the most-liked Recipe when every Submission is empty', async () => {
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
          { kind: 'recipe', placeId: 'rec2', name: 'Beef Rendang', aggregateLikes: 640 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', []);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'rec2' }),
          likedBy: 0,
          of: 2,
        });
      });

      // The blend deals Owned Recipes into every Cook Deck (#331), and an Owned
      // Recipe carries no aggregateLikes — nothing backfills one. The rung
      // reads `?? -1`, so it sinks within its own rung and wins on the rung
      // above exactly as any Recipe does: the crowning path never forks on
      // provenance, and this is the test that says so.
      it('crowns an Owned Recipe on Selections, absent aggregateLikes and all', async () => {
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'owned:spaghetti-bolognese', name: 'Spaghetti Bolognese' },
          { kind: 'recipe', placeId: 'rec2', name: 'Beef Rendang', aggregateLikes: 640 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', [
          'owned:spaghetti-bolognese',
        ]);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', [
          'owned:spaghetti-bolognese',
        ]);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'owned:spaghetti-bolognese' }),
          likedBy: 2,
          of: 2,
        });
      });

      // The Cook ending (#262): the crown is where the Shopping List is minted.
      it('mints the Shopping List for the crowned Recipe', async () => {
        mintShoppingList.mockResolvedValue('list-1');
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', ['rec1']);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['rec1']);

        expect(mintShoppingList).toHaveBeenCalledWith(sessionCode, 'rec1');
        expect(results?.shoppingListId).toBe('list-1');
      });

      it('never costs the group their Match when the mint cannot start', async () => {
        mintShoppingList.mockRejectedValue(new Error('Redis unavailable'));
        const sessionCode = await createSessionWithRecipeDeck([
          { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', ['rec1']);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['rec1']);

        expect(results?.topPick?.restaurant.placeId).toBe('rec1');
        expect(results?.shoppingListId).toBeUndefined();
      });
    });

    describe('Movie Deck', () => {
      async function createSessionWithMovieDeck(entries: Movie[]): Promise<string> {
        const sessionCode = 'WATCH';
        await startedSession(store, sessionCode, entries);
        await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
        await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
        return sessionCode;
      }

      it('breaks a count tie by rating', async () => {
        const sessionCode = await createSessionWithMovieDeck([
          { kind: 'movie', placeId: 'Q1', name: 'Alien', rating: 93 },
          { kind: 'movie', placeId: 'Q2', name: 'Heat', rating: 94 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', ['Q1']);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['Q2']);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'Q2' }),
          likedBy: 1,
          of: 2,
        });
        expect(mintShoppingList).not.toHaveBeenCalled();
      });

      // A Movie has no hours to be shut, so every Movie is in the open pool and
      // the Deck fallback crowns by critics score alone.
      it('crowns the highest-rated Movie when every Submission is empty', async () => {
        const sessionCode = await createSessionWithMovieDeck([
          { kind: 'movie', placeId: 'Q1', name: 'Alien', rating: 93 },
          { kind: 'movie', placeId: 'Q2', name: 'Heat', rating: 94 },
        ]);
        await SessionService.submitSelections(sessionCode, 'p-alice', []);
        const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', []);

        expect(results?.topPick).toMatchObject({
          restaurant: expect.objectContaining({ placeId: 'Q2' }),
          likedBy: 0,
          of: 2,
        });
      });
    });

    it('mints nothing for a crowned Restaurant', async () => {
      const sessionCode = await createSessionWithDeck([
        { placeId: 'r1', name: 'Pizza Place', rating: 4.5 },
      ]);
      await SessionService.submitSelections(sessionCode, 'p-alice', ['r1']);
      const { results } = await SessionService.submitSelections(sessionCode, 'p-bob', ['r1']);

      expect(results?.topPick?.restaurant.placeId).toBe('r1');
      expect(mintShoppingList).not.toHaveBeenCalled();
    });
  });

  describe('restartSession', () => {
    it('rejects restarts from missing sessions', async () => {
      await expect(SessionService.restartSession('NOPE9', 'p-alice')).rejects.toMatchObject({
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('rejects restarts from non-participants', async () => {
      const { sessionCode } = await SessionService.createSession('Alice');

      await expect(SessionService.restartSession(sessionCode, 'p-stranger')).rejects.toMatchObject({
        code: 'NOT_IN_SESSION',
      });
    });

    it('wipes submissions and puts the session back in the lobby', async () => {
      await startedSession(store, testSessionCode, []);
      await SessionService.joinSession(testSessionCode, 'p-alice', 'Alice');
      await SessionService.submitSelections(testSessionCode, 'p-alice', []);

      await SessionService.restartSession(testSessionCode, 'p-alice');

      const session = await SessionService.getSession(testSessionCode);
      expect(session?.state).toBe('waiting');
      await expect(store.getParticipant('p-alice')).resolves.toMatchObject({
        hasSubmitted: false,
      });
    });

    it('rejects a decided Session Restart from a Participant who is not the Host', async () => {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, []);
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      await SessionService.submitSelections(sessionCode, 'p-alice', []);
      await SessionService.submitSelections(sessionCode, 'p-bob', []);

      await expect(SessionService.restartSession(sessionCode, 'p-bob')).rejects.toMatchObject({
        code: 'NOT_HOST',
      });
    });

    // #405: nothing promotes a successor, so a Host who leaves would otherwise
    // pin the room on "Waiting for the host" until the TTL ran out.
    it('lets whoever is left restart once the Host has gone', async () => {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, []);
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      await SessionService.leaveSession(sessionCode, 'p-alice');

      await SessionService.restartSession(sessionCode, 'p-bob');

      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).toBe('waiting');
    });

    // #405: a Disconnect keeps the Host a current Participant, and a Host who
    // reopens the Invite Link in a new tab has no rejoin token — they join
    // beside their own dead entry as an ordinary Participant. Keying off the
    // entry alone would refuse the real Host and everyone else, freezing the
    // room until the TTL.
    it('lets the room restart when the Host is listed but offline', async () => {
      const sessionCode = testSessionCode;
      await startedSession(store, sessionCode, []);
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      await store.markDisconnected('p-alice');

      await SessionService.restartSession(sessionCode, 'p-bob');

      const session = await SessionService.getSession(sessionCode);
      expect(session?.state).toBe('waiting');
    });
  });
});
