import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  responses: [] as Array<any>,
  calls: [] as Array<{ table: string; operation: string; args: unknown[] }>,
  user: {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'authenticated',
  },
  authUserResponse: {
    data: {
      user: {
        user_metadata: {
          full_name: 'Alice Example',
          avatar_url: 'https://example.com/alice.png',
        },
      },
    },
  },
}));

vi.mock('../../src/middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = mockState.user;
    next();
  },
}));

vi.mock('../../src/services/supabase.js', () => {
  function nextResponse() {
    const response = mockState.responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    return response ?? { data: null, error: null };
  }

  function builder(table: string): any {
    const query: any = {};
    for (const method of [
      'select',
      'eq',
      'neq',
      'limit',
      'or',
      'in',
      'order',
      'insert',
      'update',
      'delete',
      'upsert',
    ]) {
      query[method] = (...args: unknown[]) => {
        mockState.calls.push({ table, operation: method, args });
        return query;
      };
    }
    query.single = async () => nextResponse();
    query.maybeSingle = async () => nextResponse();
    query.then = (resolve: any, reject: any) =>
      Promise.resolve().then(nextResponse).then(resolve, reject);
    return query;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => builder(table)),
      auth: {
        admin: {
          getUserById: vi.fn(async () => mockState.authUserResponse),
        },
      },
    },
  };
});

const { createFriendsRouter } = await import('../../src/api/friends.js');
const { createFriendsService } = await import('../../src/services/FriendsService.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const friendsStore = await import('../../src/store/friendsStore.js');
const friendsRouter = createFriendsRouter(createFriendsService({ store: friendsStore }));

// Thrown DomainErrors now flow to the app-level errorHandler (the single
// transport mapping), exactly as they do in the real server wiring.
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', friendsRouter);
  app.use(errorHandler);
  return app;
}

describe('friends API router', () => {
  const app = makeApp();
  const profile = {
    id: 'user-1',
    email: 'alice@example.com',
    display_name: 'Alice',
    avatar_url: 'https://example.com/alice.png',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  const bobProfile = {
    id: 'user-2',
    email: 'bob@example.com',
    display_name: 'Bob',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockState.responses = [];
    mockState.calls = [];
    mockState.user = {
      id: 'user-1',
      email: 'alice@example.com',
      role: 'authenticated',
    };
    mockState.authUserResponse = {
      data: {
        user: {
          user_metadata: {
            full_name: 'Alice Example',
            avatar_url: 'https://example.com/alice.png',
          },
        },
      },
    };
  });

  it('GET /users/me should return the existing user profile', async () => {
    mockState.responses.push({ data: profile, error: null });

    const response = await request(app).get('/api/users/me').expect(200);

    expect(response.body).toEqual({
      id: 'user-1',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/alice.png',
      email: 'alice@example.com',
    });
  });

  it('GET /users/me should create a profile when one does not exist', async () => {
    mockState.responses.push(
      { data: null, error: { code: 'PGRST116' } },
      { data: profile, error: null }
    );

    const response = await request(app).get('/api/users/me').expect(200);

    expect(response.body.displayName).toBe('Alice');
    expect(mockState.calls).toEqual(
      expect.arrayContaining([expect.objectContaining({ table: 'profiles', operation: 'insert' })])
    );
  });

  it('GET /users/me should create profiles from alternate auth metadata fields', async () => {
    mockState.authUserResponse = {
      data: {
        user: {
          user_metadata: {
            name: 'Alice Alt',
            picture: 'https://example.com/picture.png',
          },
        },
      },
    };
    mockState.responses.push(
      { data: null, error: { code: 'PGRST116' } },
      { data: profile, error: null }
    );

    await request(app).get('/api/users/me').expect(200);

    expect(mockState.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'profiles',
          operation: 'insert',
          args: [
            expect.objectContaining({
              display_name: 'Alice Alt',
              avatar_url: 'https://example.com/picture.png',
            }),
          ],
        }),
      ])
    );
  });

  it('GET /users/me should create profiles with email and anonymous fallbacks', async () => {
    mockState.authUserResponse = { data: { user: { user_metadata: {} } } };
    mockState.responses.push(
      { data: null, error: { code: 'PGRST116' } },
      { data: profile, error: null }
    );

    await request(app).get('/api/users/me').expect(200);

    expect(mockState.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'profiles',
          operation: 'insert',
          args: [
            expect.objectContaining({
              display_name: 'alice',
              avatar_url: null,
            }),
          ],
        }),
      ])
    );

    mockState.user = {
      id: 'user-1',
      role: 'authenticated',
    } as typeof mockState.user;
    mockState.authUserResponse = { data: { user: {} } };
    mockState.responses.push(
      { data: null, error: { code: 'PGRST116' } },
      { data: profile, error: null }
    );

    await request(app).get('/api/users/me').expect(200);

    expect(mockState.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'profiles',
          operation: 'insert',
          args: [
            expect.objectContaining({
              email: null,
              display_name: 'User',
              avatar_url: null,
            }),
          ],
        }),
      ])
    );
  });

  it('GET /users/search should require an email query parameter', async () => {
    const response = await request(app).get('/api/users/search').expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Email query parameter is required',
    });
  });

  it('GET /users/search should return exact email matches excluding the current user', async () => {
    mockState.responses.push({ data: [bobProfile], error: null });

    const response = await request(app).get('/api/users/search?email=BOB@example.com').expect(200);

    expect(response.body).toEqual({
      users: [
        {
          id: 'user-2',
          displayName: 'Bob',
          avatarUrl: null,
          email: 'bob@example.com',
        },
      ],
    });
    expect(mockState.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'profiles', operation: 'neq' }),
        expect.objectContaining({ table: 'profiles', operation: 'limit' }),
      ])
    );
  });

  it('GET /users/search should fall back when Supabase returns null or partial profiles', async () => {
    mockState.responses.push({ data: null, error: null });

    await request(app)
      .get('/api/users/search?email=none@example.com')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ users: [] });
      });

    mockState.responses.push({ data: [{}], error: null });

    await request(app)
      .get('/api/users/search?email=partial@example.com')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          users: [
            {
              id: '',
              displayName: 'Unknown User',
              avatarUrl: null,
              email: null,
            },
          ],
        });
      });
  });

  it('GET /friends should return an empty list when there are no friendships', async () => {
    mockState.responses.push({ data: [], error: null });

    const response = await request(app).get('/api/friends').expect(200);

    expect(response.body).toEqual({ friends: [] });
  });

  it('GET /friends should return accepted friends with profile data', async () => {
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

    const response = await request(app).get('/api/friends').expect(200);

    expect(response.body).toEqual({
      friends: [
        {
          id: 'user-2',
          friendshipId: 'friendship-1',
          displayName: 'Bob',
          avatarUrl: null,
          email: 'bob@example.com',
          status: 'accepted',
        },
      ],
    });
  });

  it('GET /friends should map reverse friendships and missing profile fields', async () => {
    mockState.responses.push(
      {
        data: [
          {
            id: 'friendship-2',
            user_id: 'user-3',
            friend_id: 'user-1',
            status: 'accepted',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [{ id: 'user-3' }], error: null }
    );

    const response = await request(app).get('/api/friends').expect(200);

    expect(response.body).toEqual({
      friends: [
        {
          id: 'user-3',
          friendshipId: 'friendship-2',
          displayName: 'Unknown User',
          avatarUrl: null,
          email: null,
          status: 'accepted',
        },
      ],
    });
  });

  it('GET /friends/requests should return pending requests with fallback profiles', async () => {
    mockState.responses.push(
      {
        data: [
          {
            id: 'request-1',
            user_id: 'user-3',
            created_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [], error: null }
    );

    const response = await request(app).get('/api/friends/requests').expect(200);

    expect(response.body).toEqual({
      requests: [
        {
          id: 'request-1',
          fromUser: {
            id: 'user-3',
            displayName: 'Unknown User',
            avatarUrl: null,
            email: null,
          },
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('GET /friends/requests should return an empty request list', async () => {
    mockState.responses.push({ data: [], error: null });

    const response = await request(app).get('/api/friends/requests').expect(200);

    expect(response.body).toEqual({ requests: [] });
  });

  it('POST /friends/request should require email', async () => {
    const response = await request(app).post('/api/friends/request').send({}).expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Email is required',
    });
  });

  it('POST /friends/request should create a pending friend request', async () => {
    mockState.responses.push(
      { data: { id: 'user-2' }, error: null },
      { data: null, error: null },
      { data: { id: 'request-1' }, error: null }
    );

    const response = await request(app)
      .post('/api/friends/request')
      .send({ email: 'bob@example.com' })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      requestId: 'request-1',
      message: 'Friend request sent',
    });
  });

  it.each([
    ['accepted', 409, 'ALREADY_FRIENDS', 'You are already friends with this user'],
    ['pending', 409, 'REQUEST_PENDING', 'A friend request is already pending'],
    // A block is never revealed: it maps to the same 404 NOT_FOUND and the same
    // message as the missing-user path, so the code doesn't leak what it conceals.
    ['blocked', 404, 'NOT_FOUND', 'User not found with that email'],
  ])(
    'POST /friends/request should reject existing %s friendships with a canonical error',
    async (status, httpStatus, code, message) => {
      mockState.responses.push(
        { data: { id: 'user-2' }, error: null },
        { data: { id: 'friendship-1', status }, error: null }
      );

      const response = await request(app)
        .post('/api/friends/request')
        .send({ email: 'bob@example.com' })
        .expect(httpStatus);

      expect(response.body).toEqual({ code, message });
    }
  );

  it('POST /friends/request should reject unknown target users and self requests', async () => {
    mockState.responses.push({ data: null, error: { code: 'PGRST116' } });

    await request(app)
      .post('/api/friends/request')
      .send({ email: 'missing@example.com' })
      .expect(404);

    mockState.responses.push({ data: { id: 'user-1' }, error: null });

    const response = await request(app)
      .post('/api/friends/request')
      .send({ email: 'alice@example.com' })
      .expect(400);

    expect(response.body.message).toBe('You cannot send a friend request to yourself');
  });

  it('POST /friends/:requestId/accept should accept pending requests', async () => {
    mockState.responses.push(
      { data: { id: 'request-1' }, error: null },
      { data: null, error: null }
    );

    const response = await request(app).post('/api/friends/request-1/accept').expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Friend request accepted',
    });
  });

  it('POST /friends/:requestId/accept should return 404 for missing requests', async () => {
    mockState.responses.push({ data: null, error: { code: 'PGRST116' } });

    const response = await request(app).post('/api/friends/request-1/accept').expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Friend request not found',
    });
  });

  it('POST /friends/:requestId/decline should decline pending requests', async () => {
    mockState.responses.push({ data: null, error: null });

    const response = await request(app).post('/api/friends/request-1/decline').expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Friend request declined',
    });
  });

  it('DELETE /friends/:friendId should remove a friend', async () => {
    mockState.responses.push({ data: null, error: null });

    const response = await request(app).delete('/api/friends/user-2').expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Friend removed',
    });
  });

  it('POST /sessions/:code/invite should validate friendIds', async () => {
    const response = await request(app)
      .post('/api/sessions/AB123/invite')
      .send({ friendIds: [] })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'At least one friend ID is required',
    });
  });

  it('POST /sessions/:code/invite should invite only accepted friends', async () => {
    mockState.responses.push(
      {
        data: [
          { user_id: 'user-1', friend_id: 'user-2' },
          { user_id: 'user-3', friend_id: 'user-1' },
        ],
        error: null,
      },
      { data: null, error: null }
    );

    const response = await request(app)
      .post('/api/sessions/AB123/invite')
      .send({ friendIds: ['user-2', 'user-4'] })
      .expect(204);

    expect(response.body).toEqual({});
  });

  it('POST /sessions/:code/invite should fall back to individual inserts on upsert failure', async () => {
    mockState.responses.push(
      { data: [{ user_id: 'user-1', friend_id: 'user-2' }], error: null },
      { data: null, error: { message: 'upsert failed' } },
      { data: { id: 'invite-1' }, error: null }
    );

    await request(app)
      .post('/api/sessions/AB123/invite')
      .send({ friendIds: ['user-2'] })
      .expect(204);

    expect(mockState.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'session_invites', operation: 'insert' }),
      ])
    );
  });

  it('POST /sessions/:code/invite should reject when no provided ids are friends', async () => {
    mockState.responses.push({
      data: [{ user_id: 'user-1', friend_id: 'user-2' }],
      error: null,
    });

    const response = await request(app)
      .post('/api/sessions/AB123/invite')
      .send({ friendIds: ['user-4'] })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'No valid friend IDs provided',
    });
  });

  it('GET /invites should return an empty invite list', async () => {
    mockState.responses.push({ data: [], error: null });

    const response = await request(app).get('/api/invites').expect(200);

    expect(response.body).toEqual({ invites: [] });
  });

  it('GET /invites should return pending invites with inviter profile fallback', async () => {
    mockState.responses.push(
      {
        data: [
          {
            id: 'invite-1',
            session_code: 'AB123',
            inviter_id: 'user-2',
            status: 'pending',
            created_at: '2026-01-03T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [], error: { message: 'profile lookup failed' } }
    );

    const response = await request(app).get('/api/invites').expect(200);

    expect(response.body).toEqual({
      invites: [
        {
          id: 'invite-1',
          sessionCode: 'AB123',
          inviter: {
            id: 'user-2',
            displayName: 'Unknown User',
            avatarUrl: null,
            email: null,
          },
          status: 'pending',
          createdAt: '2026-01-03T00:00:00.000Z',
        },
      ],
    });
  });

  it('POST /invites/:inviteId/accept should accept session invites', async () => {
    mockState.responses.push({
      data: { id: 'invite-1', session_code: 'AB123' },
      error: null,
    });

    const response = await request(app).post('/api/invites/invite-1/accept').expect(200);

    expect(response.body).toEqual({ sessionCode: 'AB123' });
  });

  it('POST /invites/:inviteId/accept should return 404 for missing invites', async () => {
    mockState.responses.push({ data: null, error: { code: 'PGRST116' } });

    const response = await request(app).post('/api/invites/invite-1/accept').expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Session invite not found',
    });
  });

  it('POST /invites/:inviteId/decline should decline session invites', async () => {
    mockState.responses.push({ data: null, error: null });

    const response = await request(app).post('/api/invites/invite-1/decline').expect(204);

    expect(response.body).toEqual({});
  });

  it('GET /users/me should return database errors for profile fetch and create failures', async () => {
    mockState.responses.push({ data: null, error: { code: 'OTHER' } });

    await request(app)
      .get('/api/users/me')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push(
      { data: null, error: { code: 'PGRST116' } },
      { data: null, error: { message: 'insert failed' } }
    );

    await request(app)
      .get('/api/users/me')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it.each([
    ['get', '/api/users/me', undefined],
    ['get', '/api/users/search?email=bob@example.com', undefined],
    ['get', '/api/friends', undefined],
    ['get', '/api/friends/requests', undefined],
    ['post', '/api/friends/request', { email: 'bob@example.com' }],
    ['post', '/api/friends/request-1/accept', undefined],
    ['post', '/api/friends/request-1/decline', undefined],
    ['delete', '/api/friends/user-2', undefined],
    ['post', '/api/sessions/AB123/invite', { friendIds: ['user-2'] }],
    ['get', '/api/invites', undefined],
    ['post', '/api/invites/invite-1/accept', undefined],
    ['post', '/api/invites/invite-1/decline', undefined],
  ] as const)(
    '%s %s should return internal_error when Supabase throws',
    async (method, path, body) => {
      mockState.responses.push(new Error('supabase unavailable'));

      let pending = request(app)[method](path);
      if (body) {
        pending = pending.send(body);
      }

      await pending.expect(500).expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
    }
  );

  it('GET /users/search should return database errors', async () => {
    mockState.responses.push({ data: null, error: { message: 'search failed' } });

    const response = await request(app).get('/api/users/search?email=bob@example.com').expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });

  it('GET /friends should return database errors for friendships and profiles', async () => {
    mockState.responses.push({ data: null, error: { message: 'friendship failed' } });

    await request(app)
      .get('/api/friends')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push(
      {
        data: [{ id: 'friendship-1', user_id: 'user-1', friend_id: 'user-2' }],
        error: null,
      },
      { data: null, error: { message: 'profile failed' } }
    );

    await request(app)
      .get('/api/friends')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it('GET /friends/requests should return database errors for request lookup failures', async () => {
    mockState.responses.push({ data: null, error: { message: 'request failed' } });

    await request(app)
      .get('/api/friends/requests')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it('GET /friends/requests should return database errors for profile lookup failures', async () => {
    mockState.responses.push(
      { data: [{ id: 'request-1', user_id: 'user-2', created_at: 'now' }], error: null },
      { data: null, error: { message: 'profile failed' } }
    );

    await request(app)
      .get('/api/friends/requests')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it('POST /friends/request should return database errors for check and create failures', async () => {
    mockState.responses.push(
      { data: { id: 'user-2' }, error: null },
      { data: null, error: { message: 'check failed' } }
    );

    await request(app)
      .post('/api/friends/request')
      .send({ email: 'bob@example.com' })
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push(
      { data: { id: 'user-2' }, error: null },
      { data: null, error: null },
      { data: null, error: { message: 'create failed' } }
    );

    await request(app)
      .post('/api/friends/request')
      .send({ email: 'bob@example.com' })
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it('friend mutation endpoints should return database errors', async () => {
    mockState.responses.push(
      { data: { id: 'request-1' }, error: null },
      { data: null, error: { message: 'accept failed' } }
    );

    await request(app)
      .post('/api/friends/request-1/accept')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push({ data: null, error: { message: 'decline failed' } });

    await request(app)
      .post('/api/friends/request-1/decline')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push({ data: null, error: { message: 'delete failed' } });

    await request(app)
      .delete('/api/friends/user-2')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });

  it('session invite endpoints should return database errors', async () => {
    mockState.responses.push({ data: null, error: { message: 'friend lookup failed' } });

    await request(app)
      .post('/api/sessions/AB123/invite')
      .send({ friendIds: ['user-2'] })
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push({ data: null, error: { message: 'invite fetch failed' } });

    await request(app)
      .get('/api/invites')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });

    mockState.responses.push({ data: null, error: { message: 'decline invite failed' } });

    await request(app)
      .post('/api/invites/invite-1/decline')
      .expect(500)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        });
      });
  });
});
