// socketBindings owns every socket → UI wiring: store mutations and toasts.
// Exercised through the bindings' public API over a fake socket.io client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';

type Handler = (...args: any[]) => void;

class FakeSocket {
  connected = true;
  id = 'socket-1';
  handlers = new Map<string, Handler[]>();
  acks = new Map<string, unknown>();
  disconnect = vi.fn(() => {
    this.connected = false;
  });

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
    return this;
  }

  once(event: string, handler: Handler) {
    return this.on(event, handler);
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

import * as socketBindings from '../../src/services/socketBindings';

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

describe('socketBindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    socketBindings.disconnectSocket();
    useSessionStore.getState().resetSession();
    useSessionStore.setState({ participants: [participant], sessionCode: 'OLD111' });
    useAuthStore.setState({ session: { access_token: 'token' } as any });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects with the auth token and mirrors connection state into the session store', () => {
    const socket = setupSocket();

    socketBindings.initializeSocket();
    socket.trigger('connect');

    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ auth: { token: 'token' } })
    );
    expect(useSessionStore.getState().isConnected).toBe(true);
    expect(useSessionStore.getState().currentUserId).toBe('socket-1');

    socket.trigger('disconnect', 'transport close');
    expect(useSessionStore.getState().isConnected).toBe(false);
    expect(socketMocks.toast.warning).toHaveBeenCalledWith(
      'Connection lost. Reconnecting...',
      { duration: 4000 }
    );

    socket.trigger('connect_error', new Error('down'));
    expect(useSessionStore.getState().isConnected).toBe(false);

    // Reconnect after a previous connection announces itself
    socket.trigger('connect');
    expect(socketMocks.toast.success).toHaveBeenCalledWith('Reconnected to server');
  });

  it('does not toast on an intentional disconnect', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('disconnect', 'io client disconnect');

    expect(socketMocks.toast.warning).not.toHaveBeenCalled();
  });

  it('updates participants from server events', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    // New participant joins
    socket.trigger('participant:joined', { participantId: 'participant-2', displayName: 'Bob' });
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Bob');
    expect(socketMocks.toast.info).toHaveBeenCalledWith('Bob joined the session');

    // Same displayName with a new id is a rejoin, not a duplicate
    socket.trigger('participant:joined', { participantId: 'participant-3', displayName: 'Bob' });
    expect(
      useSessionStore.getState().participants.filter((p) => p.displayName === 'Bob')
    ).toHaveLength(1);
    expect(
      useSessionStore.getState().participants.find((p) => p.displayName === 'Bob')?.participantId
    ).toBe('participant-3');
    expect(socketMocks.toast.info).toHaveBeenCalledWith('Bob reconnected');

    // Intentional leave removes the participant
    socket.trigger('participant:left', { participantId: 'participant-3' });
    expect(
      useSessionStore.getState().participants.find((p) => p.participantId === 'participant-3')
    ).toBeUndefined();

    // Disconnection is informational only - participant stays (FR-025)
    socket.trigger('participant:disconnected', {
      participantId: 'participant-1',
      displayName: 'Fallback',
    });
    expect(
      useSessionStore.getState().participants.find((p) => p.participantId === 'participant-1')
    ).toBeDefined();
    expect(socketMocks.toast.warning).toHaveBeenCalledWith('Alice lost connection', {
      duration: 3000,
    });

    // Submission flips hasSubmitted
    socket.trigger('participant:submitted', { participantId: 'participant-1' });
    expect(useSessionStore.getState().participants[0].hasSubmitted).toBe(true);
  });

  it('handles session lifecycle events and server errors', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

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
    expect(socketMocks.toast.error).toHaveBeenCalledWith('bad');
    socket.trigger('error', {});
    expect(socketMocks.toast.error).toHaveBeenCalledWith('An error occurred');
  });

  it('stores session state when joining and resets it when leaving', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    socket.acks.set('session:join', {
      success: true,
      participantId: 'participant-1',
      participants: [participant],
    });

    await expect(socketBindings.joinSession('ABC123', 'Alice')).resolves.toMatchObject({
      success: true,
    });
    expect(useSessionStore.getState().sessionCode).toBe('ABC123');
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Alice');

    socket.acks.set('session:leave', { success: true });
    await expect(socketBindings.leaveSession('ABC123')).resolves.toEqual({ success: true });
    expect(useSessionStore.getState().sessionCode).toBeNull();
  });

  it('resets selections when joining a different session than the stored one', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({ selections: ['stale'] } as any);
    socket.acks.set('session:join', {
      success: true,
      participantId: 'participant-1',
      participants: [participant],
    });

    await socketBindings.joinSession('NEW999', 'Alice');

    expect(useSessionStore.getState().selections).toEqual([]);
    expect(useSessionStore.getState().sessionCode).toBe('NEW999');
  });

  it('clears connection status when disconnecting', () => {
    setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.getState().setConnectionStatus(true);

    socketBindings.disconnectSocket();

    expect(useSessionStore.getState().isConnected).toBe(false);
  });
});
