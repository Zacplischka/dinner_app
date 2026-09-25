// The global paid-API budget (#502): one Redis counter per paid SKU per quota
// day, spent before the paid call goes out.
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetKey, spendPaidBudget } from '../../src/services/paidBudget.js';

describe('spendPaidBudget', () => {
  let redis: Redis;
  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
  });
  afterEach(() => {
    redis.disconnect();
    vi.useRealTimers();
  });

  it('admits calls up to the ceiling and refuses once the counter reaches it', async () => {
    await spendPaidBudget(redis, 'placesTextSearch', 2);
    await spendPaidBudget(redis, 'placesTextSearch', 2);
    expect(await redis.get(budgetKey('placesTextSearch'))).toBe('2');

    await expect(spendPaidBudget(redis, 'placesTextSearch', 2)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    // Each SKU is its own budget.
    await expect(spendPaidBudget(redis, 'placePhoto', 2)).resolves.toBeUndefined();
  });

  it('gives the counter an expiry, so a day that has passed leaves nothing behind', async () => {
    await spendPaidBudget(redis, 'coldComparison', 10);
    const ttl = await redis.pttl(budgetKey('coldComparison'));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(48 * 3_600_000);
  });

  it("keys the day to Google's quota day, which turns over at midnight Pacific", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 05:00 UTC is still the previous evening in California.
    vi.setSystemTime(new Date('2026-09-25T05:00:00.000Z'));
    expect(budgetKey('placesTextSearch')).toBe('budget:placesTextSearch:2026-09-24');
    vi.setSystemTime(new Date('2026-09-25T08:00:00.000Z'));
    expect(budgetKey('placesTextSearch')).toBe('budget:placesTextSearch:2026-09-25');
  });

  it('fails closed: a Redis error refuses the call rather than letting it through', async () => {
    vi.spyOn(redis, 'incr').mockRejectedValue(new Error('Redis unavailable'));
    await expect(spendPaidBudget(redis, 'placePhoto', 200)).rejects.toThrow('Redis unavailable');
  });
});
