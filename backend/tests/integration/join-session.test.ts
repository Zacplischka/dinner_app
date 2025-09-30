import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Express } from 'express';

describe('Integration Test: Join Session Flow (FR-004, FR-005, FR-022)', () => {
  let app: Express;
  let testSessionCode: string;
  const SOCKET_URL = 'http://localhost:3001';

  beforeAll(async () => {
    throw new Error('Server not implemented yet - this test should fail');
  });

  beforeEach(async () => {
    // Create fresh session for each test
    const response = await request(app)
      .post('/api/sessions')
      .send({ hostName: 'Alice' });
    testSessionCode = response.body.sessionCode;
  });

  afterAll(async () => {
    // TODO: Clean up
  });

  it('should allow Bob and Charlie to join via WebSocket', async () => {
    const bob = ioClient(SOCKET_URL);
    const charlie = ioClient(SOCKET_URL);

    await new Promise<void>((resolve) => {
      bob.on('connect', () => {
        bob.emit('session:join', {
          sessionCode: testSessionCode,
          displayName: 'Bob',
        }, (response: any) => {
          expect(response.success).toBe(true);
          expect(response.participantCount).toBe(2);
          resolve();
        });
      });
    });

    await new Promise<void>((resolve) => {
      charlie.on('connect', () => {
        charlie.emit('session:join', {
          sessionCode: testSessionCode,
          displayName: 'Charlie',
        }, (response: any) => {
          expect(response.success).toBe(true);
          expect(response.participantCount).toBe(3);
          resolve();
        });
      });
    });

    bob.close();
    charlie.close();
  });

  it('should broadcast participant:joined to existing participants (FR-022)', (done) => {
    const bob = ioClient(SOCKET_URL);
    const charlie = ioClient(SOCKET_URL);

    bob.on('connect', () => {
      bob.emit('session:join', {
        sessionCode: testSessionCode,
        displayName: 'Bob',
      });

      bob.on('participant:joined', (data: any) => {
        expect(data.displayName).toBe('Charlie');
        expect(data.participantCount).toBe(3);
        bob.close();
        charlie.close();
        done();
      });

      setTimeout(() => {
        charlie.connect();
        charlie.on('connect', () => {
          charlie.emit('session:join', {
            sessionCode: testSessionCode,
            displayName: 'Charlie',
          });
        });
      }, 100);
    });
  });

  it('should reject 5th participant with SESSION_FULL error (FR-005)', async () => {
    const clients = Array.from({ length: 3 }, () => ioClient(SOCKET_URL));

    // Join 3 more participants (Alice + 3 = 4 total)
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        clients[i].on('connect', () => {
          clients[i].emit('session:join', {
            sessionCode: testSessionCode,
            displayName: `User${i}`,
          }, () => resolve());
        });
        clients[i].connect();
      });
    }

    // 5th participant should be rejected
    const fifthClient = ioClient(SOCKET_URL);
    await new Promise<void>((resolve) => {
      fifthClient.on('connect', () => {
        fifthClient.emit('session:join', {
          sessionCode: testSessionCode,
          displayName: 'FifthUser',
        }, (response: any) => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('full');
          resolve();
        });
      });
      fifthClient.connect();
    });

    clients.forEach(c => c.close());
    fifthClient.close();
  });
});