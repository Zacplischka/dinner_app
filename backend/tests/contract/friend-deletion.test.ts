import express from 'express';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  caller: '00000000-0000-4000-8000-000000000001',
  rows: [] as { user_id: string; friend_id: string }[],
  writes: [] as URL[],
  fail: false,
}));

// Real supabase-js serializes the privileged request; only fetch is local.
vi.mock('../../src/services/supabase.js', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('http://127.0.0.1:1', 'local-service-role', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          if (url.pathname === '/auth/v1/user') {
            return Response.json({ id: state.caller, role: 'authenticated' });
          }
          expect(url.pathname).toBe('/rest/v1/friendships');
          expect(init?.method).toBe('DELETE');
          state.writes.push(url);
          if (state.fail)
            return Response.json({ message: 'private database detail' }, { status: 500 });
          // Evaluate the actual serialized constraints against isolated relationships.
          // Reject any other grammar, including a missing ownership conjunction.
          expect([...url.searchParams.keys()]).toEqual(['or']);
          const match =
            /^\(and\(user_id\.eq\.([\da-f-]+),friend_id\.eq\.([\da-f-]+)\),and\(user_id\.eq\.([\da-f-]+),friend_id\.eq\.([\da-f-]+)\)\)$/i.exec(
              url.searchParams.get('or') ?? ''
            );
          expect(match).not.toBeNull();
          const [, a, b, c, d] = match!;
          state.rows = state.rows.filter(
            (row) =>
              !(
                (row.user_id === a && row.friend_id === b) ||
                (row.user_id === c && row.friend_id === d)
              )
          );
          return new Response(null, { status: 204 });
        },
      },
    }),
  };
});
const { createFriendsRouter } = await import('../../src/api/friends.js');
const { createFriendsService } = await import('../../src/services/FriendsService.js');
const store = await import('../../src/store/friendsStore.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const app = express();
app.use('/api', createFriendsRouter(createFriendsService({ store })));
app.use(errorHandler);
const [A, B, C, D] = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const remove = (id: string) =>
  request(app)
    .delete(`/api/friends/${encodeURIComponent(id)}`)
    .set('Authorization', 'Bearer local-test');
beforeEach(() => {
  state.caller = A;
  state.rows = [
    { user_id: A, friend_id: B },
    { user_id: A, friend_id: C },
    { user_id: C, friend_id: D },
  ];
  state.writes = [];
  state.fail = false;
});

it.each(['not-a-uuid', `${B},user_id.neq.${A}`, `${B}),id.not.is.null`, `${B}\n`, 'null', '123'])(
  'rejects malformed identifier %j before any write',
  async (id) => {
    const before = structuredClone(state.rows);
    const response = await remove(id).expect(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Friend identifiers must be valid UUIDs',
    });
    expect(state.writes).toEqual([]);
    expect(state.rows).toEqual(before);
  }
);

it.each([false, true])(
  'deletes only the caller/target relationship (reverse=%s)',
  async (reverse) => {
    if (reverse) state.rows[0] = { user_id: B, friend_id: A };
    const preserved = state.rows.slice(1);
    await remove(B).expect(204);
    expect(state.rows).toEqual(preserved);
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].searchParams.get('or')).toBe(
      `(and(user_id.eq.${A},friend_id.eq.${B}),and(user_id.eq.${B},friend_id.eq.${A}))`
    );
    // A valid unrelated Profile identifier cannot remove C/D.
    await remove(D).expect(204);
    await remove(B).expect(204); // existing no-op contract
    expect(state.rows).toEqual(preserved);
  }
);

it('rejects unauthenticated removal without a write', async () => {
  const response = await request(app).delete(`/api/friends/${B}`).expect(401);
  expect(response.body.code).toBe('MISSING_TOKEN');
  expect(state.writes).toEqual([]);
});

it('validates the caller at the privileged store boundary too', async () => {
  await expect(store.deleteFriendshipBetween('invalid', B)).rejects.toMatchObject({
    code: 'validation_error',
  });
  expect(state.writes).toEqual([]);
});

it('preserves canonical persistence failure and local data', async () => {
  state.fail = true;
  const before = structuredClone(state.rows);
  const response = await remove(B).expect(500);
  expect(response.body).toEqual({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
  expect(state.rows).toEqual(before);
});
