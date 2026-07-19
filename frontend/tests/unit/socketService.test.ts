// socketService transport tests - connection lifecycle and ack-based requests
// over a fake socket.io client. UI wiring (stores/toasts) lives in
// socketBindings and is tested there.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected = true;
  id = 'socket-1';
  handlers = new Map<string, Handler[]>();
  onceHandlers = new Map<string, Handler[]>();
  acks = new Map<string, unknown>();
  disconnect = vi.fn(() => {
    this.connected = false;
  });

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
    return this;
  }

  once(event: string, handler: Handler) {
    this.onceHandlers.set(event, [...(this.onceHandlers.get(event) || []), handler]);
    return this;
  }

  emit(event: string, _payload?: unknown, callback?: Handler) {
    if (callback) {
      callback(this.acks.get(event) ?? { success: true });
    }
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
    const onceHandlers = this.onceHandlers.get(event) || [];
    this.onceHandlers.set(event, []);
    for (const handler of onceHandlers) {
      handler(...args);
    }
  }
}

const socketMocks = vi.hoisted(() => ({
  io: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
  io: socketMocks.io,
}));

import * as socketService from '../../src/services/socketService';

const participant = {
  participantId: 'participant-1',
  displayName: 'Alice',
  sessionCode: 'AB123',
  joinedAt: 1,
  hasSubmitted: false,
  isHost: true,
};

function setupSocket(connected = true) {
  const socket = new FakeSocket();
  socket.connected = connected;
  socketMocks.io.mockReturnValue(socket);
  return socket;
}

describe('socketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketService.disconnectSocket();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects with the injected auth token and registers injected event handlers', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const socket = setupSocket();
    const onConnect = vi.fn();
    const onJoined = vi.fn();

    socketService.initializeSocket({
      getAuthToken: () => 'token',
      onEvent: {
        connect: onConnect,
        'participant:joined': onJoined,
      },
    });

    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({
        auth: { token: 'token' },
      })
    );

    socket.trigger('connect');
    expect(onConnect).toHaveBeenCalled();

    const joinedEvent = { participantId: 'participant-2', displayName: 'Bob' };
    socket.trigger('participant:joined', joinedEvent);
    expect(onJoined).toHaveBeenCalledWith(joinedEvent);

    // Second initialize while connected is a no-op
    socketService.initializeSocket();
    expect(socketMocks.io).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Socket already connected');
  });

  it('connects without auth when no token provider is given', () => {
    setupSocket();

    socketService.initializeSocket();

    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ auth: undefined })
    );
  });

  it('normalizes legacy, bridge, and canonical join acks into one Ack<T>', async () => {
    const socket = setupSocket();
    socketService.initializeSocket();

    // Legacy: flattened success fields, no `data`.
    socket.acks.set('session:join', {
      success: true,
      participantId: 'participant-1',
      sessionCode: 'AB123',
      displayName: 'Alice',
      participantCount: 1,
      participants: [{ participantId: 'participant-1', displayName: 'Alice', isHost: true }],
    });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual({
      success: true,
      data: {
        participantId: 'participant-1',
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 1,
        participants: [{ participantId: 'participant-1', displayName: 'Alice', isHost: true }],
      },
    });

    // Bridge/canonical success: prefer the canonical `data` payload.
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: 'p9',
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 2,
        participants: [{ participantId: 'p9', displayName: 'Alice', isHost: false }],
      },
      // stale flat fields the normalizer must ignore in favor of `data`
      participantId: 'STALE',
    });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toMatchObject({
      success: true,
      data: { participantId: 'p9', participantCount: 2 },
    });

    // Bridge failure: `apiError` wins over the legacy `error` string.
    socket.acks.set('session:join', {
      success: false,
      error: 'Session is full',
      apiError: { code: 'SESSION_FULL', message: 'The session already has 4 participants' },
    });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual({
      success: false,
      error: { code: 'SESSION_FULL', message: 'The session already has 4 participants' },
    });

    // Canonical failure: ApiError-typed `error`.
    socket.acks.set('session:join', {
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'No such session' },
    });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'No such session' },
    });

    // Legacy failure: fall back to the human-readable string under UNKNOWN.
    socket.acks.set('session:join', { success: false, error: 'nope' });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual({
      success: false,
      error: { code: 'UNKNOWN', message: 'nope' },
    });

    // Empty failure: fall back to the command's default message.
    socket.acks.set('session:join', { success: false });
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual({
      success: false,
      error: { code: 'UNKNOWN', message: 'Failed to join session' },
    });
  });

  it('normalizes no-data command acks (submit/restart/leave) into Ack<null>', async () => {
    const socket = setupSocket();
    socketService.initializeSocket();

    for (const [event, call, fallback] of [
      [
        'selection:submit',
        () => socketService.submitSelection('AB123', ['place-1']),
        'Failed to submit selection',
      ],
      ['session:restart', () => socketService.restartSession('AB123'), 'Failed to restart session'],
      ['session:leave', () => socketService.leaveSession('AB123'), 'Failed to leave session'],
    ] as const) {
      // Canonical success acknowledges `data: null`.
      socket.acks.set(event, { success: true, data: null });
      await expect(call()).resolves.toEqual({ success: true, data: null });

      // Bridge failure prefers apiError.
      socket.acks.set(event, {
        success: false,
        error: 'legacy text',
        apiError: { code: 'VALIDATION_ERROR', message: 'bad input' },
      });
      await expect(call()).resolves.toEqual({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad input' },
      });

      // Empty failure falls back to the command default.
      socket.acks.set(event, { success: false });
      await expect(call()).resolves.toEqual({
        success: false,
        error: { code: 'UNKNOWN', message: fallback },
      });
    }
  });

  it('returns a failure Ack when disconnected and exposes socket helpers', async () => {
    const socket = setupSocket(false);
    socketService.initializeSocket();

    const notConnected = {
      success: false,
      error: { code: 'UNKNOWN', message: 'Socket not connected' },
    };
    await expect(socketService.joinSession('AB123', 'Alice')).resolves.toEqual(notConnected);
    await expect(socketService.submitSelection('AB123', [])).resolves.toEqual(notConnected);
    await expect(socketService.restartSession('AB123')).resolves.toEqual(notConnected);
    await expect(socketService.leaveSession('AB123')).resolves.toEqual(notConnected);

    expect(socketService.getSocketId()).toBe('socket-1');

    socketService.disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socketService.getSocketId()).toBeUndefined();
  });

  it('should wait for connection, connection errors, and timeouts', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      const socket = setupSocket(false);
      socketService.initializeSocket();

      const connected = expect(socketService.waitForConnection()).resolves.toBeUndefined();
      socket.trigger('connect');
      socket.connected = true;
      await connected;
      await expect(socketService.waitForConnection()).resolves.toBeUndefined();

      socket.connected = false;
      const failed = expect(socketService.waitForConnection()).rejects.toThrow('connect failed');
      socket.trigger('connect_error', new Error('connect failed'));
      await failed;

      const timedOut = expect(socketService.waitForConnection(10)).rejects.toThrow(
        'Socket connection timeout'
      );
      await vi.advanceTimersByTimeAsync(10);
      await timedOut;
    } finally {
      vi.useRealTimers();
    }
  });

  it('should use configured backend URL', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_BACKEND_URL', 'https://socket.example.test');
    const freshSocketService = await import('../../src/services/socketService');
    setupSocket();

    freshSocketService.initializeSocket();

    expect(socketMocks.io).toHaveBeenLastCalledWith(
      'https://socket.example.test',
      expect.objectContaining({ auth: undefined })
    );
    freshSocketService.disconnectSocket();
    vi.unstubAllEnvs();
  });
});
