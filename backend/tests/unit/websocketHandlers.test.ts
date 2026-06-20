import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redis } from '../../src/redis/client.js';
import * as SessionModel from '../../src/models/Session.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as SelectionService from '../../src/services/SelectionService.js';
import * as OverlapService from '../../src/services/OverlapService.js';
import { handleSessionJoin } from '../../src/websocket/joinHandler.js';
import { handleSessionLeave } from '../../src/websocket/leaveHandler.js';
import { handleDisconnect } from '../../src/websocket/disconnectHandler.js';
import { handleSessionRestart } from '../../src/websocket/restartHandler.js';
import { handleSelectionSubmit } from '../../src/websocket/submitHandler.js';
import { emitError, ErrorCodes } from '../../src/websocket/errorHandler.js';

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
    await SessionModel.createSession(sessionCode, 'host', 'Alice');
    await ParticipantModel.addParticipant(sessionCode, participantId, 'Alice', true);
  }

  describe('emitError', () => {
    it('should emit structured error events', () => {
      const testSocket = socket('socket-error');

      emitError(testSocket as any, ErrorCodes.VALIDATION_ERROR, 'Bad payload', {
        field: 'sessionCode',
      });

      expect(testSocket.emit).toHaveBeenCalledWith('error', {
        code: 'VALIDATION_ERROR',
        message: 'Bad payload',
        details: { field: 'sessionCode' },
      });
    });
  });

  describe('handleSessionJoin', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(socket() as any, { sessionCode: 'bad', displayName: '' } as any, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected session:join for socket socket-1: invalid payload')
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode, displayName: 'Alice' },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:join for ${sessionCode}: session not found`
      );
    });

    it('should replace an existing participant when they rejoin with the same display name', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('old-socket');
      const testSocket = socket('new-socket');
      const callback = vi.fn();

      await handleSessionJoin(
        testSocket as any,
        { sessionCode, displayName: 'Alice' },
        callback
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
      expect(logSpy).toHaveBeenCalledWith(`✓ Alice rejoined session ${sessionCode} (1/4)`);
    });

    it('should roll back if participant count exceeds the limit after add', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const countSpy = vi
        .spyOn(ParticipantModel, 'countParticipants')
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5);
      const callback = vi.fn();

      await handleSessionJoin(
        socket('late-socket') as any,
        { sessionCode, displayName: 'Late' },
        callback
      );

      expect(countSpy).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
      await expect(redis.exists('participant:late-socket')).resolves.toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:join for ${sessionCode}: participant limit exceeded after adding late-socket`
      );
    });

    it('should log when a new participant joins an already full session', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      vi.spyOn(ParticipantModel, 'countParticipants').mockResolvedValueOnce(4);
      const callback = vi.fn();

      await handleSessionJoin(
        socket('late-socket') as any,
        { sessionCode, displayName: 'Late' },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session is full (maximum 4 participants)',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:join for ${sessionCode}: session full before adding late-socket`
      );
    });

    it('should return generic error when join processing throws', async () => {
      const error = new Error('redis down');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionJoin(
        socket() as any,
        { sessionCode, displayName: 'Alice' },
        callback
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

      await handleSessionLeave(socket() as any, {} as any, { sessionCode: 'bad' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected session:leave for socket socket-1: invalid payload')
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:leave for ${sessionCode}: session not found`
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSessionLeave(socket('missing') as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:leave for ${sessionCode}: socket missing is not a participant`
      );
    });

    it('should remove participant and broadcast participant:left', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');
      const callback = vi.fn();

      await handleSessionLeave(testSocket as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(testSocket.leave).toHaveBeenCalledWith(sessionCode);
      expect(testSocket.roomEmitter.emit).toHaveBeenCalledWith('participant:left', {
        participantId: 'socket-1',
        displayName: 'Alice',
        participantCount: 0,
      });
      await expect(redis.exists('participant:socket-1')).resolves.toBe(0);
      expect(logSpy).toHaveBeenCalledWith(`✓ Alice left session ${sessionCode} (0/4 remaining)`);
    });

    it('should return generic error when leave processing throws', async () => {
      const error = new Error('redis down');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback);

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

      await handleDisconnect(testSocket as any, {} as any, 'transport close');

      expect(testSocket.to).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith('Socket missing disconnected: transport close');
      expect(warnSpy).toHaveBeenCalledWith(
        'Disconnect for socket missing had no participant record'
      );
    });

    it('should catch disconnect processing errors', async () => {
      const error = new Error('redis down');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(ParticipantModel, 'getParticipant').mockRejectedValueOnce(error);

      await expect(
        handleDisconnect(socket('socket-1') as any, {} as any, 'transport close')
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Error in disconnect handler:', error);
    });

    it('should log preserved participant disconnects', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const testSocket = socket('socket-1');

      await handleDisconnect(testSocket as any, {} as any, 'transport close');

      expect(logSpy).toHaveBeenCalledWith(`✓ Alice disconnected from ${sessionCode} (session preserved)`);
    });
  });

  describe('handleSessionRestart', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode: 'bad' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected session:restart for socket socket-1: invalid payload')
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:restart for ${sessionCode}: session not found`
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSessionRestart(socket('missing') as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected session:restart for ${sessionCode}: socket missing is not a participant`
      );
    });

    it('should return generic error when restart processing throws', async () => {
      const error = new Error('redis down');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while restarting the session',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in session:restart handler:', error);
    });

    it('should log successful restarts', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const callback = vi.fn();

      await handleSessionRestart(socket('socket-1') as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(logSpy).toHaveBeenCalledWith(`✓ Session ${sessionCode} restarted`);
    });
  });

  describe('handleSelectionSubmit', () => {
    it('should reject invalid payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode: 'bad', selections: [] } as any, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rejected selection:submit for socket socket-1: invalid payload')
      );
    });

    it('should reject missing sessions', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected selection:submit for ${sessionCode}: session not found`
      );
    });

    it('should reject sockets that are not participants', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSelectionSubmit(socket('missing') as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected selection:submit for ${sessionCode}: socket missing is not a participant`
      );
    });

    it('should map invalid selection errors to generic submit failure', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: ['missing-place'] },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Error submitting selections',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected selection:submit for ${sessionCode}: INVALID_RESTAURANTS from socket socket-1`
      );
    });

    it('should map already submitted errors to a friendly message', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      await ParticipantModel.markParticipantSubmitted('socket-1');
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You have already submitted your selections',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected selection:submit for ${sessionCode}: ALREADY_SUBMITTED from socket socket-1`
      );
    });

    it('should return generic error when submit processing throws', async () => {
      const error = new Error('redis down');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(error);
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while submitting selections',
      });
      expect(errorSpy).toHaveBeenCalledWith('Error in selection:submit handler:', error);
    });

    it('should map INVALID_OPTIONS errors when service uses that code', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      vi.spyOn(SelectionService, 'submitSelections').mockRejectedValueOnce(
        new Error('INVALID_OPTIONS')
      );
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback
      );

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'One or more selected options are invalid',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        `Rejected selection:submit for ${sessionCode}: INVALID_OPTIONS from socket socket-1`
      );
    });

    it('should log submitted counts and completion status', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await createSessionWithParticipant('socket-1');
      vi.spyOn(SelectionService, 'getSubmittedCount').mockResolvedValueOnce(1);
      vi.spyOn(SelectionService, 'submitSelections').mockResolvedValueOnce(undefined);
      vi.spyOn(OverlapService, 'calculateOverlap').mockResolvedValueOnce({
        overlappingOptions: [],
        allSelections: { Alice: [] },
        restaurantNames: {},
        hasOverlap: false,
      });
      vi.spyOn(OverlapService, 'storeResults').mockResolvedValueOnce(undefined);
      const callback = vi.fn();

      await handleSelectionSubmit(
        socket('socket-1') as any,
        io() as any,
        { sessionCode, selections: [] },
        callback
      );

      expect(callback).toHaveBeenCalledWith({ success: true });
      expect(logSpy).toHaveBeenCalledWith('✓ Participant socket-1 submitted (1/1)');
      expect(logSpy).toHaveBeenCalledWith(`✓ Session ${sessionCode} complete - No overlap`);
    });
  });
});
