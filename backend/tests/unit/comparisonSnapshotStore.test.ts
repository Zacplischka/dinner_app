import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '../../src/services/DomainError.js';

const mockState = vi.hoisted(() => ({
  response: { data: null as unknown, error: null as unknown },
  calls: [] as Array<{ table: string; operation: string; args: unknown[] }>,
}));

vi.mock('../../src/services/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      for (const operation of ['select', 'eq', 'order', 'limit', 'insert']) {
        query[operation] = (...args: unknown[]) => {
          mockState.calls.push({ table, operation, args });
          return query;
        };
      }
      query.maybeSingle = async () => mockState.response;
      query.single = async () => mockState.response;
      return query;
    }),
  },
}));

const { getLatest, insert } = await import('../../src/store/comparisonSnapshotStore.js');

describe('comparisonSnapshotStore', () => {
  beforeEach(() => {
    mockState.calls = [];
  });

  it('returns the newest snapshot for a Venue in the shared shape', async () => {
    mockState.response = {
      data: {
        id: 'snapshot-1',
        place_id: 'place-1',
        venue_name: '11 Inch Pizza',
        fetched_at: '2026-07-13T01:02:03.000Z',
        payload: {
          ubereats: {
            status: 'resolved',
            storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/example',
            deals: ['30% off'],
            menu: [
              {
                name: 'Margherita',
                price_cents: 2100,
                section: 'Pizza',
                tags: ['30% off'],
              },
            ],
          },
          doordash: {
            status: 'not_found',
            deals: [],
            menu: [],
          },
        },
      },
      error: null,
    };

    await expect(getLatest('place-1')).resolves.toEqual({
      id: 'snapshot-1',
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      fetchedAt: '2026-07-13T01:02:03.000Z',
      payload: mockState.response.data.payload,
    });
    expect(mockState.calls).toEqual([
      {
        table: 'comparison_snapshots',
        operation: 'select',
        args: ['id, place_id, venue_name, fetched_at, payload'],
      },
      { table: 'comparison_snapshots', operation: 'eq', args: ['place_id', 'place-1'] },
      {
        table: 'comparison_snapshots',
        operation: 'order',
        args: ['fetched_at', { ascending: false }],
      },
      { table: 'comparison_snapshots', operation: 'limit', args: [1] },
    ]);
  });

  it('returns null when no Snapshot exists for the Venue', async () => {
    mockState.response = { data: null, error: null };

    await expect(getLatest('place-missing')).resolves.toBeNull();
  });

  it('rejects a malformed payload without exposing database details', async () => {
    mockState.response = {
      data: {
        id: 'snapshot-bad',
        place_id: 'place-1',
        venue_name: '11 Inch Pizza',
        fetched_at: '2026-07-13T01:02:03.000Z',
        // status is not a StorefrontStatus and menu is missing — actor drift.
        payload: { ubereats: { status: 'weird', deals: [] }, doordash: null },
      },
      error: null,
    };

    const error = await getLatest('place-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('database_error');
    expect((error as DomainError).message).not.toMatch(/supabase|postgres|jsonb|column/i);
  });

  it('surfaces a database failure as a generic DomainError', async () => {
    mockState.response = { data: null, error: { message: 'connection refused', code: '500' } };

    const error = await getLatest('place-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('database_error');
    expect((error as DomainError).message).not.toMatch(/connection refused/i);
  });

  it('inserts an immutable capture and returns its generated Snapshot fields', async () => {
    const payload = {
      ubereats: {
        status: 'resolved' as const,
        storeUrl: 'https://ubereats.com/au/store/11-inch-pizza/example',
        deals: [],
        menu: [],
      },
      doordash: {
        status: 'not_found' as const,
        deals: [],
        menu: [],
      },
    };
    mockState.response = {
      data: {
        id: 'snapshot-2',
        place_id: 'place-2',
        venue_name: 'Pizza Pizza Pizza',
        fetched_at: '2026-07-13T02:03:04.000Z',
        payload,
      },
      error: null,
    };

    await expect(
      insert({ placeId: 'place-2', venueName: 'Pizza Pizza Pizza', payload })
    ).resolves.toEqual({
      id: 'snapshot-2',
      placeId: 'place-2',
      venueName: 'Pizza Pizza Pizza',
      fetchedAt: '2026-07-13T02:03:04.000Z',
      payload,
    });
    expect(mockState.calls).toEqual([
      {
        table: 'comparison_snapshots',
        operation: 'insert',
        args: [{ place_id: 'place-2', venue_name: 'Pizza Pizza Pizza', payload }],
      },
      {
        table: 'comparison_snapshots',
        operation: 'select',
        args: ['id, place_id, venue_name, fetched_at, payload'],
      },
    ]);
  });
});
