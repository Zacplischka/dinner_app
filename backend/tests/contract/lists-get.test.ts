// Contract: GET /api/lists/:listId — the Shopping List's read (#262). The URL
// is the whole capability (#229): the request carries no session, no
// participant id, no token, and the endpoint asks for none.
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
  mintedAt: '2026-08-01T10:00:00.000Z',
  steps: ['Boil the pasta.'],
  sourceName: 'Full Belly Sisters',
  sourceUrl: 'https://example.test/aglio',
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

function buildApp(readList = vi.fn(async () => list as ShoppingList | null)) {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use('/api/lists', createListsRouter({ mint: vi.fn(), readList }));
  app.use(errorHandler);
  return { app, readList };
}

describe('GET /api/lists/:listId', () => {
  it('serves the minted list to anyone holding the URL, with no Participant check', async () => {
    const { app } = buildApp();

    const response = await request(app).get(`/api/lists/${LIST_ID}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(list);
  });

  it('carries the Headcount the list was scaled to, inert', async () => {
    const { app } = buildApp();

    const response = await request(app).get(`/api/lists/${LIST_ID}`);

    expect(response.body.headcount).toBe(4);
  });

  it('404s an expired or unknown list with the canonical error shape', async () => {
    const { app } = buildApp(vi.fn(async () => null));

    const response = await request(app).get(`/api/lists/${LIST_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(typeof response.body.message).toBe('string');
  });

  it('404s a malformed list id without touching the store', async () => {
    const { app, readList } = buildApp();

    for (const id of [
      'not-a-list-id',
      '------------------------------------', // 36 chars, names nothing
      '9f0ac1de7c3a4a1e9a3b2f9f0d1c8e77', // unhyphenated
      `${LIST_ID}extra`,
    ]) {
      const response = await request(app).get(`/api/lists/${id}`);
      expect(response.status, id).toBe(404);
    }
    expect(readList).not.toHaveBeenCalled();
  });
});
