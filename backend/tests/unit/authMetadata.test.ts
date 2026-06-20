import { describe, expect, it } from 'vitest';
import { getAuthProfileDefaults } from '../../src/api/authMetadata.js';

describe('auth metadata helpers', () => {
  it('should use Google profile metadata when present', () => {
    expect(getAuthProfileDefaults({
      full_name: 'Ada Lovelace',
      avatar_url: 'https://example.com/ada.png',
    }, 'ada@example.com')).toEqual({
      displayName: 'Ada Lovelace',
      avatarUrl: 'https://example.com/ada.png',
    });
  });

  it('should fall back to alternate metadata keys', () => {
    expect(getAuthProfileDefaults({
      name: 'Grace Hopper',
      picture: 'https://example.com/grace.png',
    }, 'grace@example.com')).toEqual({
      displayName: 'Grace Hopper',
      avatarUrl: 'https://example.com/grace.png',
    });
  });

  it('should fall back to email and defaults when metadata is unusable', () => {
    expect(getAuthProfileDefaults({ full_name: 42, avatar_url: false }, 'linus@example.com')).toEqual({
      displayName: 'linus',
      avatarUrl: null,
    });

    expect(getAuthProfileDefaults(null, undefined)).toEqual({
      displayName: 'User',
      avatarUrl: null,
    });
  });
});
