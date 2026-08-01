// Spoonacular client unit tests over the fetch fake — the boundary and
// nothing else.
import { describe, expect, it } from 'vitest';
import { createSpoonacularClient } from '../../src/services/spoonacularClient.js';
import { spoonacularFetchFake } from '../helpers/spoonacularFetchFake.js';

const chicken = { 'chicken breast': { id: 5062, consistency: 'solid' as const } };

describe('createSpoonacularClient', () => {
  it('converts one source unit to grams, carrying the pinned browser UA and key', async () => {
    const { fetchImpl, requests } = spoonacularFetchFake({
      gramsPerUnit: { 'chicken breast:piece': 226 },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.gramsPerUnit('chicken breast', 'piece')).resolves.toBe(226);
    expect(requests[0].url.searchParams.get('apiKey')).toBe('test-key');
    // Cloudflare 403s non-browser UAs (#244); the client must look like one.
    expect(requests[0].headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
  });

  it('answers null when Convert returns no number', async () => {
    const { fetchImpl } = spoonacularFetchFake({});
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('mystery', 'piece')).resolves.toBeNull();
  });

  it('reports a searchable ingredient with its consistency', async () => {
    const { fetchImpl } = spoonacularFetchFake({
      ingredients: { ...chicken, 'chicken stock': { id: 6172, consistency: 'liquid' } },
    });
    const client = createSpoonacularClient(fetchImpl, 'test-key');

    await expect(client.ingredientInfo('chicken stock')).resolves.toEqual({
      known: true,
      consistency: 'liquid',
    });
    await expect(client.ingredientInfo('japanese curry roux')).resolves.toEqual({
      known: false,
      consistency: null,
    });
  });

  it('throws on an HTTP error so the ladder can fall through', async () => {
    const { fetchImpl } = spoonacularFetchFake({ failWith: 500 });
    const client = createSpoonacularClient(fetchImpl, 'test-key');
    await expect(client.gramsPerUnit('chicken breast', 'piece')).rejects.toThrow('500');
    await expect(client.ingredientInfo('chicken breast')).rejects.toThrow('500');
  });
});
