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

  // Events in here never answer; like socket.io, the ack then errors once the
  // timeout() window closes.
  silent = new Set<string>();
  timeoutMs?: number;

  timeout(ms: number) {
    this.timeoutMs = ms;
    return this;
  }

  // After timeout(), socket.io hands the callback (err, ack) — mirrored here.
  emit(event: string, _payload?: unknown, callback?: Handler) {
    if (callback) {
      if (this.silent.has(event)) {
        setTimeout(() => callback(new Error('operation has timed out')), this.timeoutMs);
      } else {
        callback(null, this.acks.get(event) ?? { success: true });
      }
    }
    this.timeoutMs = undefined;
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

  it('registers injected event handlers and sends no handshake auth', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const socket = setupSocket();
    const onConnect = vi.fn();
    const onJoined = vi.fn();

    socketService.initializeSocket({
      onEvent: {
        connect: onConnect,
        'participant:joined': onJoined,
      },
    });

    expect(socketMocks.io).toHaveBeenCalledWith('http://localhost:3001', expect.any(Object));
    expect(socketMocks.io.mock.calls[0][1]).not.toHaveProperty('auth');

    socket.trigger('connect');
    expect(onConnect).toHaveBeenCalled();

    const joinedEvent = { participantId: 'participant-2', displayName: 'Bob' };
    socket.trigger('participant:joined', joinedEvent);
    expect(onJoined).toHaveBeenCalledWith(joinedEvent);

    // Second initialize while connected is a no-op
    socketService.initializeSocket();
    expect(socketMocks.io).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Socket already initialized');
  });

  // #518: polling first, then upgrade. On a reload polling rides the warm HTTP
  // connection, where WebSocket-only paid for a new one before every rejoin.
  it("keeps Socket.IO's default transports", () => {
    setupSocket();
    socketService.initializeSocket();
    expect(socketMocks.io.mock.calls[0][1]).not.toHaveProperty('transports');
  });

  it('never orphans a socket that is mid-reconnect', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const retrying = setupSocket(false);
    socketService.initializeSocket();

    // A join page calling waitForConnection while the Manager is still
    // retrying must attach to that socket, not open a second io().
    socketService.initializeSocket();
    void socketService.waitForConnection(50).catch(() => undefined);
    expect(socketMocks.io).toHaveBeenCalledTimes(1);
    expect(retrying.disconnect).not.toHaveBeenCalled();
    expect(retrying.onceHandlers.get('connect')).toHaveLength(1);

    // A fresh socket is wanted only after an explicit disconnect.
    socketService.disconnectSocket();
    setupSocket();
    socketService.initializeSocket();
    expect(socketMocks.io).toHaveBeenCalledTimes(2);
  });

  it('retries for the life of the Session: no reconnection cap', () => {
    setupSocket();

    socketService.initializeSocket();

    // A finite cap left the Manager dead after ~15s of backoff while the
    // header still read "Reconnecting..."; the Session's own TTL is the bound.
    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ reconnection: true, reconnectionAttempts: Infinity })
    );
  });

  it('resolves canonical join acks as-is', async () => {
    const socket = setupSocket();
    socketService.initializeSocket();
    const emitSpy = vi.spyOn(socket, 'emit');

    // Canonical success: the `data` payload is passed through untouched.
    const joinData = {
      participantId: 'p9',
      sessionCode: 'AB123',
      displayName: 'Alice',
      participantCount: 2,
      rejoinToken: 'rejoin-token',
      participants: [{ participantId: 'p9', displayName: 'Alice', isHost: false }],
    };
    socket.acks.set('session:join', { success: true, data: joinData });
    await expect(
      socketService.joinSession({
        sessionCode: 'AB123',
        displayName: 'Alice',
        rejoinToken: 'rejoin-token',
      })
    ).resolves.toEqual({
      success: true,
      data: joinData,
    });
    expect(emitSpy).toHaveBeenCalledWith(
      'session:join',
      { sessionCode: 'AB123', displayName: 'Alice', rejoinToken: 'rejoin-token' },
      expect.any(Function)
    );

    // Canonical failure: the ApiError `error` is passed through untouched.
    socket.acks.set('session:join', {
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'No such session' },
    });
    await expect(
      socketService.joinSession({ sessionCode: 'AB123', displayName: 'Alice' })
    ).resolves.toEqual({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'No such session' },
    });
  });

  it('resolves canonical no-data command acks (submit/restart/leave) as-is', async () => {
    const socket = setupSocket();
    socketService.initializeSocket();

    for (const [event, call] of [
      [
        'selection:submit',
        () => socketService.submitSelection({ sessionCode: 'AB123', selections: ['place-1'] }),
      ],
      ['session:restart', () => socketService.restartSession({ sessionCode: 'AB123' })],
      ['session:leave', () => socketService.leaveSession({ sessionCode: 'AB123' })],
    ] as const) {
      // Canonical success acknowledges `data: null`.
      socket.acks.set(event, { success: true, data: null });
      await expect(call()).resolves.toEqual({ success: true, data: null });

      // Canonical failure: the ApiError `error` is passed through untouched.
      socket.acks.set(event, {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad input' },
      });
      await expect(call()).resolves.toEqual({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'bad input' },
      });
    }
  });

  it('fails a command whose ack never arrives instead of hanging forever', async () => {
    vi.useFakeTimers();
    try {
      const socket = setupSocket();
      socketService.initializeSocket();
      socket.silent.add('selection:submit');

      const settled = vi.fn();
      void socketService
        .submitSelection({ sessionCode: 'AB123', selections: ['place-1'] })
        .then(settled);

      // Still in flight just short of the window...
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).not.toHaveBeenCalled();
      expect(socket.timeoutMs).toBeUndefined(); // the flag is per-emit, as in socket.io

      // ...and a failure Ack, in the shape every caller already handles, once it closes.
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'UNKNOWN',
          message:
            "The server didn't respond. Reconnecting to check what happened before you try again.",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  // #511: order:open is an idempotent read whose failure the order page and
  // recovery already handle. Recovering on its timeout lifts the gate back onto
  // the page, which reads again: a ten-second loop.
  it('recovers after a lost mutation ack but not after a lost basket read', async () => {
    vi.useFakeTimers();
    try {
      const socket = setupSocket();
      const onUncertainOutcome = vi.fn();
      socketService.initializeSocket({ onUncertainOutcome });
      socket.silent.add('order:open');
      socket.silent.add('order:item');

      // Nothing reconnects after a lost read, so its message must not say so.
      const read = socketService.openOrder({ sessionCode: 'AB123', placeId: 'place-1' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await read).toEqual({
        success: false,
        error: { code: 'UNKNOWN', message: "The server didn't respond. Try again." },
      });
      expect(onUncertainOutcome).not.toHaveBeenCalled();

      const tap = socketService.addOrderItem({ sessionCode: 'AB123', index: 0, delta: 1 });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await tap).toMatchObject({
        success: false,
        error: {
          message:
            "The server didn't respond. Reconnecting to check what happened before you try again.",
        },
      });
      expect(onUncertainOutcome).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a failure Ack when disconnected and exposes socket helpers', async () => {
    const socket = setupSocket(false);
    socketService.initializeSocket();

    const notConnected = {
      success: false,
      // Says only what the client knows: not connected covers mid-reconnect and
      // a dead server too, so it must not claim the user is offline (#409).
      error: { code: 'UNKNOWN', message: 'Not connected. Check your connection and try again.' },
    };
    await expect(
      socketService.joinSession({ sessionCode: 'AB123', displayName: 'Alice' })
    ).resolves.toEqual(notConnected);
    await expect(
      socketService.submitSelection({ sessionCode: 'AB123', selections: [] })
    ).resolves.toEqual(notConnected);
    await expect(socketService.restartSession({ sessionCode: 'AB123' })).resolves.toEqual(
      notConnected
    );
    await expect(socketService.leaveSession({ sessionCode: 'AB123' })).resolves.toEqual(
      notConnected
    );

    expect(socketService.getSocketId()).toBe('socket-1');

    socketService.disconnectSocket();
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socketService.getSocketId()).toBeUndefined();
  });

  it('blocks a manual retry after a lost Order Line ack until the basket is reconciled', async () => {
    const bindings = await import('../../src/services/socketBindings');
    const { useSessionStore } = await import('../../src/stores/sessionStore');
    const { useOrderStore } = await import('../../src/stores/orderStore');
    const participant = {
      participantId: 'socket-1',
      displayName: 'Alice',
      sessionCode: 'AB123',
      hasSubmitted: true,
      isHost: true,
    };
    const basket = {
      sessionCode: 'AB123',
      placeId: 'place-1',
      venueName: 'Pizza',
      platform: 'ubereats' as const,
      state: 'building' as const,
      pricesAt: '2026-09-08T00:00:00Z',
      lines: [],
      feeCents: 0,
      itemsCents: 0,
      totalCents: 0,
      shares: [],
      menu: [{ name: 'Margherita', price_cents: 2300, tags: [] }],
    };
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      participants: [participant],
      orderPlaceId: basket.placeId,
      sessionStatus: 'complete',
      isConnected: true,
    });
    useOrderStore.getState().setOrder(basket, basket.menu);
    sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
    window.history.replaceState({}, '', '/session/AB123/order');
    const socket = setupSocket();
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: participant.participantId,
        rejoinToken: 'rejoin-token',
        state: 'complete',
        participants: [participant],
      },
    });
    let readBasket: Handler | undefined;
    const originalEmit = socket.emit.bind(socket);
    const emitted = vi.spyOn(socket, 'emit').mockImplementation((event, payload, callback) => {
      if (event === 'order:open') {
        readBasket = callback;
        return socket;
      }
      return originalEmit(event, payload, callback);
    });
    bindings.initializeSocket();
    vi.useFakeTimers();
    try {
      socket.silent.add('order:item');
      const first = bindings.addOrderItem({ sessionCode: 'AB123', index: 0, delta: 1 });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await first).toMatchObject({ success: false });
      expect(readBasket).toBeDefined();
      // No automatic replay occurred, but a second deliberate tap must also
      // wait: the server may already have added the first pizza.
      const itemEmits = () => emitted.mock.calls.filter(([event]) => event === 'order:item');
      expect(itemEmits()).toHaveLength(1);
      expect.soft(useSessionStore.getState().isConnected).toBe(false);
      socket.silent.delete('order:item');
      expect
        .soft(await bindings.addOrderItem({ sessionCode: 'AB123', index: 0, delta: 1 }))
        .toMatchObject({
          success: false,
          error: {
            message: 'Your session is still being checked. Try again once it reconnects.',
          },
        });
      expect.soft(itemEmits()).toHaveLength(1);

      const recovery = bindings.reconcileSession();
      readBasket!(null, {
        success: false,
        error: { code: 'UNKNOWN', message: 'Temporary read failure' },
      });
      await recovery;
      // The rejoin itself succeeded, so the phone is back in its Session
      // (#511), but with no basket read the second pizza still has to wait.
      expect.soft(useSessionStore.getState().isConnected).toBe(true);
      expect(useOrderStore.getState().order).toBeNull();
      expect
        .soft(await bindings.addOrderItem({ sessionCode: 'AB123', index: 0, delta: 1 }))
        .toMatchObject({
          success: false,
          error: { message: 'Your basket is reloading. Try again in a moment.' },
        });
      expect.soft(itemEmits()).toHaveLength(1);

      // The existing Try again recovery action must remain usable after a
      // failed read; only its successful snapshot enables a new deliberate tap.
      readBasket = undefined;
      const retriedRecovery = bindings.reconcileSession();
      await vi.advanceTimersByTimeAsync(0);
      expect(readBasket).toBeDefined();
      readBasket!(null, {
        success: true,
        data: {
          ...basket,
          lines: [{ index: 0, name: 'Margherita', priceCents: 2300, qty: 1, by: 'Alice' }],
          itemsCents: 2300,
          totalCents: 2300,
        },
      });
      await retriedRecovery;
      expect(useOrderStore.getState().order?.lines[0].qty).toBe(1);
      expect(useSessionStore.getState().isConnected).toBe(true);
      expect.soft(itemEmits()).toHaveLength(1);
      expect(
        await bindings.addOrderItem({ sessionCode: 'AB123', index: 0, delta: 1 })
      ).toMatchObject({ success: true });
      expect.soft(itemEmits()).toHaveLength(2);

      readBasket = undefined;
      const recoveryBeforeRestart = bindings.reconcileSession();
      await vi.advanceTimersByTimeAsync(0);
      expect(readBasket).toBeDefined();
      socket.trigger('session:restarted', {
        sessionCode: 'AB123',
        state: 'waiting',
        message: 'Restarted',
      });
      expect(useSessionStore.getState().orderPlaceId).toBeNull();
      readBasket!(null, { success: true, data: basket });
      await recoveryBeforeRestart;
      expect(useOrderStore.getState().order).toBeNull();
      expect(useSessionStore.getState()).toMatchObject({
        sessionStatus: 'waiting',
        isConnected: true,
      });
    } finally {
      bindings.disconnectSocket();
      useSessionStore.getState().resetSession();
      window.history.replaceState({}, '', '/');
      vi.useRealTimers();
    }
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
      expect.any(Object)
    );
    freshSocketService.disconnectSocket();
    vi.unstubAllEnvs();
  });
});
