import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Express } from 'express';

describe('Contract Test: WebSocket session:join event', () => {
  let app: Express;
  let clientSocket: ClientSocket;
  let testSessionCode: string;
  const SOCKET_URL = 'http://localhost:3001';

  beforeAll(async () => {
    // TODO: Import and start server once implemented
    // For now, this will fail as expected in TDD
    throw new Error('WebSocket server not implemented yet - this test should fail');
  });

  beforeEach(async () => {
    // TODO: Create a fresh test session
    // const createResponse = await request(app)
    //   .post('/api/sessions')
    //   .send({ hostName: 'Alice' });
    // testSessionCode = createResponse.body.sessionCode;

    // Create client socket connection
    clientSocket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
      clientSocket.connect();
    });
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.close();
    }
    // TODO: Stop server and clean up Redis
  });

  it('should validate session:join payload against Zod schema', (done) => {
    const validPayload = {
      sessionCode: testSessionCode,
      displayName: 'Bob',
    };

    clientSocket.emit('session:join', validPayload, (response: any) => {
      expect(response).toHaveProperty('success');
      expect(response.success).toBe(true);
      done();
    });
  });

  it('should return acknowledgment with correct structure', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: testSessionCode,
        displayName: 'Bob',
      },
      (response: any) => {
        // Validate SessionJoinResponse structure
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('participantId');
        expect(typeof response.participantId).toBe('string');
        expect(response).toHaveProperty('sessionCode', testSessionCode);
        expect(response).toHaveProperty('displayName', 'Bob');
        expect(response).toHaveProperty('participantCount');
        expect(response.participantCount).toBeGreaterThanOrEqual(2);
        expect(response).toHaveProperty('participants');
        expect(Array.isArray(response.participants)).toBe(true);
        done();
      }
    );
  });

  it('should broadcast participant:joined to other clients', (done) => {
    // Create second client to receive broadcast
    const client2 = ioClient(SOCKET_URL, {
      transports: ['websocket'],
    });

    client2.on('connect', () => {
      // First client joins
      clientSocket.emit('session:join', {
        sessionCode: testSessionCode,
        displayName: 'Bob',
      });

      // Second client should receive broadcast
      client2.on('participant:joined', (data: any) => {
        expect(data).toHaveProperty('participantId');
        expect(data).toHaveProperty('displayName');
        expect(data).toHaveProperty('participantCount');
        expect(typeof data.participantCount).toBe('number');
        client2.close();
        done();
      });
    });
  });

  it('should reject invalid sessionCode format', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: 'invalid',
        displayName: 'Bob',
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject empty displayName', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: testSessionCode,
        displayName: '',
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject displayName exceeding 50 characters', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: testSessionCode,
        displayName: 'B'.repeat(51),
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should return SESSION_FULL error when session has 4 participants', async () => {
    // TODO: Fill session with 4 participants first
    // Then attempt 5th join
    const response = await new Promise<any>((resolve) => {
      clientSocket.emit(
        'session:join',
        {
          sessionCode: testSessionCode,
          displayName: 'FifthPerson',
        },
        resolve
      );
    });

    // This test will need session to be full first
    // expect(response.success).toBe(false);
    // expect(response.error).toContain('full');
  });

  it('should return SESSION_NOT_FOUND error for non-existent session', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: 'NOTEXIST',
        displayName: 'Bob',
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should include all current participants in acknowledgment', (done) => {
    clientSocket.emit(
      'session:join',
      {
        sessionCode: testSessionCode,
        displayName: 'Bob',
      },
      (response: any) => {
        expect(response.participants.length).toBeGreaterThanOrEqual(1);
        response.participants.forEach((p: any) => {
          expect(p).toHaveProperty('participantId');
          expect(p).toHaveProperty('displayName');
          expect(p).toHaveProperty('isHost');
          expect(typeof p.isHost).toBe('boolean');
        });
        done();
      }
    );
  });
});