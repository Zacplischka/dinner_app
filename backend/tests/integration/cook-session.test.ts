// Integration Test: the Cook tracer bullet (#259) — setup deals a Recipe Deck,
// Participants swipe it with the existing mechanics, and the existing Top Pick
// rule crowns a Recipe outright. Solo and group, no solo/group question.
// Spoonacular is faked at the fetch boundary; everything else is the real
// service over real Redis.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis, testKeys } from '../helpers/testSetup.js';
import { sessionService, sessionStore as store } from '../../src/server.js';
import {
  recipeHits,
  spoonacularFetchFake,
  type RecipeSearchHit,
} from '../helpers/spoonacularFetchFake.js';

const craving = {
  mealType: 'main course' as const,
  cuisines: ['italian' as const],
  diets: [] as never[],
};

// Three Recipes with a deliberate spread of aggregate likes, so the middle
// rung is what decides when Selections tie.
const hits: RecipeSearchHit[] = [
  { id: 11, title: 'Aglio e Olio', image: 'https://img.test/11.jpg', aggregateLikes: 120 },
  { id: 22, title: 'Beef Rendang', image: 'https://img.test/22.jpg', aggregateLikes: 640 },
  { id: 33, title: 'Caponata', image: 'https://img.test/33.jpg', aggregateLikes: 5 },
];

describe('Integration Test: a Cook Session end to end', () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getTestRedis();
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    const pooled = await testKeys(redis, 'recipes:*');
    if (pooled.length > 0) await redis.del(...pooled);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      spoonacularFetchFake({ recipes: hits }).fetchImpl
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
    const pooled = await testKeys(redis, 'recipes:*');
    if (pooled.length > 0) await redis.del(...pooled);
  });

  async function cookSession(hostName: string, headcount: number) {
    const created = await sessionService.createSession(hostName, undefined, undefined, 'cook', {
      craving,
      headcount,
    });
    return created.sessionCode;
  }

  it('crowns a Recipe for a group, most Selections first', async () => {
    const sessionCode = await cookSession('Alice', 4);
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');
    await sessionService.joinSession(sessionCode, 'bob', 'Bob');

    await sessionService.submitSelections(sessionCode, 'alice', ['11', '33']);
    const { results } = await sessionService.submitSelections(sessionCode, 'bob', ['11']);

    expect(results?.hasOverlap).toBe(true);
    expect(results?.topPick).toMatchObject({
      restaurant: { kind: 'recipe', placeId: '11', name: 'Aglio e Olio' },
      likedBy: 2,
      of: 2,
    });
  });

  it('crowns a Recipe for one person deciding alone — no solo/group fork', async () => {
    const sessionCode = await cookSession('Alice', 1);
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');

    const { results } = await sessionService.submitSelections(sessionCode, 'alice', ['22']);

    expect(results?.topPick?.restaurant).toMatchObject({ placeId: '22', name: 'Beef Rendang' });
  });

  it('breaks a Selection tie on aggregate likes, standing in for a rating', async () => {
    const sessionCode = await cookSession('Alice', 2);
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');
    await sessionService.joinSession(sessionCode, 'bob', 'Bob');

    // Both Recipes are selected by both Participants: the Match is a tie.
    await sessionService.submitSelections(sessionCode, 'alice', ['11', '22']);
    const { results } = await sessionService.submitSelections(sessionCode, 'bob', ['11', '22']);

    expect(results?.overlappingOptions).toHaveLength(2);
    expect(results?.topPick?.restaurant.placeId).toBe('22'); // 640 likes beats 120
  });

  it('still crowns a Recipe when nobody selected anything', async () => {
    const sessionCode = await cookSession('Alice', 2);
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');

    const { results } = await sessionService.submitSelections(sessionCode, 'alice', []);

    expect(results?.hasOverlap).toBe(false);
    expect(results?.topPick?.restaurant.kind).toBe('recipe');
  });

  it('keeps the Headcount on the Session, whatever the Participant count does', async () => {
    const sessionCode = await cookSession('Alice', 6);
    await sessionService.joinSession(sessionCode, 'alice', 'Alice');
    await sessionService.joinSession(sessionCode, 'bob', 'Bob');

    const session = await store.readSession(sessionCode);
    expect(session?.headcount).toBe(6);
    expect(session?.participantCount).toBe(2);
  });

  // Restart means "show me different ones" in the Cook Branch (#246, #260) —
  // and it never means "no", however thin or cold the pool behind it is.
  describe('Restart', () => {
    /** A Cook Session decided once from a pool of `count`, ready to Restart. */
    async function decided(count: number) {
      vi.restoreAllMocks();
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        spoonacularFetchFake({ recipes: recipeHits(count) }).fetchImpl
      );
      const sessionCode = await cookSession('Alice', 2);
      await sessionService.joinSession(sessionCode, 'alice', 'Alice');
      const wiped = (await store.getDeck(sessionCode)).entries.map((e) => e.placeId);
      await sessionService.submitSelections(sessionCode, 'alice', [wiped[0]]);
      return { sessionCode, wiped };
    }

    it('deals a Deck that avoids the just-wiped one where a supply can afford it', async () => {
      const { sessionCode, wiped } = await decided(60);

      await sessionService.restartSession(sessionCode, 'alice');

      const dealt = (await store.getDeck(sessionCode)).entries;
      expect(dealt).toHaveLength(15);
      // Fresh-first is computed per source (#331). The vendor's sixty easily
      // afford twelve unshown cards; the corpus's answers to this Craving were
      // all on the wiped Deck, and the floor holds rather than being quietly
      // dropped to go looking for fresher ones.
      const sourced = dealt.filter((entry) => !entry.placeId.startsWith('owned:'));
      expect(sourced.filter((entry) => wiped.includes(entry.placeId))).toEqual([]);
      expect(dealt.length - sourced.length).toBe(3);
    });

    it('tops up with repeats rather than dealing short from a thin pool', async () => {
      const { sessionCode } = await decided(20);

      await sessionService.restartSession(sessionCode, 'alice');

      expect((await store.getDeck(sessionCode)).entries).toHaveLength(15);
    });

    it('reshuffles the wiped Deck on a cold pool instead of failing', async () => {
      const { sessionCode, wiped } = await decided(60);
      const cravingKey = (await store.readSession(sessionCode))?.cravingKey;
      await redis.del(cravingKey!);

      await expect(sessionService.restartSession(sessionCode, 'alice')).resolves.toEqual({
        restarted: true,
      });

      expect((await store.getDeck(sessionCode)).entries.map((e) => e.placeId).sort()).toEqual(
        [...wiped].sort()
      );
    });

    it('wipes Selections along with the deal, so the Deck is swipeable again', async () => {
      const { sessionCode } = await decided(60);

      await sessionService.restartSession(sessionCode, 'alice');

      expect((await store.readSession(sessionCode))?.state).toBe('selecting');
      expect((await store.getParticipant('alice'))?.hasSubmitted).toBe(false);
      expect(await store.readSelections(sessionCode, 'alice')).toEqual([]);
    });
  });
});
