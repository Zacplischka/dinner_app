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
  sessionCode: 'ABC123',
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

  it('should resolve and reject ack-based actions', async () => {
    const socket = setupSocket();
    socketService.initializeSocket();
    socket.acks.set('session:join', {
      success: true,
      participantId: 'participant-1',
      participants: [participant],
    });

    await expect(socketService.joinSession('ABC123', 'Alice')).resolves.toMatchObject({
      success: true,
    });

    socket.acks.set('session:join', { success: false, error: 'nope' });
    await expect(socketService.joinSession('ABC123', 'Alice')).rejects.toThrow('nope');
    socket.acks.set('session:join', { success: false });
    await expect(socketService.joinSession('ABC123', 'Alice')).rejects.toThrow('Failed to join session');

    socket.acks.set('selection:submit', { success: true });
    await expect(socketService.submitSelection('ABC123', ['place-1'])).resolves.toEqual({ success: true });
    socket.acks.set('selection:submit', { success: false, error: 'bad submit' });
    await expect(socketService.submitSelection('ABC123', ['place-1'])).rejects.toThrow('bad submit');
    socket.acks.set('selection:submit', { success: false });
    await expect(socketService.submitSelection('ABC123', ['place-1'])).rejects.toThrow('Failed to submit selection');

    socket.acks.set('session:restart', { success: true });
    await expect(socketService.restartSession('ABC123')).resolves.toBeUndefined();
    socket.acks.set('session:restart', { success: false, error: 'bad restart' });
    await expect(socketService.restartSession('ABC123')).rejects.toThrow('bad restart');
    socket.acks.set('session:restart', { success: false });
    await expect(socketService.restartSession('ABC123')).rejects.toThrow('Failed to restart session');

    socket.acks.set('session:leave', { success: true });
    await expect(socketService.leaveSession('ABC123')).resolves.toEqual({ success: true });
    socket.acks.set('session:leave', { success: false, error: 'bad leave' });
    await expect(socketService.leaveSession('ABC123')).rejects.toThrow('bad leave');
    socket.acks.set('session:leave', { success: false });
    await expect(socketService.leaveSession('ABC123')).rejects.toThrow('Failed to leave session');
  });

  it('should reject actions when disconnected and expose socket helpers', async () => {
    const socket = setupSocket(false);
    socketService.initializeSocket();

    await expect(socketService.joinSession('ABC123', 'Alice')).rejects.toThrow('Socket not connected');
    await expect(socketService.submitSelection('ABC123', [])).rejects.toThrow('Socket not connected');
    await expect(socketService.restartSession('ABC123')).rejects.toThrow('Socket not connected');
    await expect(socketService.leaveSession('ABC123')).rejects.toThrow('Socket not connected');

    expect(socketService.getSocketId()).toBe('socket-1');
    expect(socketService.isSocketConnected()).toBe(false);

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

      const timedOut = expect(socketService.waitForConnection(10)).rejects.toThrow('Socket connection timeout');
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
