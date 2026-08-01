// Composes the Product Matcher pipeline (issue #256): US→AU translation →
// shared price cache → the global politeness queue → the Woolworths client →
// pure ranking. The cache is served first and always; the queue only ever
// sees cold lookups (ADR 0010).
import type { ProductMatchOutcome } from '@dinder/shared/types';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { matchProducts, type WoolworthsProduct } from './productMatcher.js';
import { woolworthsQueue, type Enqueue } from './politenessQueue.js';
import { translateTerm } from './usToAuTerms.js';
import type { WoolworthsClient } from './woolworthsClient.js';

// Keyed (FulfilmentStoreId, term) with the store id read off each response:
// cardinality is 1 today, but a store flip under us becomes a cache miss that
// self-heals instead of silently serving another store's prices (ADR 0010).
const STORE_KEY = 'woolworths:store';
const priceKey = (storeId: number, term: string) => `woolworths:price:${storeId}:${term}`;

type CachedAnswer =
  | { status: 'ok'; storeId: number; fetchedAt: string; products: WoolworthsProduct[] }
  | { status: 'failure'; fetchedAt: string };

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
}

interface ProductMatchServiceDeps {
  redis: RedisLike;
  client: WoolworthsClient;
  /** Defaults to the global politeness queue — the one all cold lookups share. */
  enqueue?: Enqueue;
  /** The store assumed before any response has named one (1101 Mayfield). */
  defaultStoreId?: number;
  /** Freshness Window cap; the Wednesday 6 am AEST rollover may shorten it. */
  successWindowCapMs?: number;
  failureWindowMs?: number;
  now?: () => number;
}

export interface ProductMatchService {
  matchProduct(term: string): Promise<ProductMatchOutcome>;
}

/**
 * A successful answer (including a clean zero-result miss) stays fresh for
 * `min(cap, time to Wednesday 6 am AEST)` — the weekly specials rollover is
 * the one systematic repricing event. AEST is fixed UTC+10; the rollover
 * anchors to Woolworths' pricing calendar, not local daylight saving.
 */
export function successWindowMs(nowMs: number, capMs: number): number {
  const AEST_OFFSET_MS = 10 * 3_600_000;
  const DAY_MS = 86_400_000;
  const local = nowMs + AEST_OFFSET_MS;
  const date = new Date(local);
  let rollover = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + ((3 - date.getUTCDay() + 7) % 7), // 3 = Wednesday
    6
  );
  if (rollover <= local) rollover += 7 * DAY_MS;
  return Math.min(capMs, rollover - local);
}

export function createProductMatchService(deps: ProductMatchServiceDeps): ProductMatchService {
  const now = deps.now ?? Date.now;
  const enqueue = deps.enqueue ?? woolworthsQueue;
  const defaultStoreId = deps.defaultStoreId ?? config.woolworths.defaultStoreId;
  const successWindowCapMs = deps.successWindowCapMs ?? config.woolworths.successWindowCapMs;
  const failureWindowMs = deps.failureWindowMs ?? config.woolworths.failureWindowMs;

  async function readCache(key: string): Promise<CachedAnswer | null> {
    const raw = await deps.redis.get(key);
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  }

  async function currentStoreId(): Promise<number> {
    const raw = await deps.redis.get(STORE_KEY);
    const storeId = raw === null ? NaN : Number(raw);
    return Number.isFinite(storeId) ? storeId : defaultStoreId;
  }

  async function fetchAndCache(term: string, storeId: number): Promise<CachedAnswer> {
    const fetchedAt = new Date(now()).toISOString();
    let answer;
    try {
      answer = await deps.client.search(term);
    } catch (error) {
      logger.warn({ err: error, term }, 'Woolworths search failed');
      const failure: CachedAnswer = { status: 'failure', fetchedAt };
      await deps.redis.set(priceKey(storeId, term), JSON.stringify(failure), 'PX', failureWindowMs);
      return failure;
    }

    const servedStoreId = answer.storeId ?? storeId;
    if (servedStoreId !== storeId) {
      // The standing drift check (#249): anything but 1101 reopens the egress decision.
      logger.warn({ storeId, servedStoreId }, 'Woolworths fulfilment store drifted');
      await deps.redis.set(STORE_KEY, String(servedStoreId));
    }
    for (const product of answer.products) {
      // The operator-visible divergence counter: the promised price is the
      // online Price, and the deep link must never disagree with it.
      if (
        product.priceCents !== undefined &&
        product.instorePriceCents !== undefined &&
        product.priceCents !== product.instorePriceCents
      ) {
        logger.warn(
          {
            term,
            stockcode: product.stockcode,
            priceCents: product.priceCents,
            instorePriceCents: product.instorePriceCents,
          },
          'Woolworths price divergence'
        );
      }
    }

    const success: CachedAnswer = {
      status: 'ok',
      storeId: servedStoreId,
      fetchedAt,
      products: answer.products,
    };
    await deps.redis.set(
      priceKey(servedStoreId, term),
      JSON.stringify(success),
      'PX',
      successWindowMs(now(), successWindowCapMs)
    );
    return success;
  }

  return {
    async matchProduct(term: string): Promise<ProductMatchOutcome> {
      const searchTerm = translateTerm(term);
      const storeId = await currentStoreId();
      const key = priceKey(storeId, searchTerm);
      let answer = await readCache(key);
      if (!answer) {
        answer = await enqueue(async () => {
          // Re-check inside the queue: an identical term queued behind us may
          // have already paid for this answer.
          return (await readCache(key)) ?? fetchAndCache(searchTerm, storeId);
        });
      }

      if (answer.status === 'failure') return { status: 'failed' };
      const match = matchProducts(answer.products, searchTerm);
      return match ? { status: 'matched', ...match } : { status: 'no_product' };
    },
  };
}
