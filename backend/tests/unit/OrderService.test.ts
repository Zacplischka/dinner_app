// OrderService.open unit tests — real SessionStore over ioredis-mock, a fake
// snapshotStore with a getLatest spy. Covers the open contract: recovery path,
// validation, the stale/no_menu split, platform derivation and the raw Pinned Menu.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  SNAPSHOT_FRESHNESS_MS,
  SNAPSHOT_FAILURE_FRESHNESS_MS,
  type MenuItemCapture,
  type Snapshot,
  type SnapshotPayload,
  type StorefrontCapture,
  type StorefrontStatus,
} from '@dinder/shared/types';
import { createSessionStore } from '../../src/store/sessionStore.js';
import { createOrderService } from '../../src/services/OrderService.js';
import { DomainError } from '../../src/services/DomainError.js';

const sessionCode = 'ORD12';
const placeId = 'place-crown';

function item(name: string, price_cents: number): MenuItemCapture {
  return { name, price_cents, tags: [] };
}

function storefront(status: StorefrontStatus, menu: MenuItemCapture[] = []): StorefrontCapture {
  return { status, deals: [], menu, storeUrl: status === 'resolved' ? 'https://store' : undefined };
}

function snapshot(payload: SnapshotPayload, fetchedAt = new Date().toISOString()): Snapshot {
  return { id: 'snap-1', placeId, venueName: 'Pizza Place', fetchedAt, payload };
}

let redis: Redis;
let store: ReturnType<typeof createSessionStore>;

async function seedCompletedSession(crownPlaceId = placeId) {
  await store.createSession(sessionCode, { hostId: 'p1', hostName: 'Alice' });
  await store.addParticipant(sessionCode, {
    participantId: 'p1',
    displayName: 'Alice',
    isHost: true,
  });
  await store.addResultPlaceId(sessionCode, crownPlaceId);
}

function makeService(getLatest: ReturnType<typeof vi.fn>) {
  return createOrderService({
    store,
    snapshotStore: { getLatest },
    freshnessMs: SNAPSHOT_FRESHNESS_MS,
    failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
  });
}

beforeEach(async () => {
  redis = new RedisMock() as unknown as Redis;
  store = createSessionStore(redis);
  await redis.flushall();
});

describe('OrderService.open', () => {
  it('pins the raw Uber Eats menu with prices and server-derived platform', async () => {
    await seedCompletedSession();
    const menu = [item('Margherita', 1500), item('Pepperoni', 1800)];
    const getLatest = vi
      .fn()
      .mockResolvedValue(
        snapshot({ ubereats: storefront('resolved', menu), doordash: storefront('not_found') })
      );
    const service = makeService(getLatest);

    const result = await service.open(sessionCode, 'p1', placeId);

    expect('reason' in result).toBe(false);
    if ('reason' in result) throw new Error('expected success');
    expect(result.platform).toBe('ubereats');
    expect(result.menu).toEqual(menu);
    expect(result.pricesAt).toBe((await getLatest.mock.results[0].value).fetchedAt);
    expect(result.state).toBe('building');
    expect(result.feeCents).toBe(0);
    expect(result.storeUrl).toBe('https://store');
  });

  it('pins the RAW capture, not deriveComparison output (keeps duplicates)', async () => {
    await seedCompletedSession();
    // deriveComparison would de-dupe these; the Pinned Menu must not.
    const menu = [item('Margherita', 1500), item('Margherita', 1500), item('Pepperoni', 1800)];
    const service = makeService(
      vi
        .fn()
        .mockResolvedValue(
          snapshot({ ubereats: storefront('resolved', menu), doordash: storefront('not_found') })
        )
    );

    const result = await service.open(sessionCode, 'p1', placeId);
    if ('reason' in result) throw new Error('expected success');
    expect(result.menu).toHaveLength(3);
  });

  it('returns the live state on a second open without a second getLatest', async () => {
    await seedCompletedSession();
    await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
    const getLatest = vi.fn().mockResolvedValue(
      snapshot({
        ubereats: storefront('resolved', [item('Margherita', 1500)]),
        doordash: storefront('not_found'),
      })
    );
    const service = makeService(getLatest);

    const first = await service.open(sessionCode, 'p1', placeId);
    const second = await service.open(sessionCode, 'p2', placeId);

    expect(getLatest).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('returns the open order even when a second opener asks for a different Venue', async () => {
    await seedCompletedSession();
    const otherPlace = 'place-other';
    await store.addResultPlaceId(sessionCode, otherPlace);
    const getLatest = vi.fn().mockResolvedValue(
      snapshot({
        ubereats: storefront('resolved', [item('Margherita', 1500)]),
        doordash: storefront('not_found'),
      })
    );
    const service = makeService(getLatest);

    await service.open(sessionCode, 'p1', placeId);
    const second = await service.open(sessionCode, 'p1', otherPlace);

    expect(getLatest).toHaveBeenCalledTimes(1);
    if ('reason' in second) throw new Error('expected success');
    expect(second.placeId).toBe(placeId);
  });

  it('throws SESSION_NOT_FOUND for an unknown session', async () => {
    const service = makeService(vi.fn());
    const err = await service.open('NOPE1', 'p1', placeId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('SESSION_NOT_FOUND');
  });

  it('throws NOT_IN_SESSION for a non-participant', async () => {
    await seedCompletedSession();
    const service = makeService(vi.fn());
    const err = await service.open(sessionCode, 'stranger', placeId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('NOT_IN_SESSION');
  });

  it('throws VALIDATION_ERROR for a placeId never crowned, even with an order open', async () => {
    await seedCompletedSession();
    const service = makeService(
      vi.fn().mockResolvedValue(
        snapshot({
          ubereats: storefront('resolved', [item('Margherita', 1500)]),
          doordash: storefront('not_found'),
        })
      )
    );
    await service.open(sessionCode, 'p1', placeId); // an order is now open

    const err = await service.open(sessionCode, 'p1', 'never-crowned').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('VALIDATION_ERROR');
  });

  it('reports stale for a missing or aged Snapshot', async () => {
    await seedCompletedSession();
    const old = new Date(Date.now() - SNAPSHOT_FRESHNESS_MS - 1000).toISOString();
    const service = makeService(
      vi.fn().mockResolvedValue(
        snapshot(
          {
            ubereats: storefront('resolved', [item('X', 1)]),
            doordash: storefront('resolved', [item('X', 1)]),
          },
          old
        )
      )
    );
    const result = await service.open(sessionCode, 'p1', placeId);
    expect(result).toMatchObject({ reason: 'stale' });

    const noSnap = makeService(vi.fn().mockResolvedValue(null));
    expect(await noSnap.open(sessionCode, 'p1', placeId)).toMatchObject({ reason: 'stale' });
  });

  it('reports stale (not no_menu) for a failed Storefront', async () => {
    await seedCompletedSession();
    const service = makeService(
      vi.fn().mockResolvedValue(
        snapshot({
          ubereats: storefront('failed'),
          doordash: storefront('resolved', [item('X', 1)]),
        })
      )
    );
    const result = await service.open(sessionCode, 'p1', placeId);
    expect(result).toMatchObject({ reason: 'stale' });
  });

  it('reports no_menu when both Storefronts are not_found', async () => {
    await seedCompletedSession();
    const service = makeService(
      vi
        .fn()
        .mockResolvedValue(
          snapshot({ ubereats: storefront('not_found'), doordash: storefront('not_found') })
        )
    );
    expect(await service.open(sessionCode, 'p1', placeId)).toMatchObject({ reason: 'no_menu' });
  });

  it('reports no_menu when the chosen Storefront has an empty menu', async () => {
    await seedCompletedSession();
    const service = makeService(
      vi
        .fn()
        .mockResolvedValue(
          snapshot({ ubereats: storefront('resolved', []), doordash: storefront('not_found') })
        )
    );
    expect(await service.open(sessionCode, 'p1', placeId)).toMatchObject({ reason: 'no_menu' });
  });

  it('opens on a crowned Top Pick placeId (no-Match crown path)', async () => {
    // Mirrors #165's crown SADD: the crown, not a Match, is in session:results.
    await seedCompletedSession('crown-top-pick');
    const service = makeService(
      vi.fn().mockResolvedValue(
        snapshot({
          ubereats: storefront('resolved', [item('Margherita', 1500)]),
          doordash: storefront('not_found'),
        })
      )
    );
    const result = await service.open(sessionCode, 'p1', 'crown-top-pick');
    expect('reason' in result).toBe(false);
  });
});

describe('OrderService.addItem', () => {
  const menu = [item('Margherita', 1500), item('Pepperoni', 1800), item('Coke', 400)];

  // Seed an open order with a chosen fee, plus three Participants (Carol adds
  // nothing) so the share sum can be checked against items + fee directly.
  async function seedOpenOrder(feeCents: number) {
    await store.createSession(sessionCode, { hostId: 'pA', hostName: 'Alice' });
    for (const [participantId, displayName] of [
      ['pA', 'Alice'],
      ['pB', 'Bob'],
      ['pC', 'Carol'],
    ]) {
      await store.addParticipant(sessionCode, { participantId, displayName });
    }
    await store.openOrder(sessionCode, {
      sessionCode,
      placeId,
      venueName: 'Pizza Place',
      platform: 'ubereats',
      pricesAt: new Date().toISOString(),
      menu: JSON.stringify(menu),
      feeCents: String(feeCents),
      state: 'building',
    });
    return makeService(vi.fn());
  }

  it.each([0, 1, 899, 1000])(
    'splits the %i-cent fee so shares sum exactly to items + fee',
    async (feeCents) => {
      const service = await seedOpenOrder(feeCents);
      await service.addItem(sessionCode, 'pA', 0, 1); // Alice: Margherita 1500
      const { order } = await service.addItem(sessionCode, 'pB', 1, 1); // Bob: Pepperoni 1800

      const shareSum = order.shares.reduce((n, s) => n + s.totalCents, 0);
      expect(shareSum).toBe(order.itemsCents + feeCents);
      expect(order.itemsCents).toBe(1500 + 1800);
      // Carol has no line → no share entry.
      expect(order.shares.map((s) => s.displayName)).toEqual(['Alice', 'Bob']);
    }
  );

  it('resolves name and price from the pinned menu, never the payload', async () => {
    const service = await seedOpenOrder(0);
    const { order, change } = await service.addItem(sessionCode, 'pA', 1, 1);
    expect(order.lines).toEqual([
      { index: 1, name: 'Pepperoni', priceCents: 1800, qty: 1, by: 'Alice' },
    ]);
    expect(change).toEqual({ by: 'Alice', name: 'Pepperoni', delta: 1 });
  });

  it('sums two adds of the same index by one person into qty 2', async () => {
    const service = await seedOpenOrder(0);
    await service.addItem(sessionCode, 'pA', 0, 1);
    const { order } = await service.addItem(sessionCode, 'pA', 0, 1);
    expect(order.lines).toEqual([
      { index: 0, name: 'Margherita', priceCents: 1500, qty: 2, by: 'Alice' },
    ]);
  });

  it('rejects an out-of-bounds index with VALIDATION_ERROR', async () => {
    const service = await seedOpenOrder(0);
    await expect(service.addItem(sessionCode, 'pA', 3, 1)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a locked order with VALIDATION_ERROR', async () => {
    const service = await seedOpenOrder(0);
    await store.openOrder(sessionCode, { state: 'locked' });
    await expect(service.addItem(sessionCode, 'pA', 0, 1)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a non-participant with NOT_IN_SESSION', async () => {
    const service = await seedOpenOrder(0);
    await expect(service.addItem(sessionCode, 'stranger', 0, 1)).rejects.toMatchObject({
      code: 'NOT_IN_SESSION',
    });
  });

  it('throws SESSION_NOT_FOUND when no order is open', async () => {
    const service = makeService(vi.fn());
    await expect(service.addItem(sessionCode, 'pA', 0, 1)).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });
});
