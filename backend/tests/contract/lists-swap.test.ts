// Contract: the top-5 swap picker (#264). One more verb on the list's own URL,
// which is still the whole capability (#229) — the body carries a Stockcode the
// line already offered, or null for "none of these", and nothing else. Like
// claiming, it answers with the whole list at its new state, so the page that
// just corrected a line needs no second request to see the totals move.
import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ShoppingList } from '@dinder/shared/types';
import { createListsRouter } from '../../src/api/lists.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { logger } from '../../src/logger.js';

const LIST_ID = '9f0ac1de-7c3a-4a1e-9a3b-2f9f0d1c8e77';

const ardmona = { stockcode: 222, name: 'Ardmona Rich & Thick', packageSize: '400g' };

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
      runnersUp: [ardmona],
    },
    { id: '1', text: '1 tsp salt', staple: true, state: 'unmatched', searchTerm: 'salt' },
  ],
};

/** The same list with line 0 swapped onto the runner-up, re-priced. */
const swapped: ShoppingList = {
  ...list,
  lines: [
    {
      id: '0',
      text: '250 g canned tomatoes',
      staple: false,
      state: 'priced',
      needs: { amount: 250, unit: 'g' },
      packs: 1,
      priceCents: 190,
      product: ardmona,
      runnersUp: [{ stockcode: 12345, name: 'Woolworths Diced Tomatoes', packageSize: '400g' }],
    },
    list.lines[1],
  ],
};

function buildApp(overrides: { swapLine?: ReturnType<typeof vi.fn> } = {}) {
  const swapLine = overrides.swapLine ?? vi.fn(async () => swapped as ShoppingList | null);
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(express.json());
  app.use(
    '/api/lists',
    createListsRouter({
      mint: vi.fn(),
      readList: vi.fn(async () => list),
      claimLine: vi.fn(),
      releaseLine: vi.fn(),
      swapLine,
    })
  );
  app.use(errorHandler);
  return { app, swapLine };
}

const swapUrl = (listId = LIST_ID, lineId = '0') => `/api/lists/${listId}/lines/${lineId}/swap`;

describe('POST /api/lists/:listId/lines/:lineId/swap', () => {
  it('swaps the line onto a Stockcode it already offered, and answers with the list', async () => {
    const { app, swapLine } = buildApp();

    const response = await request(app).post(swapUrl()).send({ stockcode: 222 });

    expect(response.status).toBe(200);
    expect(swapLine).toHaveBeenCalledWith(LIST_ID, '0', 222);
    expect(response.body).toEqual(swapped);
  });

  it('takes null as "none of these"', async () => {
    const { app, swapLine } = buildApp();

    const response = await request(app).post(swapUrl()).send({ stockcode: null });

    expect(response.status).toBe(200);
    expect(swapLine).toHaveBeenCalledWith(LIST_ID, '0', null);
  });

  it('asks for no name, no session and no token — the URL is the capability', async () => {
    const { app } = buildApp();

    const response = await request(app).post(swapUrl()).send({ stockcode: 222 });

    expect(response.status).toBe(200);
  });

  it('rejects anything that is not a Stockcode or a deliberate null', async () => {
    const { app, swapLine } = buildApp();

    // NaN is absent from the list on purpose: JSON has no way to spell it, so
    // it arrives as the null that means "none of these".
    for (const body of [{}, { stockcode: '222' }, { stockcode: 1.5 }, { stockcode: true }]) {
      const response = await request(app).post(swapUrl()).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(swapLine).not.toHaveBeenCalled();
  });

  it('404s a list, a line, or a candidate that names nothing', async () => {
    const { app } = buildApp({ swapLine: vi.fn(async () => null) });

    const response = await request(app).post(swapUrl()).send({ stockcode: 999 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('404s a malformed list id without touching the store', async () => {
    const { app, swapLine } = buildApp();

    const response = await request(app).post(swapUrl('not-a-list-id')).send({ stockcode: 222 });

    expect(response.status).toBe(404);
    expect(swapLine).not.toHaveBeenCalled();
  });
});
