// The global paid-API budget (#502): one Redis counter per paid SKU per quota
// period, spent before the paid call goes out. Per-IP windows slow one client
// down; this is what stops every client together from draining a quota the
// whole app shares, because when one runs dry, Session create, Deck photos,
// Cook or Compare go dark for everybody until it resets.
//
// Redis: budget:{sku}:{YYYY-MM-DD}  string, the calls admitted that quota day
//        budget:{sku}:{YYYY-MM}     the same, per month, for a monthly SKU
import { config } from '../config/index.js';
import type { RedisLike } from '../redis/redisLike.js';
import { DomainError } from './DomainError.js';

export type PaidSku = keyof typeof config.paidBudget;

/**
 * Apify's free plan is a monthly $5, so cold Comparisons are budgeted by the
 * month: a daily ceiling would still empty the plan in a week and take Compare
 * down for the rest of it. Every other SKU is a daily Google quota or daily
 * restraint.
 */
const MONTHLY: ReadonlySet<PaidSku> = new Set(['coldComparison']);

/** Long enough that a counter outlives its period, and nothing more. */
const DAILY_TTL_MS = 48 * 3_600_000;
const MONTHLY_TTL_MS = 35 * 24 * 3_600_000;

/**
 * Google's daily quotas reset at midnight Pacific, so that is the budget's day.
 * A UTC day straddles two of them and would let two ceilings land in one.
 */
export const budgetKey = (sku: PaidSku) =>
  `budget:${sku}:${new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    .slice(0, MONTHLY.has(sku) ? 7 : 10)}`;

const REFUSALS: Record<PaidSku, string> = {
  placesTextSearch:
    'Restaurant search is temporarily unavailable: the app has reached its daily search limit. Please try again later.',
  placePhoto: 'Photos are temporarily unavailable: the app has reached its daily photo limit.',
  shoppingListMint: 'Shopping List pricing has reached its daily limit.',
  coldComparison:
    'New price comparisons are paused until next month: the app has reached its monthly limit. Recent comparisons still load.',
};

/**
 * Spends one call of a SKU's ceiling for the period, or refuses with
 * RATE_LIMITED so the paid call never goes out. Fails closed, like the
 * Spoonacular points guard: a Redis error throws, and nothing is spent upstream.
 */
export async function spendPaidBudget(
  redis: RedisLike,
  sku: PaidSku,
  ceiling: number = config.paidBudget[sku]
): Promise<void> {
  const key = budgetKey(sku);
  // A refused call counts too; past the ceiling the number only ever means spent.
  const spent = await redis.incr(key);
  // The clock starts when the period's first call creates the counter.
  // ponytail: two round trips, not one MULTI, so a process dying between them
  // leaves that one period's counter without an expiry: a few bytes, never
  // read once the period has passed. Upgrade path: INCR and PEXPIRE in a MULTI.
  if (spent === 1) await redis.pexpire(key, MONTHLY.has(sku) ? MONTHLY_TTL_MS : DAILY_TTL_MS);
  if (spent > ceiling) throw new DomainError('RATE_LIMITED', REFUSALS[sku]);
}

/**
 * Refuses exactly as a spend would once the period's ceiling is spent, but
 * spends nothing: for a caller that must pay for something else (Place
 * Details) before it knows the spend is due. Fails closed the same way.
 */
export async function checkPaidBudget(
  redis: RedisLike,
  sku: PaidSku,
  ceiling: number = config.paidBudget[sku]
): Promise<void> {
  if (Number(await redis.get(budgetKey(sku))) >= ceiling)
    throw new DomainError('RATE_LIMITED', REFUSALS[sku]);
}
