import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionResponse,
  SessionLobbyState,
  LoadRestaurantsResponse,
} from '@dinder/shared/types';
import { startSocketServer, stopSocketServer } from '../helpers/socketServer.js';
import { cleanupTestData, getTestRedis, waitForRedis } from '../helpers/testSetup.js';
import { createSessionStore } from '../../src/store/sessionStore.js';
import { sessionService } from '../../src/server.js';
import { supabase } from '../../src/services/supabase.js';
import { randomUUID } from 'node:crypto';

function value<T>(ack: Ack<T>): T {
  if (!ack.success) throw new Error(`${ack.error.code}: ${ack.error.message}`);
  return ack.data;
}

describe('gather-first Session wire contract', () => {
  const redis = getTestRedis();
  const sockets: Array<Socket<ServerToClientEvents, ClientToServerEvents>> = [];
  let url: string;
  beforeAll(async () => {
    await waitForRedis(redis);
    url = await startSocketServer();
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    await cleanupTestData(redis);
  });
  afterAll(async () => {
    await stopSocketServer();
  });
  async function client(origin?: string, token?: string) {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
      transports: ['websocket'],
      reconnection: false,
      auth: token ? { token } : undefined,
      timeout: 500,
      extraHeaders: origin ? { Origin: origin } : undefined,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
  async function lobby(sessionCode: string): Promise<SessionLobbyState> {
    const response = await request(url).get(`/api/sessions/${sessionCode}`).expect(200);
    const body: SessionResponse = response.body;
    if (!body.lobby) throw new Error('Expected collaborative Lobby');
    return body.lobby;
  }

  it('orders delayed admission and Leave through server completion on the same socket', async () => {
    const create = () =>
      request(url)
        .post('/api/sessions')
        .send({ hostName: 'Host', branch: 'watch', collaborative: true })
        .expect(201);
    const firstCode: string = (await create()).body.sessionCode;
    const nextCode: string = (await create()).body.sessionCode;
    const socket = await client();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = sessionService.joinSession;
    const join = vi.spyOn(sessionService, 'joinSession').mockImplementationOnce(async (...args) => {
      await held;
      return original(...args);
    });
    try {
      const first = socket.emitWithAck('session:join', {
        sessionCode: firstCode,
        displayName: 'Host',
      });
      await vi.waitFor(() => expect(join).toHaveBeenCalledOnce());
      const leave = socket.emitWithAck('session:leave', { sessionCode: firstCode });
      const next = socket.emitWithAck('session:join', {
        sessionCode: nextCode,
        displayName: 'Host',
      });
      // Ordered packet barrier: an unrelated command acks while admission is held.
      await socket.emitWithAck('selection:submit', { sessionCode: 'bad', selections: [] });
      expect(join).toHaveBeenCalledOnce();
      release();
      value(await first);
      value(await leave);
      value(await next);
      expect((await lobby(firstCode)).participants).toHaveLength(0);
      expect((await lobby(nextCode)).participants.map((p) => p.participantId)).toEqual([socket.id]);
    } finally {
      release();
      join.mockRestore();
    }
  });

  it('recovers a Participant with cached Profile auth while verification never settles', async () => {
    const created = await request(url)
      .post('/api/sessions')
      .send({ hostName: 'Host', branch: 'watch', collaborative: true })
      .expect(201);
    const sessionCode: string = created.body.sessionCode;
    const original = await client();
    const joined = value(
      await original.emitWithAck('session:join', { sessionCode, displayName: 'Host' })
    );
    original.close();
    const verification = vi
      .spyOn(supabase.auth, 'getUser')
      .mockImplementation(() => new Promise(() => {}));
    try {
      const reopened = await client(undefined, 'cached-profile-token');
      const recovered = value(
        await reopened.emitWithAck('session:join', {
          sessionCode,
          displayName: 'Host',
          rejoinToken: joined.rejoinToken,
        })
      );
      expect(recovered.rejoinToken).toBe(joined.rejoinToken);
      expect(verification).not.toHaveBeenCalled();
      const stranger = await client(undefined, 'another-cached-token');
      expect(
        await stranger.emitWithAck('session:join', {
          sessionCode,
          displayName: 'Host',
          rejoinToken: randomUUID(),
        })
      ).toMatchObject({ success: false, error: { code: 'NOT_IN_SESSION' } });
      await request(url).get('/api/friends').expect(401);
    } finally {
      verification.mockRestore();
    }
  });

  it('accepts the exact bundled WebView origins for HTTP and sockets and rejects an unrelated origin', async () => {
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const response = await request(url).get('/health').set('Origin', origin).expect(200);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect((await client(origin)).connected).toBe(true);
    }
    await expect(client('https://unrelated.example')).rejects.toThrow();
  });

  it('preserves the name claim through same-socket recovery and a later app relaunch', async () => {
    const created = await request(url)
      .post('/api/sessions')
      .send({ hostName: 'Host', branch: 'watch', collaborative: true })
      .expect(201);
    const sessionCode: string = created.body.sessionCode;
    const original = await client();
    const joined = value(
      await original.emitWithAck('session:join', { sessionCode, displayName: 'Host' })
    );
    const resume = { sessionCode, displayName: 'Host', rejoinToken: joined.rejoinToken };

    // Socket.IO recovery retains the socket ID; the next cold launch gets a new one.
    value(await original.emitWithAck('session:join', resume));
    original.close();
    const reopened = await client();
    const recovered = value(await reopened.emitWithAck('session:join', resume));
    expect(recovered.participants).toEqual([
      expect.objectContaining({ participantId: reopened.id, displayName: 'Host', isHost: true }),
    ]);
    expect(recovered.rejoinToken).toBe(joined.rejoinToken);

    const stranger = await client();
    expect(
      await stranger.emitWithAck('session:join', { sessionCode, displayName: 'Host' })
    ).toMatchObject({ success: false, error: { code: 'DISPLAY_NAME_TAKEN' } });
    expect((await lobby(sessionCode)).participants).toHaveLength(1);
  });

  it('rejects mismatched, revoked, expired and reused-code resume capabilities without admission or departure', async () => {
    const create = () =>
      request(url)
        .post('/api/sessions')
        .send({ hostName: 'Host', branch: 'watch', collaborative: true, deckSize: 6 })
        .expect(201);
    const target: string = (await create()).body.sessionCode;
    const socket = await client();
    const old = value(
      await socket.emitWithAck('session:join', {
        sessionCode: target,
        displayName: 'Host',
      })
    );
    const targetBefore = await lobby(target);
    expect(
      await socket.emitWithAck('session:join', {
        sessionCode: target,
        displayName: 'Different name',
        rejoinToken: old.rejoinToken,
      })
    ).toMatchObject({ success: false, error: { code: 'NOT_IN_SESSION' } });
    expect(await lobby(target)).toEqual(targetBefore);
    value(await socket.emitWithAck('session:leave', { sessionCode: target }));
    const current: string = (await create()).body.sessionCode;
    value(await socket.emitWithAck('session:join', { sessionCode: current, displayName: 'Host' }));
    const currentBefore = await lobby(current);

    async function refused(rejoinToken: string, displayName = 'Host') {
      const before = await lobby(target);
      expect(
        await socket.emitWithAck('session:join', { sessionCode: target, displayName, rejoinToken })
      ).toMatchObject({ success: false, error: { code: 'NOT_IN_SESSION' } });
      expect(await lobby(target)).toEqual(before);
      expect(await lobby(current)).toEqual(currentBefore);
    }
    await refused(old.rejoinToken!);

    // Reuse a formerly valid code through the real store; random code generation
    // need not collide for the protocol to prove that a new Host slot is protected.
    const store = createSessionStore(redis);
    await store.deleteSession(target);
    expect(
      await socket.emitWithAck('session:join', {
        sessionCode: target,
        displayName: 'Host',
        rejoinToken: old.rejoinToken,
      })
    ).toMatchObject({ success: false, error: { code: 'SESSION_NOT_FOUND' } });
    await request(url).get(`/api/sessions/${target}`).expect(404);
    expect(await lobby(current)).toEqual(currentBefore);
    await store.createSession(target, {
      hostId: 'new-host',
      hostName: 'Host',
      branch: 'watch',
      deckSize: 6,
      lobby: { revision: 0, round: 1, mealType: 'main course' },
    });
    await refused(old.rejoinToken!);
    await refused(randomUUID());
    await refused(old.rejoinToken!, 'Different name');

    // Rejection retained the current membership and its authority.
    value(
      await socket.emitWithAck('session:ready', {
        sessionCode: current,
        revision: currentBefore.revision,
        ready: true,
      })
    );
    // Only a deliberate fresh join can claim the still-unclaimed name/Host slot.
    const fresh = value(
      await socket.emitWithAck('session:join', {
        sessionCode: target,
        displayName: 'Host',
      })
    );
    expect(fresh.participants).toEqual([
      expect.objectContaining({ participantId: socket.id, displayName: 'Host', isHost: true }),
    ]);
    expect(fresh.rejoinToken).not.toBe(old.rejoinToken);
    expect((await lobby(current)).participants).toHaveLength(0);
  });

  it('gathers two people before dealing, validates Ready, deals the same mixed Deck, and restores the completed Match on rejoin', async () => {
    const created = await request(url)
      .post('/api/sessions')
      .send({ hostName: 'Host', branch: 'watch', collaborative: true, deckSize: 6 })
      .expect(201);
    const sessionCode: string = created.body.sessionCode;
    expect(created.body).toMatchObject({
      restaurantCount: 0,
      state: 'waiting',
      lobby: { participants: [] },
    });
    const host = await client();
    const guest = await client();
    const joined = value(
      await host.emitWithAck('session:join', { sessionCode, displayName: 'Host' })
    );
    value(await guest.emitWithAck('session:join', { sessionCode, displayName: 'Guest' }));
    let state = await lobby(sessionCode);
    expect(state.participants).toHaveLength(2);
    const premature = await host.emitWithAck('session:start', {
      sessionCode,
      revision: state.revision,
    });
    expect(premature).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    state = value(
      await host.emitWithAck('session:choices', {
        sessionCode,
        revision: state.revision,
        mood: { genres: ['Comedy'], decades: [], mediaTypes: ['movie'] },
      })
    );
    state = value(
      await guest.emitWithAck('session:choices', {
        sessionCode,
        revision: state.revision,
        mood: { genres: ['Comedy'], decades: [], mediaTypes: ['tv'] },
      })
    );
    state = value(
      await host.emitWithAck('session:ready', {
        sessionCode,
        revision: state.revision,
        ready: true,
      })
    );
    state = value(
      await guest.emitWithAck('session:ready', {
        sessionCode,
        revision: state.revision,
        ready: true,
      })
    );
    const broadcast = new Promise<SessionLobbyState>((resolve) => {
      const started = (next: SessionLobbyState) => {
        if (next.state === 'selecting') {
          guest.off('session:lobby', started);
          resolve(next);
        }
      };
      guest.on('session:lobby', started);
    });
    state = value(
      await host.emitWithAck('session:start', { sessionCode, revision: state.revision })
    );
    expect(state.state).toBe('selecting');
    expect((await broadcast).state).toBe('selecting');
    const response = await request(url).get(`/api/options/${sessionCode}`).expect(200);
    const options: LoadRestaurantsResponse = response.body;
    expect(options.restaurants).toHaveLength(6);
    expect(
      options.restaurants.filter((e) => e.kind === 'movie' && e.mediaType === 'tv')
    ).toHaveLength(3);
    const selections = options.restaurants.slice(0, 2).map((e) => e.placeId);
    value(
      await host.emitWithAck('selection:submit', { sessionCode, selections, round: state.round })
    );
    value(
      await guest.emitWithAck('selection:submit', { sessionCode, selections, round: state.round })
    );
    host.close();
    const reopened = await client();
    const returned = value(
      await reopened.emitWithAck('session:join', {
        sessionCode,
        displayName: 'Host',
        rejoinToken: joined.rejoinToken,
      })
    );
    expect(returned.state).toBe('complete');
    expect(returned.results?.overlappingOptions.map((e) => e.placeId).sort()).toEqual(
      [...selections].sort()
    );
    expect(returned.results?.topPick?.of).toBe(2);
    expect(returned.results?.allSelections).toEqual({ Host: selections, Guest: selections });
  });

  it('reconciles a Restart missed while disconnected and refuses old-round Selections after returning', async () => {
    const created = await request(url)
      .post('/api/sessions')
      .send({ hostName: 'Host', branch: 'watch', collaborative: true, deckSize: 6 })
      .expect(201);
    const sessionCode: string = created.body.sessionCode;
    const host = await client();
    let guest = await client();
    value(await host.emitWithAck('session:join', { sessionCode, displayName: 'Host' }));
    const joined = value(
      await guest.emitWithAck('session:join', { sessionCode, displayName: 'Guest' })
    );
    async function readyAndStart() {
      let state = await lobby(sessionCode);
      for (const socket of [host, guest]) {
        state = value(
          await socket.emitWithAck('session:ready', {
            sessionCode,
            revision: state.revision,
            ready: true,
          })
        );
      }
      return value(
        await host.emitWithAck('session:start', { sessionCode, revision: state.revision })
      );
    }
    const firstRound = await readyAndStart();
    const firstDeck: LoadRestaurantsResponse = (
      await request(url).get(`/api/options/${sessionCode}`).expect(200)
    ).body;
    const selections = [firstDeck.restaurants[0].placeId];
    for (const socket of [host, guest]) {
      value(
        await socket.emitWithAck('selection:submit', {
          sessionCode,
          selections,
          round: firstRound.round,
        })
      );
    }
    expect((await lobby(sessionCode)).state).toBe('complete');

    const disconnected = new Promise<
      Parameters<ServerToClientEvents['participant:disconnected']>[0]
    >((resolve) => host.once('participant:disconnected', resolve));
    guest.close();
    expect(await disconnected).toMatchObject({ displayName: 'Guest', participantCount: 2 });
    expect((await lobby(sessionCode)).participants).toEqual(
      expect.arrayContaining([expect.objectContaining({ displayName: 'Guest', isOnline: false })])
    );
    value(await host.emitWithAck('session:restart', { sessionCode }));

    guest = await client();
    const returned = value(
      await guest.emitWithAck('session:join', {
        sessionCode,
        displayName: 'Guest',
        rejoinToken: joined.rejoinToken,
      })
    );
    expect(returned).toMatchObject({
      state: 'waiting',
      participantCount: 2,
      rejoinToken: joined.rejoinToken,
    });
    expect(returned.results).toBeUndefined();
    expect(returned.participants).toHaveLength(2);
    expect(returned.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participantId: host.id, displayName: 'Host', isHost: true }),
        expect.objectContaining({ participantId: guest.id, displayName: 'Guest', isHost: false }),
      ])
    );
    expect(returned.participants.every((participant) => !participant.hasSubmitted)).toBe(true);
    expect(returned.lobby?.participants.every((participant) => !participant.ready)).toBe(true);
    expect(
      await guest.emitWithAck('selection:submit', {
        sessionCode,
        selections,
        round: firstRound.round,
      })
    ).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });

    const secondRound = await readyAndStart();
    expect(secondRound.round).not.toBe(firstRound.round);
    const secondDeck: LoadRestaurantsResponse = (
      await request(url).get(`/api/options/${sessionCode}`).expect(200)
    ).body;
    const placeId = secondDeck.restaurants[0].placeId;
    // Use a valid current Deck entry: the round, rather than an unknown id, must
    // reject the delayed commands before they can affect the fresh outcome.
    expect(
      await guest.emitWithAck('selection:submit', {
        sessionCode,
        selections: [placeId],
        round: firstRound.round,
      })
    ).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    const liveSelections: string[] = [];
    host.on('participant:selected', (event) => liveSelections.push(event.placeId));
    expect(
      await guest.emitWithAck('selection:live', { sessionCode, placeId, round: firstRound.round })
    ).toMatchObject({ success: false, error: { code: 'NOT_IN_SESSION' } });
    const currentLive = new Promise<void>((resolve) =>
      host.once('participant:selected', () => resolve())
    );
    value(
      await guest.emitWithAck('selection:live', { sessionCode, placeId, round: secondRound.round })
    );
    await currentLive;
    expect(liveSelections).toEqual([placeId]);

    value(
      await host.emitWithAck('selection:submit', {
        sessionCode,
        selections: [placeId],
        round: secondRound.round,
      })
    );
    expect((await lobby(sessionCode)).state).toBe('selecting');
    const results = new Promise<Parameters<ServerToClientEvents['session:results']>[0]>((resolve) =>
      host.once('session:results', resolve)
    );
    value(
      await guest.emitWithAck('selection:submit', {
        sessionCode,
        selections: [],
        round: secondRound.round,
      })
    );
    expect(await results).toMatchObject({
      allSelections: { Host: [placeId], Guest: [] },
      overlappingOptions: [],
      topPick: { of: 2 },
    });
  });
});
