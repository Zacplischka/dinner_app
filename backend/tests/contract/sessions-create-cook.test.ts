// Contract Test: POST /api/sessions in the Cook Branch (#259).
// Drives the real app over HTTP with Spoonacular faked at the fetch boundary —
// the seam #253 names, and the only new external source in this flow.
//
// The second supply is substituted at its own seam: `OWNED_RECIPES_DIR` (set
// for this project in vitest.workspace.ts) points the app's corpus at three
// italian vegetarian mains under tests/fixtures/owned-recipes/. Every count
// below is therefore about the blend, and a PR that grows the shipped seed
// cannot turn these red (#331).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { getTestRedis, cleanupTestData, waitForRedis, testKeys } from '../helpers/testSetup.js';
import { recipeHits, spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const craving = {
  mealType: 'main course',
  cuisines: ['italian', 'thai'],
  diets: ['vegetarian'],
};

/**
 * A Craving the fixture corpus has no answer for — it is all italian — so the
 * Deck is purely Sourced and the vendor's supply is the whole supply. Every
 * test about what the vendor alone does uses it.
 */
const unownedCraving = { ...craving, cuisines: ['korean'] };

/** The fixture corpus, all of it answering `craving`: the floor, exactly. */
const OWNED_IN_FIXTURE = 3;

/** Points the app's late-bound fetch at the Spoonacular fake. */
function fakeSpoonacular(hits = recipeHits(60), failWith?: number) {
  const { fetchImpl, requests } = spoonacularFetchFake({ recipes: hits, failWith });
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchImpl);
  return {
    recipeSearches: () => requests.filter((r) => r.url.pathname === '/recipes/complexSearch'),
  };
}

describe('Contract Test: POST /api/sessions (Cook Branch)', () => {
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

  it('deals a Recipe Deck and freezes the Headcount on the Session', async () => {
    fakeSpoonacular();

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 6 })
      .expect(201);

    expect(response.body).toMatchObject({
      branch: 'cook',
      headcount: 6,
      restaurantCount: 15,
    });
  });

  it('deals Recipes through the card union — title and image, kind recipe', async () => {
    fakeSpoonacular();

    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);

    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);

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

    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);
    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);

    expect(options.restaurants).toHaveLength(15);
    const owned = options.restaurants.filter((card: { placeId: string }) =>
      card.placeId.startsWith('owned:')
    );
    // The floor (#316), and with a pinned corpus it is an equality: a healthy
    // vendor fills the other twelve.
    expect(owned).toHaveLength(OWNED_IN_FIXTURE);
    // The pool stays purely Sourced — the union happens at deal time only.
    const pooled = JSON.parse(
      (await redis.get(`recipes:pool:main course|italian,thai|vegetarian`)) ?? '[]'
    ) as Array<{ placeId: string }>;
    expect(pooled.some((recipe) => recipe.placeId.startsWith('owned:'))).toBe(false);
  });

  it('serves a second Session the same Craving pool with no second lookup', async () => {
    const spoonacular = fakeSpoonacular();

    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);
    await request(app)
      .post('/api/sessions')
      // Same Craving, chips in a different order, a different Headcount:
      // still one pool, because neither ordering nor Headcount is in the key.
      .send({
        hostName: 'Bob',
        branch: 'cook',
        craving: { ...craving, cuisines: ['thai', 'italian'] },
        headcount: 8,
      })
      .expect(201);

    expect(spoonacular.recipeSearches()).toHaveLength(1);
  });

  it('pools separately for a Craving whose chips differ', async () => {
    const spoonacular = fakeSpoonacular();

    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);
    await request(app)
      .post('/api/sessions')
      .send({
        hostName: 'Bob',
        branch: 'cook',
        craving: { ...craving, diets: [] },
        headcount: 2,
      })
      .expect(201);

    expect(spoonacular.recipeSearches()).toHaveLength(2);
  });

  it('carries the chips into the pool query', async () => {
    const spoonacular = fakeSpoonacular();

    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);

    const params = spoonacular.recipeSearches()[0].url.searchParams;
    expect(params.get('type')).toBe('main course');
    expect(params.get('cuisine')).toBe('italian,thai');
    expect(params.get('diet')).toBe('vegetarian');
    expect(params.get('instructionsRequired')).toBe('true');
  });

  // Zero is the only refusal the Cook Branch has, and it lives at setup (#260):
  // the Host relaxes their own chips, the app never relaxes them for anyone.
  // Since the blend it is a statement about the *union* — both supplies empty,
  // not just the vendor's (#316).
  it('refuses a Craving neither supply matches, and creates no Session', async () => {
    fakeSpoonacular(recipeHits(0));

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(404);

    expect(response.body).toMatchObject({ code: 'NO_RECIPES_FOUND' });
    expect(response.body.message).toMatch(/no recipes/i);
    await expect(testKeys(redis, 'session:*')).resolves.toEqual([]);
  });

  it('deals owned alone rather than refusing a Craving the vendor has nothing for', async () => {
    fakeSpoonacular(recipeHits(0));

    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);

    expect(session.restaurantCount).toBe(OWNED_IN_FIXTURE);
  });

  it('serves the clean miss from cache — fiddling with chips is one lookup', async () => {
    const spoonacular = fakeSpoonacular(recipeHits(0));

    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(404);
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(404);

    expect(spoonacular.recipeSearches()).toHaveLength(1);
  });

  it('shows a source failure as a failure, and remembers nothing of it', async () => {
    // The unowned Craving, because since #333 a source failure only reaches
    // the Host when the corpus had nothing to deal either.
    fakeSpoonacular(recipeHits(60), 503);

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(503);

    // "Remove a filter" is the wrong instruction when nothing was wrong with
    // the Craving, so the two outcomes never share a code or a message.
    expect(response.body.code).toBe('RECIPE_SOURCE_UNAVAILABLE');
    expect(response.body.message).toMatch(/try again/i);
    await expect(testKeys(redis, 'recipes:pool:*')).resolves.toEqual([]);
  });

  // The dark vendor (#333): the Cook Branch keeps dealing, owned-only, and the
  // Deck coming up short is the only thing anyone is told about.
  it('deals owned alone while the source is dark, and says so on a short Deck', async () => {
    fakeSpoonacular(recipeHits(60), 503);

    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving, headcount: 2 })
      .expect(201);

    expect(session.restaurantCount).toBe(OWNED_IN_FIXTURE);
    // Read back through the Session every Participant loads, so the one plain
    // line is the same line for the whole room.
    const { body: read } = await request(app)
      .get(`/api/sessions/${session.sessionCode}`)
      .expect(200);
    expect(read.recipeSourceDown).toBe(true);
    // Nothing of the outage is remembered as an answer about the Craving.
    await expect(testKeys(redis, 'recipes:pool:*')).resolves.toEqual([]);
  });

  it('stops calling a source that refused the key, until the window expires', async () => {
    const spoonacular = fakeSpoonacular(recipeHits(60), 401);

    // A revoked key is the source's own answer, not the network's: it latches
    // at once rather than being re-asked (and re-billed) on every deal.
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(503);
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(503);

    expect(spoonacular.recipeSearches()).toHaveLength(1);
  });

  // The latch outlives the Session that set it, so teardown has to name both
  // of its keys — miss one and the next file deals owned-only for five minutes
  // without ever calling its own fake.
  it('leaves no latch behind for the next file', async () => {
    fakeSpoonacular(recipeHits(60), 401);
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(503);

    await cleanupTestData(redis);

    await expect(redis.exists('recipes:vendor:dark', 'recipes:vendor:blips')).resolves.toBe(0);
  });

  it('deals the whole thin pool with no warning when owned cannot top it up', async () => {
    fakeSpoonacular(recipeHits(7));

    const { body: session } = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook', craving: unownedCraving, headcount: 2 })
      .expect(201);

    expect(session.restaurantCount).toBe(7);
    const { body: options } = await request(app)
      .get(`/api/options/${session.sessionCode}`)
      .expect(200);
    expect(options.restaurants).toHaveLength(7);
  });

  it('rejects a Cook Session with no setup', async () => {
    await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'cook' })
      .expect(400);
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

  it('leaves an Eat Out Session on the restaurant path, Craving ignored', async () => {
    const spoonacular = fakeSpoonacular();

    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'eatout', craving, headcount: 4 })
      .expect(201);

    expect(response.body.restaurantCount).toBe(0);
    expect(spoonacular.recipeSearches()).toHaveLength(0);
  });
});
