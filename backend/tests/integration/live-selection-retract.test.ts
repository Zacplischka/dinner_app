// Issue #410 — Undo retracts a Live Selection. The round trip: Bob likes, Alice
// sees the Live Selection; Bob undoes, Alice sees the retraction for the same
// Deck Entry. Still pure transport — neither leg writes to Redis.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type Redis from 'ioredis';
import { getTestRedis, cleanupTestData } from '../helpers/testSetup.js';
import { startSocketServer, stopSocketServer } from '../helpers/socketServer.js';
import type { ParticipantSelectedEvent } from '@dinder/shared/types';

describe('Integration Test: Live Selection retraction (#410)', () => {
  let redis: Redis;
  let socketUrl: string;
  let sessionCode: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    redis = getTestRedis();
    socketUrl = await startSocketServer();
  });

  beforeEach(async () => {
    await cleanupTestData(redis);
    const response = await request(socketUrl)
      .post('/api/sessions')
      .send({ hostName: 'Alice' })
      .expect(201);
    sessionCode = response.body.sessionCode;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await cleanupTestData(redis);
    await stopSocketServer();
  });

  async function joinSession(displayName: string): Promise<ClientSocket> {
    const socket = ioClient(socketUrl, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('session:join', { sessionCode, displayName }, () => resolve());
      });
      socket.on('connect_error', reject);
    });
    return socket;
  }

  const nextSelected = (socket: ClientSocket): Promise<ParticipantSelectedEvent> =>
    new Promise((resolve) => socket.once('participant:selected', resolve));

  it("retracts Bob's Live Selection on Alice's screen and persists nothing", async () => {
    const alice = await joinSession('Alice');
    const bob = await joinSession('Bob');

    const liked = nextSelected(alice);
    bob.emit('selection:live', { sessionCode, placeId: 'place-1' }, () => undefined);
    expect(await liked).toMatchObject({ displayName: 'Bob', placeId: 'place-1' });
    expect((await liked).retract).toBeUndefined();
    const bobId = (await liked).participantId;

    const retracted = nextSelected(alice);
    const ack = await new Promise((resolve) =>
      bob.emit('selection:live', { sessionCode, placeId: 'place-1', retract: true }, resolve)
    );

    expect(ack).toEqual({ success: true, data: null });
    expect(await retracted).toMatchObject({
      displayName: 'Bob',
      placeId: 'place-1',
      retract: true,
    });
    // The no-persistence promise, on the exact key: SMEMBERS applies the test
    // client's keyPrefix (KEYS would not, and would pass no matter what).
    await expect(redis.smembers(`session:${sessionCode}:${bobId}:selections`)).resolves.toEqual([]);
  });
});
