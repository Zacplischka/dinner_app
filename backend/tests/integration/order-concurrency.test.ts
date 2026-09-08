import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Redis from 'ioredis';
import type { Snapshot } from '@dinder/shared/types';
import { createSessionStore } from '../../src/store/sessionStore.js';
import { createOrderService } from '../../src/services/OrderService.js';

// Two connections/stores exercise the distributed Session lock, not a shared JS mutex.
const clients = [0, 1].map(
  () =>
    new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      keyPrefix: 'test:order-races:',
    })
);
const stores = clients.map(createSessionStore);
const code = 'ORDER-RACE-TEST';
const snapshot: Snapshot = {
  id: 'test',
  placeId: 'pizza',
  venueName: 'Pizza',
  fetchedAt: new Date().toISOString(),
  payload: {
    ubereats: {
      status: 'resolved',
      menu: [{ name: 'Pizza', price_cents: 1500, tags: [] }],
      deals: [],
    },
    doordash: { status: 'not_found', menu: [], deals: [] },
  },
};
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function service(index: number, getLatest = async () => snapshot) {
  return createOrderService({
    store: stores[index],
    snapshotStore: { getLatest },
    freshnessMs: 60000,
    failureFreshnessMs: 1000,
  });
}
async function cleanup() {
  const keys = (await clients[0].keys(`test:order-races:session:${code}*`)).map((key) =>
    key.slice('test:order-races:'.length)
  );
  if (keys.length) await clients[0].del(...keys);
  await clients[0].del('participant:order-race-alice');
}
beforeAll(async () => {
  await Promise.all(clients.map((client) => client.ping()));
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
  await stores[0].createSession(code, { hostId: 'order-race-alice', hostName: 'Alice' });
  await stores[0].addParticipant(code, { participantId: 'order-race-alice', displayName: 'Alice' });
  await stores[0].addResultPlaceId(code, 'pizza');
});
afterAll(async () => {
  await cleanup();
  await Promise.all(clients.map((client) => client.quit()));
});

describe('Group Order distributed interleavings', () => {
  it('a delayed open returns the edited, locked basket and its fees untouched', async () => {
    const entered = gate();
    const release = gate();
    const slow = service(0, async () => {
      entered.resolve();
      await release.promise;
      return snapshot;
    });
    const pending = slow.open(code, 'order-race-alice', 'pizza');
    await entered.promise;
    const other = service(1);
    await other.open(code, 'order-race-alice', 'pizza');
    await other.addItem(code, 'order-race-alice', 0, 1);
    await other.claimBuyer(code, 'order-race-alice');
    const locked = await other.claimBuyer(code, 'order-race-alice', 899);
    release.resolve();
    expect(await pending).toEqual(locked);
    expect(await stores[0].readOrder(code)).toMatchObject({ state: 'locked', feeCents: '899' });
  });

  it('a delayed old-round open cannot recreate an order after Restart, even with the same crown', async () => {
    const entered = gate();
    const release = gate();
    const pending = service(0, async () => {
      entered.resolve();
      await release.promise;
      return snapshot;
    }).open(code, 'order-race-alice', 'pizza');
    const result = pending.catch((error: unknown) => error);
    await entered.promise;
    await stores[1].withSessionLock(code, async () => {
      await stores[1].resetForRestart(code);
      await stores[1].addResultPlaceId(code, 'pizza');
    });
    release.resolve();
    expect(await result).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await stores[0].readOrder(code)).toBeNull();
  });

  it.each(['lock', 'restart'] as const)(
    'an admitted edit finishes before a concurrent %s',
    async (operation) => {
      const first = service(0);
      const other = service(1);
      await first.open(code, 'order-race-alice', 'pizza');
      const entered = gate();
      const release = gate();
      const original = stores[0].getParticipant;
      vi.spyOn(stores[0], 'getParticipant').mockImplementationOnce(async (id) => {
        entered.resolve();
        await release.promise;
        return original(id);
      });
      const edit = first.addItem(code, 'order-race-alice', 0, 1);
      await entered.promise;
      const following =
        operation === 'lock'
          ? other.claimBuyer(code, 'order-race-alice')
          : stores[1].withSessionLock(code, () => stores[1].resetForRestart(code));
      // Give the other connection time to attempt the shared lock while the edit is held.
      await new Promise((resolve) => setTimeout(resolve, 30));
      release.resolve();
      await edit;
      const result = await following;
      if (operation === 'lock') {
        expect(result).toMatchObject({ state: 'locked', lines: [{ qty: 1 }] });
        await expect(first.addItem(code, 'order-race-alice', 0, 1)).rejects.toMatchObject({
          code: 'VALIDATION_ERROR',
        });
      } else {
        expect(await stores[0].readOrder(code)).toBeNull();
        expect(await stores[0].readOrderLines(code)).toEqual({});
      }
    }
  );
});
