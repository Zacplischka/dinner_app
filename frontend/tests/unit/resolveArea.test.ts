// The manual-location path: a Host types a suburb or postcode, and every
// failure comes back as an Error whose message is safe to put on the screen.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ geocodeArea: vi.fn() }));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, geocodeArea: mocks.geocodeArea };
});

import { ApiClientError } from '../../src/services/apiClient';
import { resolveArea } from '../../src/services/resolveArea';

const richmond = {
  latitude: -37.8238936,
  longitude: 144.9982667,
  area: 'Richmond VIC 3121, Australia',
};

describe('resolveArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.geocodeArea.mockResolvedValue(richmond);
  });

  it('geocodes the trimmed query and hands back the area as resolved', async () => {
    await expect(resolveArea('  Richmond 3121 ')).resolves.toEqual(richmond);
    expect(mocks.geocodeArea).toHaveBeenCalledWith('Richmond 3121');
  });

  it.each(['', '   ', 'a', ' a '])('refuses %j before any lookup is spent', async (raw) => {
    await expect(resolveArea(raw)).rejects.toThrow('Enter a suburb or postcode to search for.');
    expect(mocks.geocodeArea).not.toHaveBeenCalled();
  });

  it("passes the backend's own message through untouched", async () => {
    const notFound = new ApiClientError(
      'AREA_NOT_FOUND',
      "We couldn't find that area. Check the spelling or try a nearby suburb or postcode.",
      404
    );
    mocks.geocodeArea.mockRejectedValue(notFound);

    await expect(resolveArea('xzqnotaplace')).rejects.toBe(notFound);
  });

  it('turns a dropped connection into a message the Host can act on', async () => {
    mocks.geocodeArea.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(resolveArea('Richmond')).rejects.toThrow(
      'We couldn’t look up that area. Check your connection and try again.'
    );
  });

  it('never surfaces a failure that is not an Error', async () => {
    mocks.geocodeArea.mockRejectedValue('boom');

    await expect(resolveArea('Richmond')).rejects.toThrow(
      'We couldn’t look up that area. Check your connection and try again.'
    );
  });
});
