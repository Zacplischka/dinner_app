import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import type { Express } from 'express';

describe('Contract Test: WebSocket selection:submit event', () => {
  let app: Express;
  let clientSocket: ClientSocket;
  let testSessionCode: string;
  const SOCKET_URL = 'http://localhost:3001';

  beforeAll(async () => {
    // TODO: Import and start server once implemented
    throw new Error('WebSocket server not implemented yet - this test should fail');
  });

  beforeEach(async () => {
    // TODO: Create session and join with clientSocket
    clientSocket = ioClient(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
      clientSocket.connect();
    });

    // TODO: Join session after it's created
  });

  afterAll(async () => {
    if (clientSocket?.connected) {
      clientSocket.close();
    }
    // TODO: Clean up
  });

  it('should validate selection:submit payload against Zod schema', (done) => {
    const validPayload = {
      sessionCode: testSessionCode,
      selections: ['pizza-palace', 'sushi-spot', 'thai-kitchen'],
    };

    clientSocket.emit('selection:submit', validPayload, (response: any) => {
      expect(response).toHaveProperty('success');
      done();
    });
  });

  it('should return successful acknowledgment on valid submission', (done) => {
    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: testSessionCode,
        selections: ['pizza-palace', 'sushi-spot'],
      },
      (response: any) => {
        expect(response).toHaveProperty('success', true);
        expect(response.error).toBeUndefined();
        done();
      }
    );
  });

  it('should broadcast participant:submitted to other clients (count only)', (done) => {
    // Create second client
    const client2 = ioClient(SOCKET_URL, {
      transports: ['websocket'],
    });

    client2.on('connect', () => {
      // Listen for broadcast on client2
      client2.on('participant:submitted', (data: any) => {
        // Validate ParticipantSubmittedEvent structure
        expect(data).toHaveProperty('participantId');
        expect(data).toHaveProperty('submittedCount');
        expect(typeof data.submittedCount).toBe('number');
        expect(data).toHaveProperty('participantCount');
        expect(typeof data.participantCount).toBe('number');

        // Privacy: Should NOT contain actual selections (FR-023)
        expect(data).not.toHaveProperty('selections');
        expect(data).not.toHaveProperty('options');

        client2.close();
        done();
      });

      // Client 1 submits
      clientSocket.emit('selection:submit', {
        sessionCode: testSessionCode,
        selections: ['pizza-palace'],
      });
    });
  });

  it('should broadcast session:results when all participants submit', (done) => {
    // This test requires all participants to submit
    // Simplified version: listen for results event structure

    clientSocket.on('session:results', (data: any) => {
      // Validate SessionResultsEvent structure
      expect(data).toHaveProperty('sessionCode');
      expect(data).toHaveProperty('overlappingOptions');
      expect(Array.isArray(data.overlappingOptions)).toBe(true);
      expect(data).toHaveProperty('allSelections');
      expect(typeof data.allSelections).toBe('object');
      expect(data).toHaveProperty('hasOverlap');
      expect(typeof data.hasOverlap).toBe('boolean');

      // Each overlapping option should have correct structure
      if (data.overlappingOptions.length > 0) {
        data.overlappingOptions.forEach((option: any) => {
          expect(option).toHaveProperty('optionId');
          expect(option).toHaveProperty('displayName');
          // description is optional
        });
      }

      done();
    });

    // TODO: Submit for all participants to trigger results
    clientSocket.emit('selection:submit', {
      sessionCode: testSessionCode,
      selections: ['pizza-palace'],
    });
  });

  it('should reject empty selections array', (done) => {
    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: testSessionCode,
        selections: [],
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject invalid optionId values', (done) => {
    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: testSessionCode,
        selections: ['invalid-option-id'],
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should reject if participant already submitted (FR-026)', async () => {
    // First submission
    await new Promise<void>((resolve) => {
      clientSocket.emit(
        'selection:submit',
        {
          sessionCode: testSessionCode,
          selections: ['pizza-palace'],
        },
        (response: any) => {
          expect(response.success).toBe(true);
          resolve();
        }
      );
    });

    // Second submission attempt (should fail)
    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: testSessionCode,
        selections: ['sushi-spot'],
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response.error).toContain('already submitted');
      }
    );
  });

  it('should reject invalid sessionCode', (done) => {
    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: 'INVALID',
        selections: ['pizza-palace'],
      },
      (response: any) => {
        expect(response.success).toBe(false);
        expect(response).toHaveProperty('error');
        done();
      }
    );
  });

  it('should handle multiple valid selections', (done) => {
    const selections = [
      'pizza-palace',
      'sushi-spot',
      'thai-kitchen',
      'mexican-grill',
      'indian-curry',
    ];

    clientSocket.emit(
      'selection:submit',
      {
        sessionCode: testSessionCode,
        selections,
      },
      (response: any) => {
        expect(response.success).toBe(true);
        done();
      }
    );
  });
});