import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData } from '../helpers/testSetup.js';
import { startSocketServer, stopSocketServer } from '../helpers/socketServer.js';

describe('Integration Test: Join Session Flow (FR-004, FR-005, FR-022)', () => {
  let redis: Redis;
  let socketUrl: string;
  let testSessionCode: string;

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

    testSessionCode = response.body.sessionCode;
  });

  afterAll(async () => {
    await cleanupTestData(redis);
    await stopSocketServer();
  });

  async function joinSession(
    displayName: string
  ): Promise<{ socket: ClientSocket; response: any }> {
    const socket = ioClient(socketUrl, {
      transports: ['websocket'],
    });

    return await new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName,
          },
          (response: any) => {
            resolve({ socket, response });
          }
        );
      });

      socket.on('connect_error', reject);
    });
  }

  it('should allow Alice, Bob, and Charlie to join via WebSocket', async () => {
    const alice = await joinSession('Alice');
    const bob = await joinSession('Bob');
    const charlie = await joinSession('Charlie');

    expect(alice.response).toMatchObject({
      success: true,
      data: { displayName: 'Alice', participantCount: 1 },
    });
    expect(alice.response.data.participants).toEqual([
      expect.objectContaining({ displayName: 'Alice', isHost: true }),
    ]);

    expect(bob.response).toMatchObject({
      success: true,
      data: { displayName: 'Bob', participantCount: 2 },
    });
    expect(charlie.response).toMatchObject({
      success: true,
      data: { displayName: 'Charlie', participantCount: 3 },
    });

    await expect(redis.scard(`session:${testSessionCode}:participants`)).resolves.toBe(3);

    alice.socket.close();
    bob.socket.close();
    charlie.socket.close();
  });

  it('should broadcast participant:joined to existing participants (FR-022)', async () => {
    const alice = await joinSession('Alice');

    const joinedEvent = new Promise<any>((resolve) => {
      alice.socket.on('participant:joined', resolve);
    });

    const bob = await joinSession('Bob');

    await expect(joinedEvent).resolves.toMatchObject({
      participantId: bob.socket.id,
      displayName: 'Bob',
      participantCount: 2,
    });

    alice.socket.close();
    bob.socket.close();
  });

  // #258: the results screen branches on this, and the join ack is the one call
  // every Participant — host and joiner alike — makes.
  it('should carry the Session Branch on the join ack', async () => {
    const branched = await request(socketUrl)
      .post('/api/sessions')
      .send({ hostName: 'Alice', branch: 'eatout' })
      .expect(201);
    testSessionCode = branched.body.sessionCode;

    const alice = await joinSession('Alice');

    expect(alice.response).toMatchObject({ success: true, data: { branch: 'eatout' } });

    alice.socket.close();
  });

  // #283: the phantom Participant. A socket that moves to a new Session must
  // leave the old Session's room, or the old room's participant:joined keeps
  // reaching it — inflating that client's roster and suppressing the Match.
  it('should stop old-session broadcasts reaching a client who joined another session (#283)', async () => {
    const alice = await joinSession('Alice');

    // Alice's browser moves to a second Session on the same socket
    const second = await request(socketUrl)
      .post('/api/sessions')
      .send({ hostName: 'Ava' })
      .expect(201);
    await new Promise<void>((resolve, reject) => {
      alice.socket.emit(
        'session:join',
        { sessionCode: second.body.sessionCode, displayName: 'Ava' },
        (response: any) =>
          response.success ? resolve() : reject(new Error(response.error?.message))
      );
    });

    const phantom = vi.fn();
    alice.socket.on('participant:joined', phantom);

    // Bee joins the ORIGINAL session — the broadcast must not reach Alice
    const bee = await joinSession('Bee');
    expect(bee.response.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(phantom).not.toHaveBeenCalled();

    alice.socket.close();
    bee.socket.close();
  });

  it('should reject 5th participant with SESSION_FULL error (FR-005)', async () => {
    const participants = [];
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dana']) {
      participants.push(await joinSession(name));
    }

    const fifth = await joinSession('Eve');

    expect(fifth.response).toMatchObject({
      success: false,
      error: { code: 'SESSION_FULL' },
    });
    await expect(redis.scard(`session:${testSessionCode}:participants`)).resolves.toBe(4);

    participants.forEach(({ socket }) => socket.close());
    fifth.socket.close();
  });
});
