// SessionService unit tests - business rules exercised through a service
// instance built over an injected in-memory store and a stubbed restaurant
// search fn. No real Redis, no network, no module mocks.

import { logger } from '../../src/logger.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { config } from '../../src/config/index.js';
import { createSessionStore } from '../../src/store/sessionStore.js';
import {
  createSessionService,
  generateSessionCode,
  MAX_PARTICIPANTS,
} from '../../src/services/SessionService.js';
import { DomainError } from '../../src/services/DomainError.js';
import { SESSION_CODE_PATTERN, type Mood, type Movie, type Recipe } from '@dinder/shared/types';

describe('SessionService', () => {
  const testSessionCode = 'TEST1';
  const originalFrontendUrl = config.frontendUrl;

  let redis: Redis;
  let store: ReturnType<typeof createSessionStore>;
  let searchNearbyRestaurants: ReturnType<typeof vi.fn>;
  let dealRecipeDeck: ReturnType<typeof vi.fn>;
  let redealRecipeDeck: ReturnType<typeof vi.fn>;
  let dealMovieDeck: ReturnType<typeof vi.fn>;
  let redealMovieDeck: ReturnType<typeof vi.fn>;
  let mintShoppingList: ReturnType<typeof vi.fn>;
  let SessionService: ReturnType<typeof createSessionService>;

  beforeEach(async () => {
    // ioredis-mock instances share one in-process data store; flush per test.
    redis = new RedisMock();
    await redis.flushall();
    store = createSessionStore(redis);
    searchNearbyRestaurants = vi.fn();
    dealRecipeDeck = vi.fn();
    redealRecipeDeck = vi.fn();
    dealMovieDeck = vi.fn();
    redealMovieDeck = vi.fn();
    mintShoppingList = vi.fn(async () => undefined);
    SessionService = createSessionService({
      store,
      searchNearbyRestaurants,
      dealRecipeDeck,
      redealRecipeDeck,
      dealMovieDeck,
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

  describe('createSession in the Cook Branch', () => {
    const craving = {
      mealType: 'main course' as const,
      cuisines: ['italian' as const],
      diets: ['vegetarian' as const],
    };
    const deck: Recipe[] = [
      { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
      { kind: 'recipe', placeId: 'rec2', name: 'Caponata', aggregateLikes: 40 },
    ];

    it('deals the Deck from the Craving pool, not from a restaurant search', async () => {
      dealRecipeDeck.mockResolvedValue({ entries: deck, recipeSourceDown: false });

      const session = await SessionService.createSession('Alice', undefined, undefined, 'cook', {
        craving,
        headcount: 4,
      });

      expect(dealRecipeDeck).toHaveBeenCalledWith(craving);
      expect(searchNearbyRestaurants).not.toHaveBeenCalled();
      expect(session.restaurantCount).toBe(2);
      expect((await store.getDeck(session.sessionCode)).entries).toEqual(
        expect.arrayContaining(deck)
      );
    });

    it('stores the Headcount on the Session, untouched by the deal', async () => {
      dealRecipeDeck.mockResolvedValue({ entries: deck, recipeSourceDown: false });

      const session = await SessionService.createSession('Alice', undefined, undefined, 'cook', {
        craving,
        headcount: 6,
      });

      expect(session.headcount).toBe(6);
      const stored = await store.readSession(session.sessionCode);
      expect(stored?.headcount).toBe(6);
      expect(stored?.branch).toBe('cook');
      // Nothing about the pool this Deck came from is derived from Headcount.
      expect(stored?.cravingKey).not.toContain('6');
    });

    it('refuses a Craving that pools no Recipes rather than opening an unswipeable Deck', async () => {
      dealRecipeDeck.mockResolvedValue({ entries: [], recipeSourceDown: false });

      await expect(
        SessionService.createSession('Alice', undefined, undefined, 'cook', {
          craving,
          headcount: 2,
        })
      ).rejects.toMatchObject({ code: 'NO_RECIPES_FOUND' });
    });

    it('says a source failure is a failure — "remove a filter" would be a lie', async () => {
      dealRecipeDeck.mockRejectedValue(new Error('Spoonacular 503'));

      await expect(
        SessionService.createSession('Alice', undefined, undefined, 'cook', {
          craving,
          headcount: 2,
        })
      ).rejects.toMatchObject({ code: 'RECIPE_SOURCE_UNAVAILABLE' });
    });

    it('freezes a short outage deal on the Session, for every Participant to read (#333)', async () => {
      dealRecipeDeck.mockResolvedValue({ entries: deck, recipeSourceDown: true });

      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'cook',
        { craving, headcount: 2 }
      );

      // Read back through the same Session lookup every Participant's page
      // makes, so the one plain line they see is one line.
      await expect(SessionService.getSession(sessionCode)).resolves.toMatchObject({
        recipeSourceDown: true,
      });
    });

    it('leaves a full deal saying nothing at all (#333)', async () => {
      dealRecipeDeck.mockResolvedValue({ entries: deck, recipeSourceDown: false });

      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'cook',
        { craving, headcount: 2 }
      );

      const session = await SessionService.getSession(sessionCode);
      expect(session?.recipeSourceDown).toBeUndefined();
    });
  });

  describe('restartSession in the Cook Branch', () => {
    const craving = {
      mealType: 'main course' as const,
      cuisines: ['italian' as const],
      diets: [] as never[],
    };
    const dealt: Recipe[] = [
      { kind: 'recipe', placeId: 'rec1', name: 'Aglio e Olio', aggregateLikes: 120 },
      { kind: 'recipe', placeId: 'rec2', name: 'Caponata', aggregateLikes: 40 },
    ];
    const nextDeal: Recipe[] = [
      { kind: 'recipe', placeId: 'rec7', name: 'Beef Rendang', aggregateLikes: 640 },
      { kind: 'recipe', placeId: 'rec8', name: 'Dal Tadka', aggregateLikes: 90 },
    ];

    /** A Cook Session decided once, so Restart has an outcome to wipe. */
    async function decidedCookSession(): Promise<string> {
      dealRecipeDeck.mockResolvedValue({ entries: dealt, recipeSourceDown: false });
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'cook',
        { craving, headcount: 2 }
      );
      await SessionService.joinSession(sessionCode, 'alice', 'Alice');
      await SessionService.submitSelections(sessionCode, 'alice', ['rec1']);
      return sessionCode;
    }

    it('deals a fresh Deck from the pool the Session was dealt from', async () => {
      redealRecipeDeck.mockResolvedValue(nextDeal);
      const sessionCode = await decidedCookSession();

      await SessionService.restartSession(sessionCode, 'alice');

      const [poolKey, wiped] = redealRecipeDeck.mock.calls[0];
      expect(poolKey).toBe((await store.readSession(sessionCode))?.cravingKey);
      expect((wiped as Recipe[]).map((e) => e.placeId).sort()).toEqual(['rec1', 'rec2']);
      expect((await store.getDeck(sessionCode)).entries).toEqual(expect.arrayContaining(nextDeal));
    });

    it('keeps the wiped Deck when the redeal hands the same Recipes back', async () => {
      // A cold pool degrades to a reshuffle, which is still a whole Deck —
      // Restart must land on something swipeable either way.
      redealRecipeDeck.mockImplementation(async (_key: string, current: Recipe[]) => current);
      const sessionCode = await decidedCookSession();

      await SessionService.restartSession(sessionCode, 'alice');

      expect((await store.getDeck(sessionCode)).entries.map((e) => e.placeId).sort()).toEqual([
        'rec1',
        'rec2',
      ]);
    });

    it('keeps the setup deal when the lobby starts selecting — nobody has seen it yet', async () => {
      // The lobby's "start selecting" is this same command on a 'waiting'
      // Session. Re-dealing there would throw away the deal setup just made.
      redealRecipeDeck.mockResolvedValue(nextDeal);
      dealRecipeDeck.mockResolvedValue({ entries: dealt, recipeSourceDown: false });
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'cook',
        { craving, headcount: 2 }
      );
      await SessionService.joinSession(sessionCode, 'alice', 'Alice');

      await SessionService.restartSession(sessionCode, 'alice');

      expect(redealRecipeDeck).not.toHaveBeenCalled();
      expect((await store.getDeck(sessionCode)).entries.map((e) => e.placeId).sort()).toEqual([
        'rec1',
        'rec2',
      ]);
    });

    it('leaves a Restaurant Session its own Deck — supply there is geography-bound', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { kind: 'restaurant', placeId: 'place1', name: 'Pizza Palace', rating: 4.5 },
      ]);
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        { latitude: 1, longitude: 2 },
        5,
        'takeaway'
      );
      await SessionService.joinSession(sessionCode, 'alice', 'Alice');
      // Decided, so the Restart is the real post-Match one, not the lobby's.
      await SessionService.submitSelections(sessionCode, 'alice', ['place1']);

      await SessionService.restartSession(sessionCode, 'alice');

      expect(redealRecipeDeck).not.toHaveBeenCalled();
      expect((await store.getDeck(sessionCode)).entries.map((e) => e.placeId)).toEqual(['place1']);
    });
  });

  describe('createSession in the Watch Branch', () => {
    const mood: Mood = { genres: ['Comedy'], decades: ['1990s'] };
    const deck: Movie[] = [
      {
        kind: 'movie',
        placeId: 'Q1',
        name: 'Clueless',
        rating: 81,
        year: 1995,
        genres: ['Comedy'],
      },
      { kind: 'movie', placeId: 'Q2', name: 'The Castle', year: 1997, genres: ['Comedy'] },
    ];

    it('deals the Deck from the corpus, not from a restaurant search, and stores the Mood', async () => {
      dealMovieDeck.mockReturnValue(deck);

      const session = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'watch',
        undefined,
        { mood }
      );

      expect(dealMovieDeck).toHaveBeenCalledWith(mood);
      expect(searchNearbyRestaurants).not.toHaveBeenCalled();
      expect(dealRecipeDeck).not.toHaveBeenCalled();
      expect(session.restaurantCount).toBe(2);
      expect((await store.getDeck(session.sessionCode)).entries).toEqual(
        expect.arrayContaining(deck)
      );
      // The Mood itself is what a Restart re-deals from — there is no pool key.
      const stored = await store.readSession(session.sessionCode);
      expect(stored?.branch).toBe('watch');
      expect(stored?.mood).toEqual(mood);
      expect(stored?.cravingKey).toBeUndefined();
    });

    it('refuses a Mood that deals no Movies rather than opening an unswipeable Deck', async () => {
      dealMovieDeck.mockReturnValue([]);

      await expect(
        SessionService.createSession('Alice', undefined, undefined, 'watch', undefined, { mood })
      ).rejects.toMatchObject({ code: 'NO_MOVIES_FOUND' });
    });
  });

  describe('restartSession in the Watch Branch', () => {
    const mood: Mood = { genres: ['Comedy'], decades: [] };
    const dealt: Movie[] = [
      { kind: 'movie', placeId: 'Q1', name: 'Clueless', rating: 81 },
      { kind: 'movie', placeId: 'Q2', name: 'The Castle', rating: 88 },
    ];
    const nextDeal: Movie[] = [
      { kind: 'movie', placeId: 'Q7', name: 'Hot Fuzz', rating: 91 },
      { kind: 'movie', placeId: 'Q8', name: 'Paddington 2', rating: 99 },
    ];

    /** A Watch Session decided once, so Restart has an outcome to wipe. */
    async function decidedWatchSession(): Promise<string> {
      dealMovieDeck.mockReturnValue(dealt);
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'watch',
        undefined,
        { mood }
      );
      await SessionService.joinSession(sessionCode, 'alice', 'Alice');
      await SessionService.submitSelections(sessionCode, 'alice', ['Q1']);
      return sessionCode;
    }

    it('deals a fresh Deck from the same Mood, handing over the wiped one', async () => {
      redealMovieDeck.mockReturnValue(nextDeal);
      const sessionCode = await decidedWatchSession();

      await SessionService.restartSession(sessionCode, 'alice');

      const [redealtMood, wiped] = redealMovieDeck.mock.calls[0];
      expect(redealtMood).toEqual(mood);
      expect((wiped as Movie[]).map((e) => e.placeId).sort()).toEqual(['Q1', 'Q2']);
      expect((await store.getDeck(sessionCode)).entries).toEqual(expect.arrayContaining(nextDeal));
      expect(redealRecipeDeck).not.toHaveBeenCalled();
    });

    it('keeps the setup deal when the lobby starts selecting — nobody has seen it yet', async () => {
      dealMovieDeck.mockReturnValue(dealt);
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        undefined,
        undefined,
        'watch',
        undefined,
        { mood }
      );
      await SessionService.joinSession(sessionCode, 'alice', 'Alice');

      await SessionService.restartSession(sessionCode, 'alice');

      expect(redealMovieDeck).not.toHaveBeenCalled();
      expect((await store.getDeck(sessionCode)).entries.map((e) => e.placeId).sort()).toEqual([
        'Q1',
        'Q2',
      ]);
    });
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
          restaurantCount: 0,
        },
        'Session created'
      );
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
        hostId: 'host-1',
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
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);
      const session = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

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
      const session = await SessionService.createSession('Alice', undefined, undefined, 'eatout');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');

      expect(result.branch).toBe('eatout');
    });

    it('should omit the Branch for a Session created before the entry fork', async () => {
      const session = await SessionService.createSession('Alice');

      const result = await SessionService.joinSession(session.sessionCode, 'socket-1', 'Alice');

      expect(result.branch).toBeUndefined();
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
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);
      const session = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(session.sessionCode, 'selecting');
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
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);
      const session = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );
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
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);
      const first = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );
      await SessionService.joinSession(first.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(first.sessionCode, 'selecting');
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
        redealRecipeDeck,
        dealMovieDeck,
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
    it('should not recompute the Match when a submit lands on an already-complete session', async () => {
      const session = await SessionService.createSession('Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(session.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(session.sessionCode, 'selecting');
      await SessionService.submitSelections(session.sessionCode, 'socket-alice', []);
      // The race resolved against Bob: the session completed without him.
      await store.updateState(session.sessionCode, 'complete');

      const second = await SessionService.submitSelections(session.sessionCode, 'socket-bob', []);

      expect(second).toMatchObject({ submittedCount: 2, participantCount: 2 });
      expect(second.results).toBeUndefined();
      await expect(store.readSession(session.sessionCode)).resolves.toMatchObject({
        state: 'complete',
      });
    });

    // #284 review: a refusal AFTER the old-Session departure committed must
    // still carry the departure, so the transport can tell the old room.
    it('should carry the committed old-session departure on a post-add refusal', async () => {
      searchNearbyRestaurants.mockResolvedValue([
        { placeId: 'place1', name: 'R1', rating: 4.5, priceLevel: 2 },
      ]);
      const first = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );
      await SessionService.joinSession(first.sessionCode, 'socket-alice', 'Alice');
      await SessionService.joinSession(first.sessionCode, 'socket-bob', 'Bob');
      await store.updateState(first.sessionCode, 'selecting');
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
        redealRecipeDeck,
        dealMovieDeck,
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
    it('should atomically reject one of two concurrent joins claiming the same display name', async () => {
      let snapshotCount = 0;
      let releaseSnapshots!: () => void;
      const bothSnapshotsTaken = new Promise<void>((resolve) => {
        releaseSnapshots = resolve;
      });
      const racyStore = {
        ...store,
        listParticipants: async (code: string) => {
          const participants = await store.listParticipants(code);
          snapshotCount += 1;
          if (snapshotCount <= 2) {
            if (snapshotCount === 2) releaseSnapshots();
            await bothSnapshotsTaken;
          }
          return participants;
        },
      };
      const racyService = createSessionService({
        store: racyStore,
        searchNearbyRestaurants,
        dealRecipeDeck,
        redealRecipeDeck,
        dealMovieDeck,
        redealMovieDeck,
      });
      const session = await racyService.createSession('Alice');

      const outcomes = await Promise.allSettled([
        racyService.joinSession(session.sessionCode, 'socket-bob-1', 'Bob'),
        racyService.joinSession(session.sessionCode, 'socket-bob-2', 'Bob'),
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
        redealRecipeDeck,
        dealMovieDeck,
        redealMovieDeck,
      });
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
        {
          placeId: 'place1',
          name: 'Restaurant 1',
          rating: 4.5,
          priceLevel: 2,
          cuisineType: 'Italian',
          address: '123 Main St',
        },
        {
          placeId: 'place2',
          name: 'Restaurant 2',
          rating: 4.2,
          priceLevel: 3,
          cuisineType: 'Chinese',
          address: '456 Oak Ave',
        },
      ];
      searchNearbyRestaurants.mockResolvedValue(mockRestaurants);

      const result = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );

      // closeTo's second argument is a digit count, not a tolerance — assert
      // the documented 1-metre allowance explicitly.
      const searchArgs = searchNearbyRestaurants.mock.calls[0][0];
      expect(searchArgs).toMatchObject({
        latitude: 37.7749,
        longitude: -122.4194,
        maxResults: 20,
      });
      expect(Math.abs(searchArgs.radiusMeters - 8046.7)).toBeLessThanOrEqual(1); // 5 miles in meters, ±1 m

      expect(result.restaurantCount).toBe(2);
      expect(logSpy).toHaveBeenCalledWith(
        {
          sessionCode: result.sessionCode,
          hasLocation: true,
          searchRadiusMiles: 5,
          participantCount: 1,
          restaurantCount: 2,
        },
        'Session created'
      );
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

      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode: expect.any(String),
          searchRadiusMiles: 5,
        },
        'No restaurants found during session creation'
      );
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

      await SessionService.createSession('Alice', { latitude: 37.7749, longitude: -122.4194 }, 10);

      // closeTo's second argument is a digit count, not a tolerance — assert
      // the documented 1-metre allowance explicitly.
      const searchArgs = searchNearbyRestaurants.mock.calls[0][0];
      expect(searchArgs).toMatchObject({
        latitude: 37.7749,
        longitude: -122.4194,
        maxResults: 20,
      });
      expect(Math.abs(searchArgs.radiusMeters - 16093.4)).toBeLessThanOrEqual(1); // 10 miles in meters, ±1 m
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
      const { sessionCode } = await SessionService.createSession('Alice');
      await SessionService.joinSession(sessionCode, 'p-alice', 'Alice');
      await SessionService.joinSession(sessionCode, 'p-bob', 'Bob');
      return sessionCode;
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

  describe('Top Pick', () => {
    async function createSessionWithDeck(
      restaurants: Array<{
        placeId: string;
        name: string;
        rating?: number;
        openNow?: boolean;
      }>
    ): Promise<string> {
      searchNearbyRestaurants.mockResolvedValue(restaurants);
      const { sessionCode } = await SessionService.createSession(
        'Alice',
        { latitude: 37.7749, longitude: -122.4194 },
        5
      );
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
      const { sessionCode } = await SessionService.createSession('Alice');
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
    // into the store (this suite fakes the real dealer, dealRecipeDeck) — the
    // point is that the crowning mechanics need no fork, only a per-kind
    // middle rung.
    describe('Recipe Deck', () => {
      async function createSessionWithRecipeDeck(entries: Recipe[]): Promise<string> {
        const sessionCode = 'COOK1';
        await store.createSession(sessionCode, {
          hostId: 'p-alice',
          hostName: 'Alice',
          entries,
        });
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
        await store.createSession(sessionCode, {
          hostId: 'p-alice',
          hostName: 'Alice',
          entries,
        });
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
