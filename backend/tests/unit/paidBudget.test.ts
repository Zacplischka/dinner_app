// The global paid-API budget (#502): one Redis counter per paid SKU per quota
// day, spent before the paid call goes out.
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { budgetKey, checkPaidBudget, spendPaidBudget } from '../../src/services/paidBudget.js';

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
    await spendPaidBudget(redis, 'placePhoto', 10);
    const ttl = await redis.pttl(budgetKey('placePhoto'));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(48 * 3_600_000);
  });

  it('starts the clock when the counter is created, and never restarts it', async () => {
    const pexpire = vi.spyOn(redis, 'pexpire');
    await spendPaidBudget(redis, 'placePhoto', 10);
    await spendPaidBudget(redis, 'placePhoto', 10);
    expect(pexpire).toHaveBeenCalledTimes(1);
  });

  // Apify's free plan is $5 a month: a daily ceiling would still empty it in a week.
  it('budgets cold Comparisons by the Pacific month, with a counter that outlives it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 05:00 UTC on 1 October is still 30 September in California.
    vi.setSystemTime(new Date('2026-10-01T05:00:00.000Z'));
    expect(budgetKey('coldComparison')).toBe('budget:coldComparison:2026-09');
    vi.setSystemTime(new Date('2026-10-01T08:00:00.000Z'));
    expect(budgetKey('coldComparison')).toBe('budget:coldComparison:2026-10');

    await spendPaidBudget(redis, 'coldComparison', 1);
    await expect(spendPaidBudget(redis, 'coldComparison', 1)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: expect.stringMatching(/monthly limit/),
    });
    expect(await redis.pttl(budgetKey('coldComparison'))).toBeGreaterThan(31 * 24 * 3_600_000);
  });

  it("keys the day to Google's quota day, which turns over at midnight Pacific", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 05:00 UTC is still the previous evening in California.
    vi.setSystemTime(new Date('2026-09-25T05:00:00.000Z'));
    expect(budgetKey('placesTextSearch')).toBe('budget:placesTextSearch:2026-09-24');
    vi.setSystemTime(new Date('2026-09-25T08:00:00.000Z'));
    expect(budgetKey('placesTextSearch')).toBe('budget:placesTextSearch:2026-09-25');
  });

  // #502 round 2: a spent month must refuse before Place Details, which Google bills.
  it('checks a spent budget without spending it', async () => {
    await expect(checkPaidBudget(redis, 'coldComparison', 1)).resolves.toBeUndefined();
    expect(await redis.get(budgetKey('coldComparison'))).toBeNull();

    await spendPaidBudget(redis, 'coldComparison', 1);
    await expect(checkPaidBudget(redis, 'coldComparison', 1)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: expect.stringMatching(/monthly limit/),
    });
    expect(await redis.get(budgetKey('coldComparison'))).toBe('1');
  });

  it('fails closed on a check too: a Redis error refuses', async () => {
    vi.spyOn(redis, 'get').mockRejectedValue(new Error('Redis unavailable'));
    await expect(checkPaidBudget(redis, 'coldComparison', 60)).rejects.toThrow('Redis unavailable');
  });

  it('fails closed: a Redis error refuses the call rather than letting it through', async () => {
    vi.spyOn(redis, 'incr').mockRejectedValue(new Error('Redis unavailable'));
    await expect(spendPaidBudget(redis, 'placePhoto', 200)).rejects.toThrow('Redis unavailable');
  });
});
