import { logger } from '../../src/logger.js';
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
import { handleLiveSelection } from '../../src/websocket/liveSelectionHandler.js';
import { handleOrderOpen } from '../../src/websocket/orderHandler.js';
import { createOrderService } from '../../src/services/OrderService.js';
import {
  SNAPSHOT_FRESHNESS_MS,
  SNAPSHOT_FAILURE_FRESHNESS_MS,
  type Snapshot,
} from '@dinder/shared/types';

const redis = new RedisMock() as unknown as Redis;
const store = createSessionStore(redis);
const service = createSessionService({
  store,
  searchNearbyRestaurants: vi.fn(async () => []),
});
const rejoinToken = '00000000-0000-4000-8000-000000000001';

describe('websocket handlers', () => {
  const sessionCode = 'WSH12';

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
    await store.claimDisplayName(sessionCode, 'Alice', participantId, rejoinToken);
    await store.addParticipant(sessionCode, {
      participantId,
      displayName: 'Alice',
      isHost: true,
      rejoinToken,
    });
  }

  describe('handleSessionJoin', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode: 'bad', displayName: '' } as any,
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode: 'bad',
          reason: expect.stringContaining('Session code must be 5 alphanumeric characters'),
        },
        'Rejected session:join'
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode,
          participantId: 'socket-1',
          reason: 'session_not_found',
        },
        'Rejected session join'
      );
    });

    it('should add a new participant and log the join', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleSessionJoin(
        testSocket as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: {
          participantId: 'socket-1',
          sessionCode,
          displayName: 'Alice',
          participantCount: 1,
          rejoinToken: expect.any(String),
          participants: [{ participantId: 'socket-1', displayName: 'Alice', isHost: true }],
        },
      });
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:joined', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 1,
        isRejoin: false,
      });
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'socket-1', sessionCode, isRejoin: false, participantCount: 1 },
        'Participant joined session'
      );
    });

    it('should replace an existing participant when they rejoin with the same display name', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('old-socket');
      const testSocket = socket('new-socket');
      const callback = vi.fn();

      await handleSessionJoin(
        testSocket as any,
        { sessionCode, displayName: 'Alice', rejoinToken },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ participantId: 'new-socket', participantCount: 1 }),
      });
      await expect(redis.exists('participant:old-socket')).resolves.toBe(0);
      await expect(redis.exists('participant:new-socket')).resolves.toBe(1);
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:joined', {
        participantId: 'new-socket',
        displayName: 'Alice',
        participantCount: 1,
        isRejoin: true,
      });
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'new-socket', sessionCode, isRejoin: true, participantCount: 1 },
        'Participant joined session'
      );
    });

    it('should reject a duplicate display name without its rejoin token', async () => {
      await createSessionWithParticipant('original-socket');
      const callback = vi.fn();

      await handleSessionJoin(
        socket('impostor-socket') as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'DISPLAY_NAME_TAKEN', message: expect.any(String) },
      });
      await expect(store.getParticipant('original-socket')).resolves.toMatchObject({
        isHost: true,
      });
      await expect(store.getParticipant('impostor-socket')).resolves.toBeNull();
    });

    it('should reject a brand-new participant after the session starts', async () => {
      await createSessionWithParticipant();
      await store.updateState(sessionCode, 'selecting');
      const callback = vi.fn();

      await handleSessionJoin(
        socket('late-socket') as any,
        { sessionCode, displayName: 'Bob' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'SESSION_ALREADY_STARTED', message: expect.any(String) },
      });
      await expect(store.getParticipant('late-socket')).resolves.toBeNull();
    });

    it('should reject full sessions before adding and log the rejection', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      await Promise.all([
        store.addParticipant(sessionCode, {
          participantId: 'socket-1',
          displayName: 'Alice',
          isHost: true,
        }),
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
        error: { code: 'SESSION_FULL', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          sessionCode,
          participantId: 'socket-5',
          reason: 'session_full',
          participantCount: 4,
        },
        'Rejected session join'
      );
    });

    it('should return generic error when join processing throws', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
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
        error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
      });
      expect(errorSpy).toHaveBeenCalledWith(
        { err: error, socketId: 'socket-1' },
        'Error in session:join handler'
      );
    });
  });

  describe('handleSessionLeave', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionLeave(
        socket() as any,
        {} as any,
        { sessionCode: 'bad' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode: 'bad',
          reason: expect.stringContaining('Invalid'),
        },
        'Rejected session:leave'
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback, service);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode,
          reason: 'SESSION_NOT_FOUND',
        },
        'Rejected session:leave'
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSessionLeave(
        socket('missing') as any,
        {} as any,
        { sessionCode },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'missing',
          sessionCode,
          reason: 'NOT_IN_SESSION',
        },
        'Rejected session:leave'
      );
    });

    it('should remove participant and broadcast participant:left', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleSessionLeave(testSocket as any, {} as any, { sessionCode }, callback, service);

      // Canonical: no-data commands ack data: null (bridge → Ack<null>).
      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(testSocket.leave).toHaveBeenCalledWith(sessionCode);
      // The departed host's slot is reserved again, matching a fresh session
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:left', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 1,
      });
      await expect(redis.exists('participant:socket-1')).resolves.toBe(0);
      await expect(redis.hget(`session:${sessionCode}`, 'participantCount')).resolves.toBe('1');
      expect(logSpy).toHaveBeenCalledWith(
        { sessionCode, participantId: 'socket-1', participantCount: 1 },
        'Participant left session'
      );
    });

    it('should broadcast results when leaving completes the session', async () => {
      vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await store.addParticipant(sessionCode, { participantId: 'socket-2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'socket-1', []);
      const testIo = io();
      const callback = vi.fn();

      await handleSessionLeave(
        socket('socket-2') as any,
        testIo as any,
        { sessionCode },
        callback,
        service
      );

      // Canonical: no-data commands ack data: null (bridge → Ack<null>).
      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(testIo.roomEmitter.emit).toHaveBeenCalledWith(
        'session:results',
        expect.objectContaining({
          sessionCode,
          hasOverlap: false,
          topPick: undefined,
        })
      );
      await expect(redis.hget(`session:${sessionCode}`, 'state')).resolves.toBe('complete');
    });

    it('should return generic error when leave processing throws', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback, service);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
      });
      expect(errorSpy).toHaveBeenCalledWith(
        { err: error, socketId: 'socket-1' },
        'Error in session:leave handler'
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should do nothing if the socket has no participant', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const testSocket = socket('missing');

      await handleDisconnect(testSocket as any, {} as any, 'transport close', store);

      expect(testSocket.to).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'missing', reason: 'transport close' },
        'Socket disconnected'
      );
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'missing',
          reason: 'transport close',
        },
        'Disconnected socket had no participant record'
      );
    });

    it('should broadcast participant disconnects and log preserved sessions', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');

      await handleDisconnect(testSocket as any, {} as any, 'transport close', store);

      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:disconnected', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 1,
      });
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'socket-1', reason: 'transport close' },
        'Socket disconnected'
      );
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'socket-1', sessionCode },
        'Participant disconnected, session preserved'
      );
    });

    it('should catch disconnect processing errors', async () => {
      vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'getParticipant').mockRejectedValueOnce(error);

      await expect(
        handleDisconnect(socket('socket-1') as any, {} as any, 'transport close', store)
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        { err: error, socketId: 'socket-1' },
        'Error in disconnect handler'
      );
    });
  });

  describe('handleSessionRestart', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(
        socket() as any,
        io() as any,
        { sessionCode: 'bad' },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode: 'bad',
          reason: expect.stringContaining('Invalid'),
        },
        'Rejected session:restart'
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback, service);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode,
          reason: 'SESSION_NOT_FOUND',
        },
        'Rejected session:restart'
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSessionRestart(
        socket('missing') as any,
        io() as any,
        { sessionCode },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'missing',
          sessionCode,
          reason: 'NOT_IN_SESSION',
        },
        'Rejected session:restart'
      );
    });

    it('should restart sessions and log the state transition', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testIo = io();
      const callback = vi.fn();

      await handleSessionRestart(
        socket('socket-1') as any,
        testIo as any,
        { sessionCode },
        callback,
        service
      );

      // Canonical: no-data commands ack data: null (bridge → Ack<null>).
      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(testIo.roomEmitter.emit).toHaveBeenCalledWith('session:restarted', {
        sessionCode,
        message: 'Session restarted. Make new selections.',
      });
      expect(logSpy).toHaveBeenCalledWith(
        { sessionCode, participantId: 'socket-1' },
        'Session restarted'
      );
    });

    it('should return generic error when restart processing throws', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback, service);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
      });
      expect(errorSpy).toHaveBeenCalledWith(
        { err: error, socketId: 'socket-1' },
        'Error in session:restart handler'
      );
    });
  });

  describe('handleSelectionSubmit', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket() as any,
        io() as any,
        { sessionCode: 'bad', selections: [] } as any,
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode: 'bad',
          reason: expect.stringContaining('Invalid'),
        },
        'Rejected selection:submit'
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket() as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode,
          reason: 'SESSION_NOT_FOUND',
        },
        'Rejected selection:submit'
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('missing') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'missing',
          sessionCode,
          reason: 'NOT_IN_SESSION',
        },
        'Rejected selection:submit'
      );
    });

    it('should map invalid selection errors to a friendly message', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: ['missing-place'] },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode,
          reason: 'INVALID_RESTAURANTS',
        },
        'Rejected selection:submit'
      );
    });

    it('should map already submitted errors to a friendly message', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await store.recordSubmission(sessionCode, 'socket-1', []);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'ALREADY_SUBMITTED', message: expect.any(String) },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        {
          socketId: 'socket-1',
          sessionCode,
          reason: 'ALREADY_SUBMITTED',
        },
        'Rejected selection:submit'
      );
    });

    it('should return generic error when submit processing throws', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
      const error = new Error('redis down');
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket() as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
      });
      expect(errorSpy).toHaveBeenCalledWith(
        { err: error, socketId: 'socket-1' },
        'Error in selection:submit handler'
      );
    });

    it('should submit selections and log progress without exposing choices', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await store.addParticipant(sessionCode, { participantId: 'socket-2', displayName: 'Bob' });
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      // Canonical: no-data commands ack data: null (bridge → Ack<null>).
      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(logSpy).toHaveBeenCalledWith(
        { socketId: 'socket-1', sessionCode, submittedCount: 1, participantCount: 2 },
        'Participant submitted selections'
      );
    });

    it('should log when all participants submit and results are emitted', async () => {
      const logSpy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
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
        service
      );

      // Canonical: no-data commands ack data: null (bridge → Ack<null>).
      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(testIo.roomEmitter.emit).toHaveBeenCalledWith('session:results', {
        sessionCode,
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
        topPick: undefined,
      });
      expect(logSpy).toHaveBeenCalledWith({ sessionCode, hasOverlap: false }, 'Session complete');
    });
  });

  describe('handleLiveSelection', () => {
    it("should re-broadcast a joined participant's Live Selection and write nothing", async () => {
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleLiveSelection(
        testSocket as any,
        { sessionCode, placeId: 'place-1' },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
      expect(testSocket.to).toHaveBeenCalledWith(sessionCode);
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:selected', {
        participantId: 'socket-1',
        displayName: 'Alice',
        placeId: 'place-1',
      });
      // The no-persistence promise: a successful selection:live writes nothing.
      await expect(redis.smembers(`session:${sessionCode}:socket-1:selections`)).resolves.toEqual(
        []
      );
    });

    it('should reject a socket with no participant record', async () => {
      const testSocket = socket('stranger');
      const callback = vi.fn();

      await handleLiveSelection(
        testSocket as any,
        { sessionCode, placeId: 'place-1' },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: expect.any(String) },
      });
      expect(testSocket.roomEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject a joined participant sending a different sessionCode', async () => {
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleLiveSelection(
        testSocket as any,
        { sessionCode: 'ZZZ99', placeId: 'place-1' },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'NOT_IN_SESSION', message: expect.any(String) },
      });
      expect(testSocket.roomEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject a malformed payload without emitting', async () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleLiveSelection(
        testSocket as any,
        { sessionCode: 'nope', placeId: 'place-1' },
        callback,
        store
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(testSocket.roomEmitter.emit).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        { socketId: 'socket-1', reason: expect.any(String) },
        'Rejected selection:live'
      );
    });
  });

  // #116: canonical Ack<T> only - `{ success:true, data }` or
  // `{ success:false, error: ApiError }`. No flattened success fields, no string
  // errors, no compatibility `apiError` key; success and failure never coexist.
  describe('canonical ack wire shape (#116)', () => {
    beforeEach(() => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    });

    it('join success is exactly { success, data } with no flattened fields', async () => {
      await store.createSession(sessionCode, { hostId: 'host', hostName: 'Alice' });
      const callback = vi.fn();

      await handleSessionJoin(
        socket('socket-1') as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      const ack = callback.mock.calls[0][0];
      expect(ack).toEqual({
        success: true,
        data: {
          participantId: 'socket-1',
          sessionCode,
          displayName: 'Alice',
          participantCount: 1,
          rejoinToken: expect.any(String),
          participants: [{ participantId: 'socket-1', displayName: 'Alice', isHost: true }],
        },
      });
      // The removed legacy flattened fields are absent.
      expect(ack.participantId).toBeUndefined();
      expect(ack.participants).toBeUndefined();
    });

    it('join failure is exactly { success:false, error: ApiError } with no legacy fields', async () => {
      const callback = vi.fn();

      // Missing session → SESSION_NOT_FOUND.
      await handleSessionJoin(
        socket('socket-1') as any,
        { sessionCode, displayName: 'Alice' },
        callback,
        service
      );

      const ack = callback.mock.calls[0][0];
      expect(ack).toEqual({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: expect.any(String) },
      });
      expect(ack.apiError).toBeUndefined();
    });

    it('invalid payloads surface a VALIDATION_ERROR in error', async () => {
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode: 'bad', selections: [] } as any,
        callback,
        service
      );

      const ack = callback.mock.calls[0][0];
      expect(ack.success).toBe(false);
      expect(ack.error.code).toBe('VALIDATION_ERROR');
    });

    it('domain failures map to their public codes (already-submitted → ALREADY_SUBMITTED)', async () => {
      await createSessionWithParticipant('socket-1');
      await store.recordSubmission(sessionCode, 'socket-1', []);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback,
        service
      );

      expect(callback.mock.calls[0][0].error.code).toBe('ALREADY_SUBMITTED');
    });

    it('unexpected failures map to INTERNAL_ERROR without leaking the cause', async () => {
      vi.spyOn(store, 'readSession').mockRejectedValueOnce(new Error('redis down'));
      const callback = vi.fn();

      await handleSessionRestart(
        socket('socket-1') as any,
        io() as any,
        { sessionCode },
        callback,
        service
      );

      const ack = callback.mock.calls[0][0];
      expect(ack.error.code).toBe('INTERNAL_ERROR');
      expect(ack.error.message).not.toContain('redis down');
    });

    it('no-data commands ack canonical data: null', async () => {
      await createSessionWithParticipant('socket-1');
      const callback = vi.fn();

      await handleSessionRestart(
        socket('socket-1') as any,
        io() as any,
        { sessionCode },
        callback,
        service
      );

      expect(callback).toHaveBeenCalledWith({ success: true, data: null });
    });
  });

  describe('handleOrderOpen', () => {
    const placeId = 'place-crown';

    function orderSnapshot(): Snapshot {
      return {
        id: 'snap-1',
        placeId,
        venueName: 'Pizza Place',
        fetchedAt: new Date().toISOString(),
        payload: {
          ubereats: {
            status: 'resolved',
            deals: [],
            storeUrl: 'https://store',
            menu: [{ name: 'Margherita', price_cents: 1500, tags: [] }],
          },
          doordash: { status: 'not_found', deals: [], menu: [] },
        },
      };
    }

    function orderService(getLatest = vi.fn().mockResolvedValue(orderSnapshot())) {
      return createOrderService({
        store,
        snapshotStore: { getLatest },
        freshnessMs: SNAPSHOT_FRESHNESS_MS,
        failureFreshnessMs: SNAPSHOT_FAILURE_FRESHNESS_MS,
      });
    }

    async function completedSession(participantId = 'socket-1') {
      await createSessionWithParticipant(participantId);
      await store.addResultPlaceId(sessionCode, placeId);
    }

    it('rejects an invalid payload with VALIDATION_ERROR', async () => {
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleOrderOpen(
        socket() as any,
        { sessionCode: 'bad', placeId: '' } as any,
        callback,
        orderService()
      );

      expect(callback.mock.calls[0][0]).toEqual({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
    });

    it('acks the built OrderState on success', async () => {
      await completedSession('socket-1');
      const callback = vi.fn();

      await handleOrderOpen(
        socket('socket-1') as any,
        { sessionCode, placeId },
        callback,
        orderService()
      );

      const ack = callback.mock.calls[0][0];
      expect(ack.success).toBe(true);
      expect(ack.data.platform).toBe('ubereats');
      expect(ack.data.menu).toHaveLength(1);
    });

    it('maps a stale Snapshot to NOT_FOUND with a machine-readable reason', async () => {
      await completedSession('socket-1');
      const callback = vi.fn();
      const getLatest = vi.fn().mockResolvedValue(null); // no snapshot → stale

      await handleOrderOpen(
        socket('socket-1') as any,
        { sessionCode, placeId },
        callback,
        orderService(getLatest)
      );

      const ack = callback.mock.calls[0][0];
      expect(ack.success).toBe(false);
      expect(ack.error).toEqual({
        code: 'NOT_FOUND',
        message: expect.any(String),
        reason: 'stale',
      });
    });

    it('maps a DomainError (non-participant) to its public code', async () => {
      await completedSession('socket-1');
      vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleOrderOpen(
        socket('stranger') as any,
        { sessionCode, placeId },
        callback,
        orderService()
      );

      expect(callback.mock.calls[0][0].error.code).toBe('NOT_IN_SESSION');
    });
  });
});
