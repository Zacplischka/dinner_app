import { describe, expect, it, vi } from 'vitest';
import {
  assertActorRunIdsUnchanged,
  assertColdSnapshot,
  assertResolvedStorefronts,
  latestActorRunIds,
  parseComparisonSse,
  selectSmokeVenue,
} from '../../src/services/comparisonSmoke.js';

describe('parseComparisonSse', () => {
  it('honours an explicit Place ID even when Google reshuffles the browse page', () => {
    expect(selectSmokeVenue(
      [{ placeId: 'other', name: 'Other Venue', distanceMiles: 0.1 }],
      '11 Inch Pizza',
      'ChIJ11InchPizza'
    )).toEqual({
      placeId: 'ChIJ11InchPizza',
      name: '11 Inch Pizza',
      distanceMiles: 0,
    });
  });

  it('reconstructs named events from a completed HTTP SSE body', () => {
    const body = [
      'event: venue\ndata: {"placeId":"place-1","venueName":"Pizza Place"}',
      'event: storefront\ndata: {"platform":"ubereats","storefront":{"status":"not_found","deals":[],"menu":[]}}',
      'event: comparison\ndata: {"comparison":{"placeId":"place-1","venueName":"Pizza Place","fetchedAt":"2026-07-13T08:00:00.000Z","storefronts":{"ubereats":{"status":"not_found","deals":[],"menu":[]},"doordash":{"status":"not_found","deals":[],"menu":[]}},"matchedItems":[],"unmatched":{"ubereats":[],"doordash":[]}}}',
      '',
    ].join('\n\n');

    expect(parseComparisonSse(body).map((event) => event.type)).toEqual([
      'venue',
      'storefront',
      'comparison',
    ]);
  });

  it('rejects malformed and unknown events instead of passing a false smoke', () => {
    expect(() => parseComparisonSse('event: unknown\ndata: {}\n\n')).toThrow(
      'Unknown comparison SSE event: unknown'
    );
    expect(() => parseComparisonSse('event: venue\ndata: nope\n\n')).toThrow(
      'Invalid comparison SSE data'
    );
  });

  it('requires both live Storefront events to resolve', () => {
    const resolved = { status: 'resolved' as const, deals: [], menu: [] };
    expect(() => assertResolvedStorefronts([
      { type: 'storefront', platform: 'ubereats', storefront: resolved },
      { type: 'storefront', platform: 'doordash', storefront: resolved },
    ])).not.toThrow();

    expect(() => assertResolvedStorefronts([
      { type: 'storefront', platform: 'ubereats', storefront: resolved },
      {
        type: 'storefront',
        platform: 'doordash',
        storefront: { status: 'not_found', deals: [], menu: [] },
      },
    ])).toThrow('DoorDash Storefront settled as not_found');
    expect(() => assertResolvedStorefronts([
      { type: 'storefront', platform: 'ubereats', storefront: resolved },
    ])).toThrow('Comparison stream omitted the DoorDash Storefront');
  });

  it('requires a stale or missing Snapshot before exercising live credentials', () => {
    const now = Date.parse('2026-07-13T08:20:00.000Z');
    const snapshot = {
      id: 'snapshot-1',
      placeId: 'place-1',
      venueName: 'Pizza Place',
      fetchedAt: '2026-07-13T08:01:00.000Z',
      payload: {
        ubereats: { status: 'resolved' as const, deals: [], menu: [] },
        doordash: { status: 'resolved' as const, deals: [], menu: [] },
      },
    };

    expect(() => assertColdSnapshot(null, now)).not.toThrow();
    // A successful Snapshot stays fresh for 6 hours: 19 minutes old...
    expect(() => assertColdSnapshot(snapshot, now)).toThrow(
      'already has a fresh Snapshot'
    );
    // ...and anything between the old 20-minute window and 6 hours is rejected too.
    expect(() => assertColdSnapshot(
      { ...snapshot, fetchedAt: '2026-07-13T05:20:00.000Z' },
      now
    )).toThrow('already has a fresh Snapshot');
    // At exactly 6 hours the Snapshot is cold and live credentials may run.
    expect(() => assertColdSnapshot(
      { ...snapshot, fetchedAt: '2026-07-13T02:20:00.000Z' },
      now
    )).not.toThrow();
    // A failed Snapshot keeps its short 2-minute window.
    expect(() => assertColdSnapshot({
      ...snapshot,
      fetchedAt: '2026-07-13T08:19:00.000Z',
      payload: {
        ...snapshot.payload,
        doordash: { status: 'failed' as const, deals: [], menu: [] },
      },
    }, now)).toThrow('already has a fresh Snapshot');
    expect(() => assertColdSnapshot({
      ...snapshot,
      fetchedAt: '2026-07-13T08:17:59.999Z',
      payload: {
        ...snapshot.payload,
        doordash: { status: 'failed' as const, deals: [], menu: [] },
      },
    }, now)).not.toThrow();
  });

  it('reads the latest run ID for every configured actor', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => ({
      ok: true,
      json: async () => ({
        data: { items: [{ id: String(input).includes('uber~actor') ? 'ue-run' : 'dd-run' }] },
      }),
    } as Response));

    await expect(latestActorRunIds(
      ['uber/actor', 'door/actor'],
      'token-123',
      fetchImpl as typeof fetch
    )).resolves.toEqual(['ue-run', 'dd-run']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('fails when a fresh replay starts another actor run', () => {
    expect(() => assertActorRunIdsUnchanged(['ue-1', 'dd-1'], ['ue-1', 'dd-1']))
      .not.toThrow();
    expect(() => assertActorRunIdsUnchanged(['ue-1', 'dd-1'], ['ue-2', 'dd-1']))
      .toThrow('Fresh replay started an unexpected actor run');
  });
});
