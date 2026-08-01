// ProductMatchService unit tests — real client and matcher over a fetch fake
// and ioredis-mock; only the boundaries are faked.
import RedisMock from 'ioredis-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProductMatchService,
  successWindowMs,
} from '../../src/services/ProductMatchService.js';
import { createPolitenessQueue, type Enqueue } from '../../src/services/politenessQueue.js';
import { createWoolworthsClient } from '../../src/services/woolworthsClient.js';
import { captureLogs } from '../helpers/logCapture.js';
import { coriander, woolworthsFetchFake } from '../helpers/woolworthsFetchFake.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function service(answers: Record<string, unknown | number>, overrides: { enqueue?: Enqueue } = {}) {
  const redis = new RedisMock();
  const { fetchImpl, requests } = woolworthsFetchFake(answers);
  const created = createProductMatchService({
    redis,
    client: createWoolworthsClient(fetchImpl),
    enqueue: overrides.enqueue ?? createPolitenessQueue(0),
    defaultStoreId: 1101,
    successWindowCapMs: DAY_MS,
    failureWindowMs: HOUR_MS,
  });
  const searches = () => requests.filter((request) => request.method === 'POST');
  return { redis, service: created, searches };
}

describe('createProductMatchService', () => {
  beforeEach(async () => {
    await new RedisMock().flushall();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the global politeness queue and config windows when wiring passes only the boundaries', async () => {
    const redis = new RedisMock();
    const { fetchImpl, requests } = woolworthsFetchFake({ coriander });
    const matcher = createProductMatchService({ redis, client: createWoolworthsClient(fetchImpl) });

    const outcome = await matcher.matchProduct('coriander');
    expect(outcome.status).toBe('matched');
    // The default success window cached the answer: the repeat call fetches nothing.
    await matcher.matchProduct('coriander');
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('translates the term before search and returns the Product Match with runner-ups', async () => {
    const { service: matcher, searches } = service({ coriander });
    const outcome = await matcher.matchProduct('cilantro');

    expect(searches()[0].body).toMatchObject({ SearchTerm: 'coriander' });
    expect(outcome.status).toBe('matched');
    if (outcome.status !== 'matched') return;
    expect(outcome.match).toMatchObject({
      stockcode: 144329,
      packageSize: 'Each',
      priceCents: 250,
    });
    // InstorePrice stays on the cached record — never on the wire candidate.
    expect(outcome.match).not.toHaveProperty('instorePriceCents');
    // Junk (no sapcat) never surfaces; the other three survive for the picker.
    const stockcodes = outcome.runnersUp.map((candidate) => candidate.stockcode);
    expect(stockcodes).toHaveLength(3);
    expect(stockcodes).not.toContain(900001);
  });

  it('serves the cache first: one cold fetch, concurrent and repeat calls reuse it', async () => {
    const { service: matcher, searches } = service({ coriander });
    const [first, second] = await Promise.all([
      matcher.matchProduct('cilantro'),
      matcher.matchProduct('coriander'),
    ]);
    await matcher.matchProduct('cilantro');

    expect(first.status).toBe('matched');
    expect(second.status).toBe('matched');
    expect(searches()).toHaveLength(1);
  });

  it('caches a clean miss under the success window, distinct from a failure', async () => {
    const { redis, service: matcher } = service({
      wombok: { SearchResultsCount: 0, Products: null },
      broken: 500,
    });

    expect(await matcher.matchProduct('napa cabbage')).toEqual({ status: 'no_product' });
    const missTtl = await redis.pttl('woolworths:price:1101:wombok');
    expect(missTtl).toBeGreaterThan(HOUR_MS);
    expect(missTtl).toBeLessThanOrEqual(DAY_MS);

    expect(await matcher.matchProduct('broken')).toEqual({ status: 'failed' });
    const failureTtl = await redis.pttl('woolworths:price:1101:broken');
    expect(failureTtl).toBeGreaterThan(0);
    expect(failureTtl).toBeLessThanOrEqual(HOUR_MS);

    // The failure verdict is served from cache until its window lapses.
    expect(await matcher.matchProduct('broken')).toEqual({ status: 'failed' });
  });

  it('sends every cold lookup through the provided queue', async () => {
    const queue = createPolitenessQueue(0);
    let queued = 0;
    const counting: Enqueue = (task) => {
      queued += 1;
      return queue(task);
    };
    const { service: matcher } = service({ coriander }, { enqueue: counting });

    await matcher.matchProduct('cilantro');
    await matcher.matchProduct('cilantro');
    expect(queued).toBe(1); // warm read never touches the queue
  });

  it('counts Price/InstorePrice divergence as an operator-visible log metric', async () => {
    const logs = captureLogs();
    const { service: matcher } = service({ coriander });
    await matcher.matchProduct('coriander');

    const divergences = logs.withMsg('Woolworths price divergence');
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      term: 'coriander',
      stockcode: 89664,
      priceCents: 380,
      instorePriceCents: 400,
    });
  });

  it('self-heals a fulfilment-store drift: adopts the served store for later reads', async () => {
    const logs = captureLogs();
    const drifted = { ...coriander, FulfilmentStoreId: 3221 };
    const { redis, service: matcher, searches } = service({ coriander: drifted });

    await matcher.matchProduct('coriander');
    expect(logs.withMsg('Woolworths fulfilment store drifted')).toHaveLength(1);
    expect(await redis.get('woolworths:store')).toBe('3221');
    expect(await redis.pttl('woolworths:price:3221:coriander')).toBeGreaterThan(0);

    // The next read looks up the drifted store's key and hits it.
    await matcher.matchProduct('coriander');
    expect(searches()).toHaveLength(1);
  });
});

describe('successWindowMs', () => {
  const capMs = DAY_MS;

  it('caps at the configured window when Wednesday is far away', () => {
    // Thursday 2026-08-06 12:00 AEST (02:00 UTC)
    expect(successWindowMs(Date.UTC(2026, 7, 6, 2), capMs)).toBe(capMs);
  });

  it('shortens to the Wednesday 6 am AEST rollover when it is nearer', () => {
    // Tuesday 2026-08-04 22:00 AEST (12:00 UTC) → rollover in 8 h
    expect(successWindowMs(Date.UTC(2026, 7, 4, 12), capMs)).toBe(8 * HOUR_MS);
    // Wednesday 05:00 AEST → one hour left
    expect(successWindowMs(Date.UTC(2026, 7, 4, 19), capMs)).toBe(HOUR_MS);
  });

  it('rolls to next week once Wednesday 6 am has passed', () => {
    // Wednesday 2026-08-05 07:00 AEST (Tue 21:00 UTC) → capped full window
    expect(successWindowMs(Date.UTC(2026, 7, 4, 21), capMs)).toBe(capMs);
  });
});
