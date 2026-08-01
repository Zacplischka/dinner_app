// Contract: claiming and releasing an Ingredient Line (#263). Both verbs live
// on the same URL that reads the list, and the URL is the whole capability
// (#229): the request carries a self-declared display name and nothing else —
// no session, no participant id, no token — and releasing does not even carry
// that, because any Shopper may release any Claim.
import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@dinder/shared/types';
import { createListsRouter } from '../../src/api/lists.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { logger } from '../../src/logger.js';

const LIST_ID = '9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77';

const list: ShoppingList = {
  listId: LIST_ID,
  recipeName: 'Aglio e Olio',
  headcount: 4,
  servings: 2,
  mintedAt: '2026-08-01T10:00:00.000Z',
  steps: ['Boil the pasta.'],
  lines: [
    {
      id: '0',
      text: '250 g canned tomatoes',
      staple: false,
      state: 'priced',
      needs: { amount: 250, unit: 'g' },
      packs: 1,
      priceCents: 140,
      product: { stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' },
    },
    { id: '1', text: '1 tsp salt', staple: true, state: 'unmatched', searchTerm: 'salt' },
  ],
};

const claimed = (name: string): ShoppingList => ({
  ...list,
  lines: [{ ...list.lines[0], claimedBy: name }, list.lines[1]],
});

function buildApp(
  overrides: {
    claimLine?: ReturnType<typeof vi.fn>;
    releaseLine?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const claimLine = overrides.claimLine ?? vi.fn(async () => claimed('Alice'));
  const releaseLine = overrides.releaseLine ?? vi.fn(async () => list as ShoppingList | null);
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());
  app.use(
    '/api/lists',
    createListsRouter({ mint: vi.fn(), readList: vi.fn(async () => list), claimLine, releaseLine })
  );
  app.use(errorHandler);
  return { app, claimLine, releaseLine };
}

const claimUrl = (listId = LIST_ID, lineId = '0') => `/api/lists/${listId}/lines/${lineId}/claim`;

describe('POST /api/lists/:listId/lines/:lineId/claim', () => {
  it('claims the line for a self-declared name and answers with the whole list', async () => {
    const { app, claimLine } = buildApp();

    const response = await request(app).post(claimUrl()).send({ displayName: 'Alice' });

    expect(response.status).toBe(200);
    expect(claimLine).toHaveBeenCalledWith(LIST_ID, '0', 'Alice');
    expect(response.body).toEqual(claimed('Alice'));
  });

  it('answers 200 with the winner when the tap lost the race, not an error', async () => {
    // First tap wins in Redis; the loser's UI flips to "claimed by <name>",
    // which is a rendering of the truth, not a failure to report (#229).
    const { app } = buildApp({ claimLine: vi.fn(async () => claimed('Alice')) });

    const response = await request(app).post(claimUrl()).send({ displayName: 'Bob' });

    expect(response.status).toBe(200);
    expect(response.body.lines[0].claimedBy).toBe('Alice');
  });

  it('trims the display name before it becomes an identity', async () => {
    const { app, claimLine } = buildApp();

    await request(app).post(claimUrl()).send({ displayName: '  Alice  ' });

    expect(claimLine).toHaveBeenCalledWith(LIST_ID, '0', 'Alice');
  });

  it('rejects a claim with no name behind it', async () => {
    const { app, claimLine } = buildApp();

    for (const body of [{}, { displayName: '' }, { displayName: '   ' }, { displayName: 7 }]) {
      const response = await request(app).post(claimUrl()).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(claimLine).not.toHaveBeenCalled();
  });

  it('rejects a display name too long to be one', async () => {
    const { app, claimLine } = buildApp();

    const response = await request(app)
      .post(claimUrl())
      .send({ displayName: 'A'.repeat(51) });

    expect(response.status).toBe(400);
    expect(claimLine).not.toHaveBeenCalled();
  });

  it('404s a list or line that names nothing', async () => {
    const { app } = buildApp({ claimLine: vi.fn(async () => null) });

    const response = await request(app).post(claimUrl()).send({ displayName: 'Alice' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('404s a malformed list id without touching the store', async () => {
    const { app, claimLine } = buildApp();

    const response = await request(app)
      .post(claimUrl('not-a-list-id'))
      .send({ displayName: 'Alice' });

    expect(response.status).toBe(404);
    expect(claimLine).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/lists/:listId/lines/:lineId/claim', () => {
  it('releases the Claim for anyone holding the URL, own or not', async () => {
    const { app, releaseLine } = buildApp();

    const response = await request(app).delete(claimUrl());

    expect(response.status).toBe(200);
    expect(releaseLine).toHaveBeenCalledWith(LIST_ID, '0');
    expect(response.body.lines[0].claimedBy).toBeUndefined();
  });

  it('asks for no name, because releasing is not an identity claim', async () => {
    const { app, releaseLine } = buildApp();

    await request(app).delete(claimUrl());

    expect(releaseLine).toHaveBeenCalledWith(LIST_ID, '0');
  });

  it('404s a list or line that names nothing', async () => {
    const { app } = buildApp({ releaseLine: vi.fn(async () => null) });

    const response = await request(app).delete(claimUrl());

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});
