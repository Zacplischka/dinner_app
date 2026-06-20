import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
      displayName: 'Alice',
      participantCount: 1,
    });
    expect(alice.response.participants).toEqual([
      expect.objectContaining({ displayName: 'Alice', isHost: true }),
    ]);

    expect(bob.response).toMatchObject({
      success: true,
      displayName: 'Bob',
      participantCount: 2,
    });
    expect(charlie.response).toMatchObject({
      success: true,
      displayName: 'Charlie',
      participantCount: 3,
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

  it('should reject 5th participant with SESSION_FULL error (FR-005)', async () => {
    const participants = [];
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dana']) {
      participants.push(await joinSession(name));
    }

    const fifth = await joinSession('Eve');

    expect(fifth.response).toMatchObject({
      success: false,
      error: 'Session is full (maximum 4 participants)',
    });
    await expect(redis.scard(`session:${testSessionCode}:participants`)).resolves.toBe(4);

    participants.forEach(({ socket }) => socket.close());
    fifth.socket.close();
  });
});
