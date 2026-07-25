import { describe, expect, it, vi } from 'vitest';
import { runApifyActor } from '../../src/services/apifyClient.js';

describe('runApifyActor', () => {
  it('runs an actor synchronously with the server-side token and spend guards', async () => {
    const actorOutput = [{ title: '11 Inch Pizza' }];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => actorOutput,
    });

    await expect(
      runApifyActor(
        'apify-token',
        'borderline/uber-eats-scraper-ppr',
        { query: '11 Inch Pizza', maxRows: 5 },
        fetchImpl
      )
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

    await expect(runApifyActor('apify-token', 'actor/name', {}, fetchImpl)).rejects.toThrow(
      'Apify actor returned a non-array response'
    );
  });
});
