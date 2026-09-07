import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
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
  async function client() {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
      transports: ['websocket'],
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
});
