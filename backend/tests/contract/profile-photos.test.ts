// Actual router, FriendsStore, auth verification and raster codec; only Supabase's remote boundary is faked.
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: new Map<
    string,
    { id: string; display_name: string; email: string; avatar_url: string | null }
  >(),
  failSave: false,
}));
vi.mock('../../src/services/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async (token: string) => ({
        data: {
          user: state.rows.has(token)
            ? {
                id: token,
                email: `${token}@example.test`,
                user_metadata: { id: 'spoofed', avatar_url: 'https://example.test/spoof.jpg' },
              }
            : null,
        },
        error: null,
      })),
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { user_metadata: { avatar_url: 'https://example.test/google.jpg' } } },
        })),
      },
    },
    from: vi.fn(() => {
      let id = '';
      let update: { avatar_url: string | null } | undefined;
      const query = {
        select: () => query,
        eq: (_field: string, value: string) => {
          id = value;
          return query;
        },
        update: (value: { avatar_url: string | null }) => {
          update = value;
          return query;
        },
        single: async () => {
          const row = state.rows.get(id);
          if (!row) return { data: null, error: { code: 'PGRST116' } };
          if (update && state.failSave) return { data: null, error: { code: 'unavailable' } };
          if (update) row.avatar_url = update.avatar_url;
          return { data: { ...row }, error: null };
        },
      };
      return query;
    }),
  },
}));
const { createFriendsRouter } = await import('../../src/api/friends.js');
const { createFriendsService } = await import('../../src/services/FriendsService.js');
const store = await import('../../src/store/friendsStore.js');
const { errorHandler } = await import('../../src/middleware/errorHandler.js');
const { resolveSessionAvatar } = await import('../../src/websocket/socketAuth.js');
const { encodeProfilePhoto, ownedPhotoBytes, profileAvatarUrl } =
  await import('../../src/services/profilePhoto.js');
const service = createFriendsService({ store });
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const input = await sharp({
  create: { width: 400, height: 300, channels: 3, background: '#EA7058' },
})
  .png()
  .toBuffer();
let app: express.Express;
beforeEach(() => {
  state.failSave = false;
  state.rows.clear();
  ids.forEach((id, i) =>
    state.rows.set(id, {
      id,
      display_name: `Person ${i}`,
      email: `${id}@example.test`,
      avatar_url: 'https://example.test/google.jpg',
    })
  );
  app = express();
  app.use(express.json()); // same parser ordering as production
  app.use('/api', createFriendsRouter(service));
  app.use(errorHandler);
});
const upload = (bytes: Buffer = input, type = 'image/png', id = ids[0]) =>
  request(app)
    .put('/api/users/me/photo')
    .set('Authorization', `Bearer ${id}`)
    .set('Content-Type', type)
    .send(bytes);

describe('persistent Profile photos', () => {
  it('saves only a bounded stripped JPEG, exposes versioned URLs, replaces/removes atomically and preserves the choice after fresh auth', async () => {
    const original = await sharp(input).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const saved = await upload(original, 'image/jpeg').expect(200);
    const url = saved.body.avatarUrl as string;
    expect(url).toMatch(new RegExp(`^/api/profile-photos/${ids[0]}/[a-f0-9]{64}\\.jpg$`));
    expect(saved.body).not.toHaveProperty('photo');
    const photo = await request(app)
      .get(url)
      .expect(200)
      .expect('Content-Type', /image\/jpeg/);
    expect(photo.headers['cache-control']).toBe('private, max-age=60');
    const metadata = await sharp(photo.body as Buffer).metadata();
    expect(metadata).toMatchObject({ width: 256, height: 256, format: 'jpeg' });
    expect(metadata.exif).toBeUndefined();
    expect((photo.body as Buffer).length).toBeLessThanOrEqual(65536);
    expect(
      (await request(app).get('/api/users/me').set('Authorization', `Bearer ${ids[0]}`).expect(200))
        .body.avatarUrl
    ).toBe(url);
    expect(await resolveSessionAvatar(ids[0], service)).toBe(url);
    expect(state.rows.get(ids[1])!.avatar_url).toBe('https://example.test/google.jpg');
    state.failSave = true;
    await upload().expect(500);
    await request(app).get(url).expect(200);
    state.failSave = false;
    const different = await sharp(input).tint('blue').png().toBuffer();
    const replaced = await upload(different).expect(200);
    expect(replaced.body.avatarUrl).not.toBe(url);
    await request(app).get(url).expect(404);
    expect(
      (
        await request(app)
          .delete('/api/users/me/photo')
          .set('Authorization', `Bearer ${ids[0]}`)
          .expect(200)
      ).body.avatarUrl
    ).toBeNull();
    expect(state.rows.get(ids[0])!.avatar_url).toBeNull();
    await request(app)
      .get(replaced.body.avatarUrl as string)
      .expect(404);
    expect(
      (await request(app).get('/api/users/me').set('Authorization', `Bearer ${ids[0]}`).expect(200))
        .body.avatarUrl
    ).toBeNull();
    expect(await resolveSessionAvatar(ids[0], service)).toBeNull();
  });

  it('rejects unauthenticated, invalid-token and arbitrary target/URL mutations', async () => {
    await request(app)
      .put('/api/users/me/photo')
      .set('Content-Type', 'image/png')
      .send(input)
      .expect(401);
    await upload(input, 'image/png', 'forged').expect(401);
    await request(app).delete('/api/users/me/photo').expect(401);
    await request(app)
      .put(`/api/users/${ids[1]}/photo`)
      .set('Authorization', `Bearer ${ids[0]}`)
      .send({ avatarUrl: 'https://example.test/stolen.jpg' })
      .expect(404);
    await request(app)
      .put('/api/users/me/photo')
      .set('Authorization', `Bearer ${ids[0]}`)
      .send({ id: ids[1], avatarUrl: 'https://example.test/stolen.jpg' })
      .expect(400);
    expect(await resolveSessionAvatar('forged', service)).toBeNull();
    expect(await resolveSessionAvatar(undefined, service)).toBeNull();
    expect(state.rows.get(ids[1])!.avatar_url).toBe('https://example.test/google.jpg');
  });

  it('rejects oversized, invalid, vector, MIME-mismatched, animated and excessive-dimension input without changing the row', async () => {
    await upload(Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')).expect(400);
    await upload(Buffer.from('not a picture')).expect(400);
    await upload(input, 'image/jpeg').expect(400);
    const large = await sharp({
      create: { width: 4097, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await upload(large).expect(400);
    const frames = await sharp({ create: { width: 2, height: 4, channels: 3, background: 'red' } })
      .raw()
      .toBuffer();
    frames.fill(100, 12);
    const animated = await sharp(frames, {
      raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
    })
      .webp({ delay: [100, 100] })
      .toBuffer();
    await expect(encodeProfilePhoto(animated, 'image/webp')).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(state.rows.get(ids[0])!.avatar_url).toBe('https://example.test/google.jpg');
  });

  it('handles unavailable cosmetic reads within the admission budget and never returns app bytes through a DTO', async () => {
    const encoded = await encodeProfilePhoto(input, 'image/png');
    expect(ownedPhotoBytes(encoded)).not.toBeNull();
    expect(profileAvatarUrl(ids[0], encoded)).toMatch(/^\/api\/profile-photos\//);
    expect(profileAvatarUrl(ids[0], 'data:text/html,bad')).toBeNull();
    expect(profileAvatarUrl(ids[0], 'javascript:alert(1)')).toBeNull();
    const failed = {
      getCurrentProfile: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    expect(await resolveSessionAvatar(ids[0], failed)).toBeNull();
    vi.useFakeTimers();
    try {
      const pending = resolveSessionAvatar(ids[0], {
        getCurrentProfile: () => new Promise(() => undefined),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
