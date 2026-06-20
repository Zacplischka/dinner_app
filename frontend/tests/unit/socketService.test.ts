import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';

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
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('socket.io-client', () => ({
  io: socketMocks.io,
}));

vi.mock('../../src/hooks/useToast', () => ({
  toast: socketMocks.toast,
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
    useSessionStore.getState().resetSession();
    useSessionStore.setState({ participants: [participant], sessionCode: 'OLD111' });
    useAuthStore.setState({ session: { access_token: 'token' } as any });
  });

  it('should initialize with auth, update connection state, and handle lifecycle events', () => {
    const socket = setupSocket();

    socketService.initializeSocket();
    socket.trigger('connect');

    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({
        auth: { token: 'token' },
      })
    );
    expect(useSessionStore.getState().isConnected).toBe(true);
    expect(useSessionStore.getState().currentUserId).toBe('socket-1');

    socket.trigger('disconnect', 'transport close');
    expect(useSessionStore.getState().isConnected).toBe(false);
    expect(socketMocks.toast.warning).toHaveBeenCalled();

    socket.trigger('disconnect', 'io client disconnect');
    socket.trigger('connect_error', new Error('down'));
    expect(useSessionStore.getState().isConnected).toBe(false);

    socket.trigger('connect');
    expect(socketMocks.toast.success).toHaveBeenCalledWith('Reconnected to server');

    socketService.initializeSocket();
    expect(socketMocks.io).toHaveBeenCalledTimes(1);
  });

  it('should handle server participant and session events', () => {
    const socket = setupSocket();
    socketService.initializeSocket();

    socket.trigger('participant:joined', {
      participantId: 'participant-2',
      displayName: 'Bob',
    });
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Bob');

    socket.trigger('participant:joined', {
      participantId: 'participant-3',
      displayName: 'Bob',
    });
    expect(useSessionStore.getState().participants.find((p) => p.displayName === 'Bob')?.participantId).toBe('participant-3');

    socket.trigger('participant:left', { participantId: 'participant-3' });
    expect(useSessionStore.getState().participants.find((p) => p.participantId === 'participant-3')).toBeUndefined();

    socket.trigger('participant:left', { participantId: 'missing' });
    socket.trigger('participant:disconnected', { participantId: 'participant-1', displayName: 'Fallback' });
    socket.trigger('participant:disconnected', { participantId: 'missing', displayName: 'Cara' });
    socket.trigger('participant:submitted', { participantId: 'participant-1' });
    socket.trigger('participant:submitted', { participantId: 'missing' });
    expect(useSessionStore.getState().participants[0].hasSubmitted).toBe(true);
    expect(socketMocks.toast.warning).toHaveBeenCalledWith('Alice lost connection', { duration: 3000 });

    socket.trigger('session:results', {
      sessionCode: 'ABC123',
      hasOverlap: true,
      overlappingOptions: [{ optionId: 'pizza', displayName: 'Pizza' }],
      allSelections: { Alice: ['pizza'] },
      restaurantNames: { pizza: 'Pizza' },
    });
    expect(useSessionStore.getState().sessionStatus).toBe('complete');

    socket.trigger('session:restarted', { sessionCode: 'ABC123' });
    expect(useSessionStore.getState().sessionStatus).toBe('selecting');

    socket.trigger('session:expired', { sessionCode: 'ABC123' });
    expect(useSessionStore.getState().sessionStatus).toBe('expired');

    socket.trigger('error', { message: 'bad' });
    socket.trigger('error', {});
    expect(socketMocks.toast.error).toHaveBeenCalledWith('bad');
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
    expect(useSessionStore.getState().sessionCode).toBe('ABC123');

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
    expect(socketService.connectSocket()).toBe(socket);

    socketService.disconnectSocket();
    expect(useSessionStore.getState().isConnected).toBe(false);
  });

  it('should wait for connection, connection errors, and timeouts', async () => {
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

  it('should use configured backend URL and omit auth when no token is available', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_BACKEND_URL', 'https://socket.example.test');
    const freshAuthStore = await import('../../src/stores/authStore');
    const freshSocketService = await import('../../src/services/socketService');
    const socket = setupSocket();
    freshAuthStore.useAuthStore.setState({ session: null });

    freshSocketService.initializeSocket();

    expect(socketMocks.io).toHaveBeenLastCalledWith(
      'https://socket.example.test',
      expect.objectContaining({ auth: undefined })
    );
    expect(freshSocketService.connectSocket()).toBe(socket);

    freshSocketService.disconnectSocket();
    vi.unstubAllEnvs();
  });
});
