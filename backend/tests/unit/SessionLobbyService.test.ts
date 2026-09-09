import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import type { Branch, Restaurant, Recipe } from '@dinder/shared/types';
import { createSessionStore } from '../../src/store/sessionStore.js';
import {
  createSessionService,
  type SessionServiceDeps,
} from '../../src/services/SessionService.js';
import {
  corpusMovieSource,
  dealMovieDeck,
  redealMovieDeck,
} from '../../src/services/MovieDeckService.js';
import { logger } from '../../src/logger.js';

const recipe: Recipe = {
  kind: 'recipe',
  placeId: 'r1',
  name: 'Rice',
  diets: ['vegan', 'gluten free'],
};
const movies = corpusMovieSource(
  Array.from({ length: 20 }, (_, i) => ({
    kind: 'movie' as const,
    placeId: `m${i}`,
    name: `Movie ${i}`,
    genres: ['Action'],
    mediaType: i % 2 ? ('tv' as const) : ('movie' as const),
  }))
);
const identity = <T>(items: readonly T[]) => [...items];

describe('gather-first Sessions', () => {
  let redis: Redis;
  let store: ReturnType<typeof createSessionStore>;
  let service: ReturnType<typeof createSessionService>;
  let supply: ReturnType<typeof vi.fn<SessionServiceDeps['dealRecipeDeck']>>;
  let search: ReturnType<typeof vi.fn<SessionServiceDeps['searchNearbyRestaurants']>>;
  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushall();
    store = createSessionStore(redis);
    supply = vi.fn<SessionServiceDeps['dealRecipeDeck']>(async (_craving, _deckSize) => ({
      entries: [recipe],
      recipeSourceDown: false,
    }));
    search = vi.fn<SessionServiceDeps['searchNearbyRestaurants']>(async (_params) => [
      { placeId: 'venue', name: 'Cafe' },
    ]);
    service = createSessionService({
      store,
      searchNearbyRestaurants: search,
      dealRecipeDeck: supply,
      redealRecipeDeck: async (_key, entries) => entries,
      dealMovieDeck: (mood, deckSize, interests) =>
        dealMovieDeck(mood, { source: movies, deckSize, interests, shuffle: identity }),
      redealMovieDeck: (mood, current, deckSize, interests) =>
        redealMovieDeck(mood, current, { source: movies, deckSize, interests, shuffle: identity }),
      mintShoppingList: async () => undefined,
    });
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    redis.disconnect();
    vi.restoreAllMocks();
  });
  for (const branch of ['eatout', 'takeaway', 'cook', 'watch'] as const) {
    it(`keeps verified photo references attached through four-participant ${branch} lifecycle and guest rejoin`, async () => {
      const created = await service.createSession('Alice', {
        branch,
        collaborative: true,
        deckSize: 5,
      });
      const code = created.sessionCode;
      const names = ['Alice', 'Bob', 'Cara', 'Dan'];
      const avatars = names.map((name) => `https://example.test/${name}.jpg`);
      const joins = [];
      for (let i = 0; i < 4; i++)
        joins.push(await service.joinSession(code, `p${i}`, names[i], undefined, avatars[i]));
      expect(joins[3].participants.map((p) => p.avatarUrl)).toEqual(avatars);
      const lobby = (await service.getLobby(code))!;
      expect(lobby.participants.map((p) => p.avatarUrl)).toEqual(avatars);
      // Same-socket recovery also overwrites a removed photo, never leaves stale Redis fields.
      await service.joinSession(code, 'p2', 'Cara', joins[2].rejoinToken, null);
      expect((await store.getParticipant('p2'))!.avatarUrl).toBeNull();
      await store.markDisconnected('p1');
      await service.joinSession(code, 'p1-new', 'Bob', joins[1].rejoinToken, avatars[1]);
      expect(await store.getParticipant('p1')).toBeNull();
      const ids = ['p0', 'p1-new', 'p2', 'p3'];
      if (branch === 'eatout' || branch === 'takeaway')
        await service.updateChoices(code, 'p0', {
          sessionCode: code,
          revision: (await service.getLobby(code))!.revision,
          location: { latitude: -37.81, longitude: 144.96 },
        });
      for (const id of ids)
        await service.setReady(code, id, (await service.getLobby(code))!.revision, true);
      await service.startRound(code, 'p0', (await service.getLobby(code))!.revision);
      expect(
        (await service.getLobby(code))!.participants.find((p) => p.displayName === 'Bob')!.avatarUrl
      ).toBe(avatars[1]);
      const entry = (await store.getDeck(code)).entries[0];
      for (const id of ids)
        await service.submitSelections(
          code,
          id,
          [entry.placeId],
          (await service.getLobby(code))!.round
        );
      expect((await store.readSession(code))!.state).toBe('complete');
      await service.restartSession(code, 'p0');
      const restarted = (await service.getLobby(code))!;
      expect(restarted.participants).toHaveLength(4);
      expect(restarted.participants.every((p) => !p.ready && !p.hasSubmitted)).toBe(true);
      expect(restarted.participants.find((p) => p.displayName === 'Bob')!.avatarUrl).toBe(
        avatars[1]
      );
      await service.leaveSession(code, 'p3');
      expect((await service.getLobby(code))!.participants.map((p) => p.displayName)).not.toContain(
        'Dan'
      );
    });
  }

  async function joined(branch: Branch = 'watch') {
    const created = await service.createSession('Host', {
      branch,
      collaborative: true,
      deckSize: 5,
    });
    const host = await service.joinSession(created.sessionCode, 'host', 'Host');
    const guest = await service.joinSession(created.sessionCode, 'guest', 'Guest');
    return { code: created.sessionCode, host, guest };
  }
  async function revision(code: string) {
    return (await service.getLobby(code))!.revision;
  }
  async function ready(code: string, id: string) {
    return service.setReady(code, id, await revision(code), true);
  }
  async function start(code: string) {
    await ready(code, 'host');
    await ready(code, 'guest');
    return service.startRound(code, 'host', await revision(code));
  }

  it.each(['watch', 'cook', 'eatout', 'takeaway'] as const)(
    'creates an invitable %s Lobby before supply, preserving explicit Ready',
    async (branch) => {
      const { code } = await joined(branch);
      expect((await store.getDeck(code)).entries).toEqual([]);
      expect(search).not.toHaveBeenCalled();
      expect(supply).not.toHaveBeenCalled();
      expect((await service.getLobby(code))?.participants.every((p) => !p.ready)).toBe(true);
      await expect(service.startRound(code, 'host', await revision(code))).rejects.toThrow(
        'Everyone must confirm Ready'
      );
    }
  );

  it('clears only personal Ready, all Ready for shared edits, and preserves consent on reconnect', async () => {
    const { code, host } = await joined();
    await ready(code, 'host');
    await ready(code, 'guest');
    await service.updateChoices(code, 'guest', {
      sessionCode: code,
      revision: await revision(code),
      mood: { genres: ['Action'], decades: [] },
    });
    expect((await service.getLobby(code))?.participants.map((p) => p.ready)).toEqual([true, false]);
    await service.joinSession(code, 'host2', 'Host', host.rejoinToken);
    expect(
      (await service.getLobby(code))?.participants.find((p) => p.displayName === 'Host')?.ready
    ).toBe(true);
    await service.updateChoices(code, 'host2', {
      sessionCode: code,
      revision: await revision(code),
      deckSize: 10,
    });
    expect((await service.getLobby(code))?.participants.every((p) => !p.ready)).toBe(true);
  });

  it('starts one frozen common Watch round; a stale second start cannot redeal', async () => {
    const { code } = await joined();
    await ready(code, 'host');
    await ready(code, 'guest');
    const rev = await revision(code);
    const results = await Promise.allSettled([
      service.startRound(code, 'host', rev),
      service.startRound(code, 'host', rev),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await service.getLobby(code))?.state).toBe('selecting');
    const entries = (await store.getDeck(code)).entries;
    expect(entries).toHaveLength(5);
    expect(new Set(entries.map((e) => (e.kind === 'movie' ? e.mediaType : '')))).toEqual(
      new Set(['movie', 'tv'])
    );
  });

  it.each(['eatout', 'takeaway'] as const)(
    'discards %s supply if a shared area edit races with start',
    async (branch) => {
      const { code } = await joined(branch);
      await service.updateChoices(code, 'guest', {
        sessionCode: code,
        revision: await revision(code),
        location: { latitude: -37, longitude: 145, address: 'Manual postcode' },
      });
      await ready(code, 'host');
      await ready(code, 'guest');
      let finish!: (entries: Restaurant[]) => void;
      search.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const starting = service.startRound(code, 'host', await revision(code));
      while (!finish) await new Promise((resolve) => setTimeout(resolve, 1));
      await service.updateChoices(code, 'guest', {
        sessionCode: code,
        revision: await revision(code),
        searchRadiusMiles: 10,
      });
      finish([{ placeId: 'wrong-area', name: 'Old area' }]);
      await expect(starting).rejects.toThrow('changed');
      expect((await store.getDeck(code)).entries).toEqual([]);
      expect((await service.getLobby(code))?.state).toBe('waiting');
    }
  );

  it('keeps an empty or failed Cook deal in the Lobby without relaxing diets', async () => {
    const { code } = await joined('cook');
    await service.updateChoices(code, 'host', {
      sessionCode: code,
      revision: await revision(code),
      diets: ['vegetarian'],
    });
    await service.updateChoices(code, 'guest', {
      sessionCode: code,
      revision: await revision(code),
      diets: ['gluten free'],
    });
    supply.mockResolvedValue({
      entries: [{ ...recipe, diets: ['vegetarian'] } satisfies Recipe],
      recipeSourceDown: false,
    });
    await expect(start(code)).rejects.toMatchObject({ code: 'NO_RECIPES_FOUND' });
    expect((await service.getLobby(code))?.state).toBe('waiting');
    expect(supply.mock.calls[0][0].diets).toEqual(['gluten free', 'vegetarian']);
    expect((await store.getDeck(code)).entries).toEqual([]);
  });

  it('keeps conflicting Cook newcomers outside the Match until a Host Restart', async () => {
    const { code } = await joined('cook');
    await start(code);
    const newcomer = await service.joinSession(code, 'late', 'Late');
    expect(newcomer.participantCount).toBe(2);
    expect(
      newcomer.lobby?.participants.find((p) => p.participantId === 'late')?.waitingForNextRound
    ).toBe(true);
    await service.updateChoices(code, 'late', {
      sessionCode: code,
      revision: await revision(code),
      diets: ['ketogenic'],
    });
    await expect(service.submitSelections(code, 'late', ['r1'])).rejects.toThrow('waiting');
    await service.submitSelections(code, 'host', ['r1']);
    const completed = await service.submitSelections(code, 'guest', ['r1']);
    expect(completed.results?.topPick?.of).toBe(2);
    expect(Object.keys(completed.results!.allSelections)).toEqual(['Host', 'Guest']);
    await expect(service.restartSession(code, 'late')).rejects.toMatchObject({ code: 'NOT_HOST' });
    await service.restartSession(code, 'host');
    const lobby = await service.getLobby(code);
    expect(lobby?.state).toBe('waiting');
    expect(lobby?.participants.every((p) => !p.ready && !p.waitingForNextRound)).toBe(true);
    expect(lobby?.participants.find((p) => p.participantId === 'late')?.diets).toEqual([
      'ketogenic',
    ]);
  });

  it('admits compatible Cook diets and keeps reconnect outside no extra slot', async () => {
    const { code } = await joined('cook');
    await start(code);
    const late = await service.joinSession(code, 'late', 'Late');
    await service.joinSession(code, 'late2', 'Late', late.rejoinToken);
    await service.updateChoices(code, 'late2', {
      sessionCode: code,
      revision: await revision(code),
      diets: ['vegetarian', 'gluten free'],
    });
    expect((await service.getLobby(code))?.participants).toHaveLength(3);
    expect(
      (await service.getLobby(code))?.participants.find((p) => p.participantId === 'late2')
        ?.waitingForNextRound
    ).toBe(false);
    expect((await store.readSession(code))?.participantCount).toBe(3);
  });

  it('requires effective Host and absence before removing an unready participant', async () => {
    const { code } = await joined();
    await expect(
      service.removeAbsent(code, 'guest', await revision(code), 'host')
    ).rejects.toMatchObject({ code: 'NOT_HOST' });
    await expect(service.removeAbsent(code, 'host', await revision(code), 'guest')).rejects.toThrow(
      'absent'
    );
    await store.markDisconnected('guest');
    await service.removeAbsent(code, 'host', await revision(code), 'guest');
    await ready(code, 'host');
    expect((await service.startRound(code, 'host', await revision(code))).state).toBe('selecting');
  });

  it('does not restore removed Host authority when that name rejoins normally', async () => {
    const { code, host } = await joined();
    await store.markDisconnected('host');
    await service.removeAbsent(code, 'guest', await revision(code), 'host');
    await expect(
      service.joinSession(code, 'host2', 'Host', host.rejoinToken)
    ).rejects.toMatchObject({
      code: 'NOT_IN_SESSION',
    });
    const returned = await service.joinSession(code, 'host2', 'Host');
    expect(returned.isRejoin).toBe(false);
    expect(returned.isHost).toBe(false);
  });
  it('reuses an unchanged Restaurant area on the next round instead of charging another search', async () => {
    const { code } = await joined('eatout');
    await service.updateChoices(code, 'host', {
      sessionCode: code,
      revision: await revision(code),
      location: { latitude: 0, longitude: 0 },
    });
    await start(code);
    await service.restartSession(code, 'host');
    await start(code);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('rejects a delayed Submission from the previous round after Restart and a fresh start', async () => {
    const { code } = await joined();
    const first = await start(code);
    await service.restartSession(code, 'host');
    await start(code);
    await expect(service.submitSelections(code, 'host', [], first.round)).rejects.toThrow(
      'previous round'
    );
  });
});
