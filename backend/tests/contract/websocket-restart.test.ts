import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';

describe('Contract Test: WebSocket session:restart event', () => {
  let clientSocket: ClientSocket;
  let testSessionCode: string;
  const SOCKET_URL = 'http://localhost:3001';

  beforeAll(async () => {
    // TODO: Import and start server once implemented
    throw new Error('WebSocket server not implemented yet - this test should fail');
  });

  beforeEach(async () => {
    // TODO: Create session, join, and submit selections
    clientSocket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
      clientSocket.connect();
    });

    // TODO: Setup complete session with results
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.close();
    }
    // TODO: Clean up
  });

  it('should validate session:restart payload against Zod schema', (done) => {
    const validPayload = {
      sessionCode: testSessionCode,
    };

    clientSocket.emit('session:restart', validPayload, (response: any) => {
      expect(response).toHaveProperty('success');
      done();
    });
  });

  it('should return successful acknowledgment on valid restart', (done) => {
    clientSocket.emit(
      'session:restart',
      {
        sessionCode: testSessionCode,
      },
      (response: any) => {
        expect(response).toHaveProperty('success', true);
        expect(response.error).toBeUndefined();
        done();
      }
    );
  });

  it('should broadcast session:restarted to all participants', (done) => {
    // Create second client
    const client2 = ioClient(SOCKET_URL, {
      transports: ['websocket'],
    });

    client2.on('connect', () => {
      // TODO: Join session with client2

      // Listen for restart broadcast
      client2.on('session:restarted', (data: any) => {
        // Validate SessionRestartedEvent structure
        expect(data).toHaveProperty('sessionCode');
        expect(data).toHaveProperty('message');
        expect(typeof data.message).toBe('string');
        expect(data.message.toLowerCase()).toContain('restart');

        client2.close();
        done();
      });

      // Client 1 initiates restart
      clientSocket.emit('session:restart', {
        sessionCode: testSessionCode,
      });
    });
  });

  it('should allow any participant to restart (not just host)', (done) => {
    // This test verifies FR-012: any participant can restart
    // Client socket is not the host
    clientSocket.emit(
      'session:restart',
      {
        sessionCode: testSessionCode,
      },
      (response: any) => {
        expect(response.success).toBe(true);
        done();
      }
    );
  });

  it('should reject invalid sessionCode format', (done) => {
    clientSocket.emit(
      'session:restart',
      {
        sessionCode: 'invalid',
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject restart for non-existent session', (done) => {
    clientSocket.emit(
      'session:restart',
      {
        sessionCode: 'NOTEXIST',
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject restart if participant not in session', async () => {
    // Create new client that hasn't joined
    const unauthorizedClient = ioClient(SOCKET_URL, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      unauthorizedClient.on('connect', () => resolve());
      unauthorizedClient.connect();
    });

    unauthorizedClient.emit(
      'session:restart',
      {
        sessionCode: testSessionCode,
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        unauthorizedClient.close();
      }
    );
  });

  it('should emit broadcast to sender as well (not selective)', (done) => {
    // Verify that initiating client also receives session:restarted
    clientSocket.on('session:restarted', (data: any) => {
      expect(data).toHaveProperty('sessionCode', testSessionCode);
      expect(data).toHaveProperty('message');
      done();
    });

    clientSocket.emit('session:restart', {
      sessionCode: testSessionCode,
    });
  });

  it('should handle concurrent restart requests gracefully', async () => {
    // Multiple participants might click restart simultaneously
    const promises = Array.from({ length: 3 }, () =>
      new Promise<any>((resolve) => {
        clientSocket.emit(
          'session:restart',
          {
            sessionCode: testSessionCode,
          },
          resolve
        );
      })
    );

    const responses = await Promise.all(promises);

    // At least one should succeed
    const successCount = responses.filter((r) => r.success).length;
    expect(successCount).toBeGreaterThanOrEqual(1);
  });
});