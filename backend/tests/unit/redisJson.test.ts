import { describe, expect, it } from 'vitest';
import { parseRedisJson } from '../../src/redis/json.js';

describe('Redis JSON helpers', () => {
  it('should parse Redis JSON strings as the requested type', () => {
    const parsed = parseRedisJson<{ placeId: string; name: string }>(
      '{"placeId":"place-1","name":"Cafe One"}'
    );

    expect(parsed).toEqual({
      placeId: 'place-1',
      name: 'Cafe One',
    });
  });
});
