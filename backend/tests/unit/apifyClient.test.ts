import { describe, expect, it, vi } from 'vitest';
import { createApifyClient } from '../../src/services/apifyClient.js';

describe('createApifyClient', () => {
  it('runs an actor synchronously with the server-side token and spend guards', async () => {
    const actorOutput = [{ title: '11 Inch Pizza' }];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => actorOutput,
    });
    const client = createApifyClient({ token: 'apify-token', fetchImpl });

    await expect(
      client.runActor('borderline/uber-eats-scraper-ppr', {
        query: '11 Inch Pizza',
        maxRows: 5,
      })
    ).resolves.toEqual(actorOutput);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/borderline~uber-eats-scraper-ppr/run-sync-get-dataset-items?timeout=280&maxItems=5&maxTotalChargeUsd=0.10',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer apify-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '11 Inch Pizza', maxRows: 5 }),
      }
    );
  });

  it('rejects an Apify error object instead of treating it as actor output', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Actor run timed out' } }),
    });
    const client = createApifyClient({ token: 'apify-token', fetchImpl });

    await expect(client.runActor('actor/name', {})).rejects.toThrow(
      'Apify actor returned a non-array response'
    );
  });
});
