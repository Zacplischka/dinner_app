import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redis } from '../../src/redis/client.js';
import * as SessionModel from '../../src/models/Session.js';
import * as ParticipantModel from '../../src/models/Participant.js';
import * as SelectionService from '../../src/services/SelectionService.js';
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
      const callback = vi.fn();

      await handleSessionJoin(socket() as any, { sessionCode: 'bad', displayName: '' } as any, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
    });

    it('should reject missing sessions', async () => {
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
    });

    it('should replace an existing participant when they rejoin with the same display name', async () => {
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
    });

    it('should roll back if participant count exceeds the limit after add', async () => {
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
    });

    it('should return generic error when join processing throws', async () => {
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(new Error('redis down'));
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
    });
  });

  describe('handleSessionLeave', () => {
    it('should reject invalid payloads', async () => {
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode: 'bad' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
    });

    it('should reject missing sessions', async () => {
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
    });

    it('should reject sockets that are not participants', async () => {
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSessionLeave(socket('missing') as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
    });

    it('should remove participant and broadcast participant:left', async () => {
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
    });

    it('should return generic error when leave processing throws', async () => {
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(new Error('redis down'));
      const callback = vi.fn();

      await handleSessionLeave(socket() as any, {} as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while leaving the session',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('should do nothing if the socket has no participant', async () => {
      const testSocket = socket('missing');

      await handleDisconnect(testSocket as any, {} as any, 'transport close');

      expect(testSocket.to).not.toHaveBeenCalled();
    });

    it('should catch disconnect processing errors', async () => {
      vi.spyOn(ParticipantModel, 'getParticipant').mockRejectedValueOnce(new Error('redis down'));

      await expect(
        handleDisconnect(socket('socket-1') as any, {} as any, 'transport close')
      ).resolves.toBeUndefined();
    });
  });

  describe('handleSessionRestart', () => {
    it('should reject invalid payloads', async () => {
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode: 'bad' }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
    });

    it('should reject missing sessions', async () => {
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
    });

    it('should reject sockets that are not participants', async () => {
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSessionRestart(socket('missing') as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
    });

    it('should return generic error when restart processing throws', async () => {
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(new Error('redis down'));
      const callback = vi.fn();

      await handleSessionRestart(socket() as any, io() as any, { sessionCode }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while restarting the session',
      });
    });
  });

  describe('handleSelectionSubmit', () => {
    it('should reject invalid payloads', async () => {
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode: 'bad', selections: [] } as any, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: expect.stringContaining('Invalid payload:'),
      });
    });

    it('should reject missing sessions', async () => {
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found or has expired',
      });
    });

    it('should reject sockets that are not participants', async () => {
      await SessionModel.createSession(sessionCode, 'host', 'Alice');
      const callback = vi.fn();

      await handleSelectionSubmit(socket('missing') as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'You are not a participant in this session',
      });
    });

    it('should map invalid selection errors to generic submit failure', async () => {
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
    });

    it('should map already submitted errors to a friendly message', async () => {
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
    });

    it('should return generic error when submit processing throws', async () => {
      vi.spyOn(SessionModel, 'getSession').mockRejectedValueOnce(new Error('redis down'));
      const callback = vi.fn();

      await handleSelectionSubmit(socket() as any, io() as any, { sessionCode, selections: [] }, callback);

      expect(callback).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred while submitting selections',
      });
    });

    it('should map INVALID_OPTIONS errors when service uses that code', async () => {
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
    });
  });
});
