import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';

// Handlers take their store/service as a parameter - build them over an
// in-memory Redis so this suite needs no real Redis.
import { createSessionStore } from '../../src/store/sessionStore.js';
import { createSessionService } from '../../src/services/SessionService.js';
import { handleSessionJoin } from '../../src/websocket/joinHandler.js';
import { handleSessionLeave } from '../../src/websocket/leaveHandler.js';
import { handleDisconnect } from '../../src/websocket/disconnectHandler.js';
import { handleSessionRestart } from '../../src/websocket/restartHandler.js';
import { handleSelectionSubmit } from '../../src/websocket/submitHandler.js';
import { emitError, ErrorCodes } from '../../src/websocket/errorHandler.js';

const redis = new RedisMock() as unknown as Redis;
const store = createSessionStore(redis);
const service = createSessionService({
  store,
  searchNearbyRestaurants: vi.fn(async () => []),
});

describe('websocket handlers', () => {
  const sessionCode = 'WSH123';

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  async function cleanup() {
    const keys = await redis.keys(`session:${sessionCode}*`);
    const participantKeys = await redis.keys('participant:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    if (participantKeys.length > 0) {
      await redis.del(...participantKeys);
    }
  }

  function socket(id = 'socket-1') {
    const roomEmitter = { emit: vi.fn() };
    return {
      id,
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      to: vi.fn(() => roomEmitter),
      roomEmitter,
    };
  }

  function io() {
    const roomEmitter = { emit: vi.fn() };
    return {
      in: vi.fn(() => roomEmitter),
      roomEmitter,
    };
  }

  async function createSessionWithParticipant(participantId = 'socket-1') {
    await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
    await store.addParticipant(sessionCode, {
      participantId,
      displayName: 'Alice',
      isHost: true,
    });
  }

  describe('emitError', () => {
    it('should emit structured error events', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const testSocket = socket('socket-error');

      emitError(testSocket as any, ErrorCodes.VALIDATION_ERROR, 'Bad payload', {
        field: 'sessionCode',
      });

      expect(testSocket.emit).toHaveBeenCalledWith('error', {
        code: 'VALIDATION_ERROR',
        message: 'Bad payload',
        details: { field: 'sessionCode' },
      });
      expect(errorSpy).toHaveBeenCalledWith('[Error socket-error] VALIDATION_ERROR: Bad payload');
    });
  });

  describe('handleSessionJoin', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode: 'bad', displayName: '' } as any,
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:join', {
        socketId: 'socket-1',
        sessionCode: 'bad',
        reason: expect.stringContaining('Session code must be 6 alphanumeric characters'),
      });
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session join', {
        sessionCode,
        participantId: 'socket-1',
        reason: 'session_not_found',
      });
    });

    it('should add a new participant and log the join', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleSessionJoin(
        testSocket as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          participantId: 'socket-1',
          participantCount: 1,
        })
      );
      expect(logSpy).toHaveBeenCalledWith('✓ Alice joined session WSH123 (1/4)');
    });

    it('should replace an existing participant when they rejoin with the same display name', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('old-socket');
      const testSocket = socket('new-socket');
      const callback = vi.fn();

      await handleSessionJoin(
        testSocket as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          participantId: 'new-socket',
          participantCount: 1,
        })
      );
      await expect(redis.exists('participant:old-socket')).resolves.toBe(0);
      await expect(redis.exists('participant:new-socket')).resolves.toBe(1);
      expect(logSpy).toHaveBeenCalledWith('✓ Alice rejoined session WSH123 (1/4)');
    });

    it('should reject full sessions before adding and log the rejection', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      await Promise.all([
        store.addParticipant(sessionCode, { participantId: 'socket-1', displayName: 'Alice', isHost: true }),
        store.addParticipant(sessionCode, { participantId: 'socket-2', displayName: 'Bob' }),
        store.addParticipant(sessionCode, { participantId: 'socket-3', displayName: 'Cara' }),
        store.addParticipant(sessionCode, { participantId: 'socket-4', displayName: 'Dan' }),
      ]);
      const callback = vi.fn();

      await handleSessionJoin(
        socket('socket-5') as any,
        { sessionCode, displayName: 'Eve' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session join', {
        sessionCode,
        participantId: 'socket-5',
        reason: 'session_full',
        participantCount: 4,
      });
    });

    it('should return generic error when join processing throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while joining the session',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in session:join handler:', error);
    });
  });

  describe('handleSessionLeave', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode: 'bad' }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:leave', {
        socketId: 'socket-1',
        sessionCode: 'bad',
        reason: expect.stringContaining('Invalid'),
      });
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:leave', {
        socketId: 'socket-1',
        sessionCode,
        reason: 'session_not_found',
      });
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSessionLeave(socket('missing') as any, {} as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:leave', {
        socketId: 'missing',
        sessionCode,
        reason: 'participant_not_found',
      });
    });

    it('should remove participant and broadcast participant:left', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleSessionLeave(testSocket as any, {} as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(testSocket.leave).toHaveBeenCalledWith(sessionCode);
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:left', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 0,
      });
      await expect(redis.exists('participant:socket-1')).resolves.toBe(0);
      expect(logSpy).toHaveBeenCalledWith('✓ Alice left session WSH123 (0/4 remaining)');
    });

    it('should return generic error when leave processing throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while leaving the session',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in session:leave handler:', error);
    });
  });

  describe('handleDisconnect', () => {
    it('should do nothing if the socket has no participant', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const testSocket = socket('missing');

      await handleDisconnect(testSocket as any, {} as any, 'transport close', store);

      expect(testSocket.to).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Socket missing disconnected: transport close');
      expect(warnSpy).toHaveBeenCalledWith('Disconnected socket had no participant record', {
        socketId: 'missing',
        reason: 'transport close',
      });
    });

    it('should broadcast participant disconnects and log preserved sessions', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');

      await handleDisconnect(testSocket as any, {} as any, 'transport close', store);

      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:disconnected', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 1,
      });
      expect(logSpy).toHaveBeenCalledWith('Socket socket-1 disconnected: transport close');
      expect(logSpy).toHaveBeenCalledWith('✓ Alice disconnected from WSH123 (session preserved)');
    });

    it('should catch disconnect processing errors', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'getParticipant').mockRejectedValueOnce(error);

      await expect(
        handleDisconnect(socket('socket-1') as any, {} as any, 'transport close', store)
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Error in disconnect handler:', error);
    });
  });

  describe('handleSessionRestart', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode: 'bad' }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:restart', {
        socketId: 'socket-1',
        sessionCode: 'bad',
        reason: expect.stringContaining('Invalid'),
      });
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:restart', {
        socketId: 'socket-1',
        sessionCode,
        reason: 'session_not_found',
      });
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSessionRestart(socket('missing') as any, io() as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected session:restart', {
        socketId: 'missing',
        sessionCode,
        reason: 'participant_not_in_session',
      });
    });

    it('should restart sessions and log the state transition', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testIo = io();
      const callback = vi.fn();

      await handleSessionRestart(
        socket('socket-1') as any,
        testIo as any,
        { sessionCode },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(testIo.roomEmitter.emit).toHaveBeenCalledWith('session:restarted', {
        sessionCode,
        message: 'Session restarted. Make new selections.',
      });
      expect(logSpy).toHaveBeenCalledWith('✓ Session WSH123 restarted');
    });

    it('should return generic error when restart processing throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while restarting the session',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in session:restart handler:', error);
    });
  });

  describe('handleSelectionSubmit', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket() as any,
        io() as any,
        { sessionCode: 'bad', selections: [] } as any,
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected selection:submit', {
        socketId: 'socket-1',
        sessionCode: 'bad',
        reason: expect.stringContaining('Invalid'),
      });
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected selection:submit', {
        socketId: 'socket-1',
        sessionCode,
        reason: 'session_not_found',
      });
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSelectionSubmit(socket('missing') as any, io() as any, { sessionCode, selections: [] }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected selection:submit', {
        socketId: 'missing',
        sessionCode,
        reason: 'participant_not_in_session',
      });
    });

    it('should map invalid selection errors to a friendly message', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: ['missing-place'] },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'One or more selected options are invalid',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected selection:submit', {
        socketId: 'socket-1',
        sessionCode,
        reason: 'INVALID_RESTAURANTS',
      });
    });

    it('should map already submitted errors to a friendly message', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await store.recordSubmission(sessionCode, 'socket-1', []);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You have already submitted your selections',
      });
      expect(warnSpy).toHaveBeenCalledWith('Rejected selection:submit', {
        socketId: 'socket-1',
        sessionCode,
        reason: 'ALREADY_SUBMITTED',
      });
    });

    it('should return generic error when submit processing throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback, store);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while submitting selections',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in selection:submit handler:', error);
    });

    it('should submit selections and log progress without exposing choices', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await store.addParticipant(sessionCode, { participantId: 'socket-2', displayName: 'Bob' });
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(logSpy).toHaveBeenCalledWith('✓ Participant socket-1 submitted (1/2)');
    });

    it('should log when all participants submit and results are emitted', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      vi.spyOn(store, 'computeAndStoreResults').mockResolvedValueOnce({
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
      });
      const testIo = io();
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        testIo as any,
        { sessionCode, selections: [] },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(testIo.roomEmitter.emit).toHaveBeenCalledWith('session:results', {
        sessionCode,
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
      });
      expect(logSpy).toHaveBeenCalledWith('✓ Session WSH123 complete - No overlap');
    });
  });
});
