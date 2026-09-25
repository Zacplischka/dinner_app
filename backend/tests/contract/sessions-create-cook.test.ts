// Contract Test: the Cook Branch (#259) through the production app, with
// Spoonacular faked at the fetch boundary — the seam #253 names. POST
// /api/sessions opens a Cook lobby; the host's start is what deals.
//
// The second supply is substituted at its own seam: `OWNED_RECIPES_DIR` (set
// for this project in vitest.config.ts) points the app's corpus at three
// italian vegetarian mains under tests/fixtures/owned-recipes/. Every count
// below is therefore about the blend, and a PR that grows the shipped batch
// cannot turn these red (#331).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Cuisine, Diet } from '@dinder/shared/types';
import { app, sessionService } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis, testKeys } from '../helpers/testSetup.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const craving = {
  mealType: 'main course',
  cuisines: ['italian', 'thai'],
  diets: ['vegetarian'],
};

/** The host's chips: no diet, because the vendor fake labels its hits with none. */
const chips = { cuisines: ['italian', 'thai'] as Cuisine[], diets: [] as Diet[] };

/**
 * Chips the fixture corpus has no answer for — it is all italian — so the
 * Deck is purely Sourced and the vendor's supply is the whole supply.
 */
const unownedChips = { ...chips, cuisines: ['korean'] as Cuisine[] };

/** The fixture corpus, all of it answering `chips`: the floor, exactly. */
const OWNED_IN_FIXTURE = 3;

/** Points the app's late-bound fetch at the Spoonacular fake. */
function fakeSpoonacular(hits = recipeHits(60), failWith?: number) {
  const { fetchImpl, requests } = spoonacularFetchFake({ recipes: hits, failWith });
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
  return {
    recipeSearches: () => requests.filter((r) => r.url.pathname === '/recipes/complexSearch'),
  };
}

/** A Cook lobby its host filled with `hostChips` and started: the deal under test. */
async function started(hostChips: { cuisines: Cuisine[]; diets: Diet[] }) {
  const { sessionCode } = await sessionService.createSession('Alice', { branch: 'cook' });
  const { lobby } = await sessionService.joinSession(sessionCode, 'alice', 'Alice');
  const chosen = await sessionService.updateChoices(sessionCode, 'alice', {
    sessionCode,
    revision: lobby!.revision,
    ...hostChips,
  });
  const ready = await sessionService.setReady(sessionCode, 'alice', chosen.revision, true);
  await sessionService.startRound(sessionCode, 'alice', ready.revision);
  return sessionCode;
}

describe('Contract Test: the Cook Branch', () => {
  const redis = getTestRedis();

  beforeAll(async () => {
    await waitForRedis(redis);
  });

  beforeEach(async () => {
    // Pools are shared by design and outlive a Session, so a warm one from an
    // earlier test would answer for this one. Start every test cold.
    const pooled = await testKeys(redis, 'recipes:*');
    if (pooled.length > 0) await redis.del(...pooled);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestData(redis);
  });

  it('opens a Cook lobby with the Headcount, dealing nothing until the host starts', async () => {
    const spoonacular = fakeSpoonacular();

    const response = await request(app)
      .post('/api/sessions')
      // A pre-lobby client's Craving is accepted; only its meal type is read.
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 6 })
      .expect(201);

    expect(response.body).toMatchObject({
      branch: 'cook',
      headcount: 6,
      state: 'waiting',
      lobby: { mealType: 'main course', headcount: 6 },
    });
    expect(spoonacular.recipeSearches()).toHaveLength(0);
  });

  it('deals Recipes through the card union — title and image, kind recipe', async () => {
    fakeSpoonacular();

    const sessionCode = await started(chips);

    const { body: options } = await request(app).get(`/api/options/${sessionCode}`).expect(200);

    expect(options.restaurants).toHaveLength(15);
    for (const card of options.restaurants) {
      expect(card).toMatchObject({
        kind: 'recipe',
        placeId: expect.any(String),
        name: expect.any(String),
      });
      // The photo is optional on the union, and the blend is why: a Sourced
      // Recipe carries the vendor's, while a seed Owned Recipe carries none
      // until its image is generated and published (#355). A card with no
      // photo renders without one — a dead URL would render broken.
      if (!card.placeId.startsWith('owned:')) expect(card.photoUrl).toEqual(expect.any(String));
      // Ingredients and steps ride the pool payload, never the Deck.
      expect(card).not.toHaveProperty('ingredients');
      expect(card).not.toHaveProperty('steps');
    }
  });

  // The blend (#316): Owned Recipes are dealt into the Deck alongside the
  // vendor's, with nothing on the wire saying which is which.
  it('blends Owned Recipes into the Deck the vendor filled', async () => {
    fakeSpoonacular();

    const sessionCode = await started(chips);
    const { body: options } = await request(app).get(`/api/options/${sessionCode}`).expect(200);

    expect(options.restaurants).toHaveLength(15);
    const owned = options.restaurants.filter((card: { placeId: string }) =>
      card.placeId.startsWith('owned:')
    );
    // The floor (#316), and with a pinned corpus it is an equality: a healthy
    // vendor fills the other twelve.
    expect(owned).toHaveLength(OWNED_IN_FIXTURE);
    // The pool stays purely Sourced — the union happens at deal time only.
    const pooled = JSON.parse(
      (await redis.get(`recipes:pool:main course|italian,thai|`)) ?? '[]'
    ) as Array<{ placeId: string }>;
    expect(pooled.some((recipe) => recipe.placeId.startsWith('owned:'))).toBe(false);
  });

  it('refuses chips neither supply matches, and deals nothing', async () => {
    fakeSpoonacular(recipeHits(0));

    await expect(started(unownedChips)).rejects.toMatchObject({ code: 'NO_RECIPES_FOUND' });
  });

  it('shows a source failure as a failure, and remembers nothing of it', async () => {
    // Unowned chips, because since #333 a source failure only reaches the room
    // when the corpus had nothing to deal either.
    fakeSpoonacular(recipeHits(60), 503);

    // "Remove a filter" is the wrong instruction when nothing was wrong with
    // the Craving, so the two outcomes never share a code or a message.
    await expect(started(unownedChips)).rejects.toMatchObject({
      code: 'RECIPE_SOURCE_UNAVAILABLE',
      message: expect.stringMatching(/try again/i),
    });
    await expect(testKeys(redis, 'recipes:pool:*')).resolves.toEqual([]);
  });

  // The dark vendor (#333): the Cook Branch keeps dealing, owned-only, and the
  // Deck coming up short is the only thing anyone is told about.
  it('deals owned alone while the source is dark, and says so on a short Deck', async () => {
    fakeSpoonacular(recipeHits(60), 503);

    const sessionCode = await started(chips);

    const { body: options } = await request(app).get(`/api/options/${sessionCode}`).expect(200);
    expect(options.restaurants).toHaveLength(OWNED_IN_FIXTURE);
    // Read back through the Session every Participant loads, so the one plain
    // line is the same line for the whole room.
    const { body: read } = await request(app).get(`/api/sessions/${sessionCode}`).expect(200);
    expect(read.recipeSourceDown).toBe(true);
    // Nothing of the outage is remembered as an answer about the Craving.
    await expect(testKeys(redis, 'recipes:pool:*')).resolves.toEqual([]);
  });

  it('rejects chips outside the offered vocabulary', async () => {
    await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Alice',
        branch: 'cook',
        craving: { ...craving, diets: ['carnivore'] },
        headcount: 2,
      })
      .expect(400);
  });

  it('rejects a Headcount that is not a sane number of eaters', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 0 })
      .expect(400);
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 99 })
      .expect(400);
  });
});
