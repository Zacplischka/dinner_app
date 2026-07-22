// Guards the composition-root boundary: stores, services, and routers are
// factories only. Importing them must never open a Redis connection - only
// server.ts (the composition root) constructs production instances.
import { describe, expect, it, vi } from 'vitest';

vi.mock('ioredis', () => {
  const Redis = vi.fn(() => ({ on: vi.fn() }));
  return { default: Redis, Redis };
});

describe('composition root', () => {
  it('importing stores, services, and routers opens no Redis connection', async () => {
    await import('../../src/store/sessionStore.js');
    await import('../../src/services/SessionService.js');
    await import('../../src/services/FriendsService.js');
    await import('../../src/services/OrderService.js');
    await import('../../src/api/sessions.js');
    await import('../../src/api/options.js');
    await import('../../src/api/friends.js');

    const { default: Redis } = await import('ioredis');
    expect(Redis).not.toHaveBeenCalled();
  });
});
