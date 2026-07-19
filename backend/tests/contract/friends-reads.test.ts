// Transport tests for the Profile/Friend/Friend-Request READ contract (#106).
// Unlike friends.test.ts (which stubs requireAuth), these run the real auth
// middleware: each read operation proves its successful wire shape with a
// verified token, and that an authentication failure returns the canonical
// public { code, message } error instead of reaching the store.

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  responses: [] as Array<{ data: unknown; error: unknown }>,
  authUser: {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'authenticated',
    app_metadata: {},
  } as Record<string, unknown> | null,
}));

vi.mock('../../src/services/supabase.js', () => {
  function nextResponse() {
    return mockState.responses.shift() ?? { data: null, error: null };
  }

  function builder(): any {
    const query: any = {};
    for (const method of ['select', 'eq', 'neq', 'limit', 'or', 'in', 'order']) {
      query[method] = () => query;
    }
    query.single = async () => nextResponse();
    query.maybeSingle = async () => nextResponse();
    query.then = (resolve: any, reject: any) =>
      Promise.resolve().then(nextResponse).then(resolve, reject);
    return query;
  }

  return {
    supabase: {
      from: vi.fn(() => builder()),
      auth: {
        // The real requireAuth verifies the Bearer token through this call.
        getUser: vi.fn(async () =>
          mockState.authUser
            ? { data: { user: mockState.authUser }, error: null }
            : { data: { user: null }, error: { message: 'invalid token' } }
        ),
        admin: {
          getUserById: vi.fn(async () => ({ data: { user: null } })),
        },
      },
    },
  };
});

const { createFriendsRouter } = await import('../../src/api/friends.js');
const { createFriendsService } = await import('../../src/services/FriendsService.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const friendsStore = await import('../../src/store/friendsStore.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', createFriendsRouter(createFriendsService({ store: friendsStore })));
  app.use(errorHandler);
  return app;
}

describe('friends read transport (real auth middleware)', () => {
  const app = makeApp();
  const auth = { Authorization: 'Bearer valid-token' };

  const aliceProfile = {
    id: 'user-1',
    email: 'alice@example.com',
    display_name: 'Alice',
    avatar_url: null,
  };
  const bobProfile = {
    id: 'user-2',
    email: 'bob@example.com',
    display_name: 'Bob',
    avatar_url: 'https://example.com/bob.png',
  };

  beforeEach(() => {
    mockState.responses = [];
    mockState.authUser = {
      id: 'user-1',
      email: 'alice@example.com',
      role: 'authenticated',
      app_metadata: {},
    };
  });

  describe('GET /api/users/me', () => {
    it('returns the caller profile on success', async () => {
      mockState.responses.push({ data: aliceProfile, error: null });

      const response = await request(app).get('/api/users/me').set(auth).expect(200);

      expect(response.body).toEqual({
        id: 'user-1',
        displayName: 'Alice',
        avatarUrl: null,
        email: 'alice@example.com',
      });
    });

    it('returns the canonical auth error without a token', async () => {
      const response = await request(app).get('/api/users/me').expect(401);

      expect(response.body).toEqual({
        code: 'MISSING_TOKEN',
        message: 'Authentication required',
      });
    });
  });

  describe('GET /api/users/search', () => {
    it('returns exact email matches on success', async () => {
      mockState.responses.push({ data: [bobProfile], error: null });

      const response = await request(app)
        .get('/api/users/search?email=bob@example.com')
        .set(auth)
        .expect(200);

      expect(response.body).toEqual({
        users: [
          {
            id: 'user-2',
            displayName: 'Bob',
            avatarUrl: 'https://example.com/bob.png',
            email: 'bob@example.com',
          },
        ],
      });
    });

    it('returns the canonical auth error without a token', async () => {
      const response = await request(app)
        .get('/api/users/search?email=bob@example.com')
        .expect(401);

      expect(response.body).toEqual({
        code: 'MISSING_TOKEN',
        message: 'Authentication required',
      });
    });
  });

  describe('GET /api/friends', () => {
    it('returns accepted friends on success', async () => {
      mockState.responses.push(
        {
          data: [
            {
              id: 'friendship-1',
              user_id: 'user-1',
              friend_id: 'user-2',
              status: 'accepted',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          error: null,
        },
        { data: [bobProfile], error: null }
      );

      const response = await request(app).get('/api/friends').set(auth).expect(200);

      expect(response.body).toEqual({
        friends: [
          {
            id: 'user-2',
            friendshipId: 'friendship-1',
            displayName: 'Bob',
            avatarUrl: 'https://example.com/bob.png',
            email: 'bob@example.com',
            status: 'accepted',
          },
        ],
      });
    });

    it('returns the canonical auth error without a token', async () => {
      const response = await request(app).get('/api/friends').expect(401);

      expect(response.body).toEqual({
        code: 'MISSING_TOKEN',
        message: 'Authentication required',
      });
    });
  });

  describe('GET /api/friends/requests', () => {
    it('returns pending requests with sender profiles on success', async () => {
      mockState.responses.push(
        {
          data: [{ id: 'request-1', user_id: 'user-2', created_at: '2026-01-02T00:00:00.000Z' }],
          error: null,
        },
        { data: [bobProfile], error: null }
      );

      const response = await request(app).get('/api/friends/requests').set(auth).expect(200);

      expect(response.body).toEqual({
        requests: [
          {
            id: 'request-1',
            fromUser: {
              id: 'user-2',
              displayName: 'Bob',
              avatarUrl: 'https://example.com/bob.png',
              email: 'bob@example.com',
            },
            createdAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      });
    });

    it('returns the canonical auth error without a token', async () => {
      const response = await request(app).get('/api/friends/requests').expect(401);

      expect(response.body).toEqual({
        code: 'MISSING_TOKEN',
        message: 'Authentication required',
      });
    });
  });
});
