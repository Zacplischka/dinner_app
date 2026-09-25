// Integration Test: the Cook tracer bullet (#259) — the lobby's start deals a
// Recipe Deck, Participants swipe it with the existing mechanics, and the
// existing Top Pick rule crowns a Recipe outright. Solo and group, no solo/group question.
// Spoonacular is faked at the fetch boundary; everything else is the real
// service over real Redis. The second supply is substituted at its own seam:
// `OWNED_RECIPES_DIR` (vitest.config.ts) points the app's corpus at three
// italian mains under tests/fixtures/owned-recipes/, so the owned counts below
// are about the blend and not about what the shipped batch holds this week.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type Redis from 'ioredis';
import { getTestRedis, cleanupTestData, waitForRedis, testKeys } from '../helpers/testSetup.js';
import { sessionService, sessionStore as store } from '../../src/server.js';
import { spoonacularFetchFake, type RecipeSearchHit } from '../helpers/spoonacularFetchFake.js';

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

  /** A Cook Session everyone in `names` joined and the first, its host, started. */
  async function cookSession(headcount: number, names = ['Alice']) {
    const ids = names.map((name) => name.toLowerCase());
    const { sessionCode } = await sessionService.createSession(names[0], {
      branch: 'cook',
      headcount,
    });
    for (const [i, name] of names.entries())
      await sessionService.joinSession(sessionCode, ids[i], name);
    for (const id of ids) {
      const { revision } = (await sessionService.getLobby(sessionCode))!;
      await sessionService.setReady(sessionCode, id, revision, true);
    }
    const { revision } = (await sessionService.getLobby(sessionCode))!;
    await sessionService.startRound(sessionCode, ids[0], revision);
    return sessionCode;
  }

  it('crowns a Recipe for a group, most Selections first', async () => {
    const sessionCode = await cookSession(4, ['Alice', 'Bob']);

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
    const sessionCode = await cookSession(1);

    const { results } = await sessionService.submitSelections(sessionCode, 'alice', ['22']);

    expect(results?.topPick?.restaurant).toMatchObject({ placeId: '22', name: 'Beef Rendang' });
  });

  it('breaks a Selection tie on aggregate likes, standing in for a rating', async () => {
    const sessionCode = await cookSession(2, ['Alice', 'Bob']);

    // Both Recipes are selected by both Participants: the Match is a tie.
    await sessionService.submitSelections(sessionCode, 'alice', ['11', '22']);
    const { results } = await sessionService.submitSelections(sessionCode, 'bob', ['11', '22']);

    expect(results?.overlappingOptions).toHaveLength(2);
    expect(results?.topPick?.restaurant.placeId).toBe('22'); // 640 likes beats 120
  });

  it('still crowns a Recipe when nobody selected anything', async () => {
    const sessionCode = await cookSession(2);

    const { results } = await sessionService.submitSelections(sessionCode, 'alice', []);

    expect(results?.hasOverlap).toBe(false);
    expect(results?.topPick?.restaurant.kind).toBe('recipe');
  });

  it('keeps the Headcount on the Session, whatever the Participant count does', async () => {
    const sessionCode = await cookSession(6, ['Alice', 'Bob']);

    const session = await store.readSession(sessionCode);
    expect(session?.headcount).toBe(6);
    expect(session?.participantCount).toBe(2);
  });
});
