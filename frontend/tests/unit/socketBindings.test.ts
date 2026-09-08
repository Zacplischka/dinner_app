// socketBindings owns every socket → UI wiring: store mutations and toasts.
// Exercised through the bindings' public API over a fake socket.io client.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOrderStore } from '../../src/stores/orderStore';

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

  timeout(_ms: number) {
    return this;
  }

  // After timeout(), socket.io hands the callback (err, ack) — mirrored here.
  emit(event: string, _payload?: unknown, callback?: Handler) {
    if (callback) {
      callback(null, this.acks.get(event) ?? { success: true });
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

describe('socketBindings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    socketBindings.disconnectSocket();
    useSessionStore.getState().resetSession();
    useSessionStore.setState({ participants: [participant], sessionCode: 'OLD11' });
    useAuthStore.setState({ session: { access_token: 'token' } as any });
    useOrderStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.pushState({}, '', '/');
  });

  it('connects with the auth token and mirrors connection state into the session store', () => {
    const socket = setupSocket();

    socketBindings.initializeSocket();
    socket.trigger('connect');

    expect(socketMocks.io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ auth: expect.any(Function) })
    );
    const auth = socketMocks.io.mock.calls[0][1].auth;
    const handshake = vi.fn();
    auth(handshake);
    expect(handshake).toHaveBeenLastCalledWith({ token: 'token' });
    useAuthStore.setState({ session: null });
    auth(handshake);
    expect(handshake).toHaveBeenLastCalledWith({});
    expect(useSessionStore.getState().isConnected).toBe(true);
    expect(useSessionStore.getState().currentUserId).toBe('socket-1');

    socket.trigger('disconnect', 'transport close');
    expect(useSessionStore.getState().isConnected).toBe(false);
    expect(socketMocks.toast.warning).toHaveBeenCalledWith('Connection lost. Reconnecting…', {
      duration: 4000,
    });

    socket.trigger('connect_error', new Error('down'));
    expect(useSessionStore.getState().isConnected).toBe(false);

    // Reconnect after a previous connection announces itself
    socket.trigger('connect');
    expect(socketMocks.toast.success).toHaveBeenCalledWith('Reconnected to server');
  });

  // #304: rejoin identity is per-tab (sessionStorage). A token in
  // localStorage would be shared by every tab and let one hijack another.
  it('rejoins the persisted session after refresh and clears it when rejoin fails', async () => {
    const socket = setupSocket();
    const emitSpy = vi.spyOn(socket, 'emit');
    sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      participants: [participant],
      isConnected: false,
    });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: socket.id,
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 1,
        rejoinToken: 'next-rejoin-token',
        participants: [{ participantId: socket.id, displayName: 'Alice', isHost: true }],
      },
    });

    socketBindings.initializeSocket();
    socket.trigger('connect');

    await vi.waitFor(() =>
      expect(emitSpy).toHaveBeenCalledWith(
        'session:join',
        { sessionCode: 'AB123', displayName: 'Alice', rejoinToken: 'rejoin-token' },
        expect.any(Function)
      )
    );
    expect(useSessionStore.getState().currentUserId).toBe(socket.id);

    socket.acks.set('session:join', {
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'expired' },
    });
    socket.trigger('connect');

    await vi.waitFor(() => expect(useSessionStore.getState().sessionCode).toBeNull());
    expect(useSessionStore.getState().isConnected).toBe(false);
    expect(useSessionStore.getState().participants).toEqual([]);
    expect(sessionStorage.getItem('dinder:rejoin:AB123:Alice')).toBeNull();
    expect(socketMocks.toast.error).toHaveBeenCalledWith('Could not rejoin session: expired');

    socket.trigger('connect');
    expect(emitSpy).toHaveBeenCalledTimes(2);
  });

  it('re-fires order:open on reconnect when on the order route, and feeds a successful ack into orderStore', async () => {
    const socket = setupSocket();
    const emitSpy = vi.spyOn(socket, 'emit');
    window.history.pushState({}, '', '/session/AB123/order');
    sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      participants: [participant],
      orderPlaceId: 'place-1',
      isConnected: false,
    });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: socket.id,
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 1,
        rejoinToken: 'next-rejoin-token',
        participants: [{ participantId: socket.id, displayName: 'Alice', isHost: true }],
      },
    });
    const orderState = {
      sessionCode: 'AB123',
      placeId: 'place-1',
      venueName: '11 Inch Pizza',
      platform: 'ubereats',
      pricesAt: '2026-07-22T07:42:00.000Z',
      lines: [],
      feeCents: 0,
      itemsCents: 0,
      totalCents: 0,
      shares: [],
      state: 'building',
      menu: [{ name: 'Margherita', price_cents: 2300, tags: [] }],
    };
    socket.acks.set('order:open', { success: true, data: orderState });

    socketBindings.initializeSocket();
    socket.trigger('connect');

    await vi.waitFor(() =>
      expect(emitSpy).toHaveBeenCalledWith(
        'order:open',
        { sessionCode: 'AB123', placeId: 'place-1' },
        expect.any(Function)
      )
    );
    // The backend acks order:open directly (no order:state broadcast for it),
    // so a successful re-open must feed orderStore itself — otherwise a
    // failure screen the page already rendered while losing the race never
    // clears.
    await vi.waitFor(() => expect(useOrderStore.getState().order).toEqual(orderState));
    expect(useOrderStore.getState().menu).toEqual(orderState.menu);
  });

  it('clears recovery when the basket read proves the Participant is no longer admitted', async () => {
    const socket = setupSocket();
    window.history.pushState({}, '', '/session/AB123/order');
    sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      participants: [participant],
      orderPlaceId: 'place-1',
      isConnected: false,
    });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: socket.id,
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 1,
        rejoinToken: 'next-rejoin-token',
        participants: [{ participantId: socket.id, displayName: 'Alice', isHost: true }],
      },
    });
    socket.acks.set('order:open', {
      success: false,
      error: { code: 'NOT_IN_SESSION', message: 'gone' },
    });

    socketBindings.initializeSocket();
    socket.trigger('connect');

    await vi.waitFor(() => expect(useSessionStore.getState().rejectedSessionCode).toBe('AB123'));
    expect(useSessionStore.getState()).toMatchObject({
      sessionCode: null,
      currentUserId: null,
      isConnected: false,
    });
    expect(useOrderStore.getState().order).toBeNull();
  });

  it('does not toast on an intentional disconnect', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('disconnect', 'io client disconnect');

    expect(socketMocks.toast.warning).not.toHaveBeenCalled();
  });

  it('updates participants from server events', () => {
    vi.useFakeTimers();
    const socket = setupSocket();
    socketBindings.initializeSocket();

    // New participant joins
    socket.trigger('participant:joined', {
      participantId: 'participant-2',
      displayName: 'Bob',
      isRejoin: false,
    });
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Bob');
    expect(socketMocks.toast.info).toHaveBeenCalledWith('Bob joined the session');

    // Server-flagged rejoin updates the existing entry instead of duplicating
    socket.trigger('participant:joined', {
      participantId: 'participant-3',
      displayName: 'Bob',
      isRejoin: true,
    });
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
    vi.advanceTimersByTime(5000);
    expect(socketMocks.toast.warning).toHaveBeenCalledWith('Alice lost connection', {
      duration: 3000,
    });
    expect(
      useSessionStore.getState().participants.find((p) => p.displayName === 'Alice')?.isOnline
    ).toBe(false);

    // A subsequent rejoin for the same displayName flips presence back and does not duplicate
    socket.trigger('participant:joined', {
      participantId: 'participant-9',
      displayName: 'Alice',
      isRejoin: true,
    });
    expect(
      useSessionStore.getState().participants.filter((p) => p.displayName === 'Alice')
    ).toHaveLength(1);
    expect(
      useSessionStore.getState().participants.find((p) => p.displayName === 'Alice')?.isOnline
    ).toBe(true);

    // Submission flips hasSubmitted
    socket.trigger('participant:submitted', { participantId: 'participant-9' });
    expect(useSessionStore.getState().participants[0].hasSubmitted).toBe(true);
  });

  // A Disconnect is not a Leave (the server holds the place for two minutes),
  // and most drops are a locked phone. The room hears about one only if it
  // outlasts the grace period; a rejoin inside it is silent both ways.
  it('does not toast the room about a Participant whose drop is over before the grace period', () => {
    vi.useFakeTimers();
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('participant:disconnected', {
      participantId: 'participant-1',
      displayName: 'Alice',
    });
    // The badge is honest at once; the toast waits.
    expect(useSessionStore.getState().participants[0].isOnline).toBe(false);
    vi.advanceTimersByTime(4999);
    expect(socketMocks.toast.warning).not.toHaveBeenCalled();

    socket.trigger('participant:joined', {
      participantId: 'participant-9',
      displayName: 'Alice',
      isRejoin: true,
    });
    vi.advanceTimersByTime(5000);
    expect(socketMocks.toast.warning).not.toHaveBeenCalled();
    expect(socketMocks.toast.info).not.toHaveBeenCalledWith('Alice reconnected');
    expect(useSessionStore.getState().participants[0].isOnline).toBe(true);

    // A drop that outlasts the window is announced, and so is its recovery.
    socket.trigger('participant:disconnected', {
      participantId: 'participant-9',
      displayName: 'Alice',
    });
    vi.advanceTimersByTime(5000);
    expect(socketMocks.toast.warning).toHaveBeenCalledWith('Alice lost connection', {
      duration: 3000,
    });
    socket.trigger('participant:joined', {
      participantId: 'participant-10',
      displayName: 'Alice',
      isRejoin: true,
    });
    expect(socketMocks.toast.info).toHaveBeenCalledWith('Alice reconnected');
  });

  // #283: a stale event from a Session this browser already left must not grow
  // the roster — that phantom Participant suppressed the Full House overlay.
  it('ignores participant:joined for a Session the client is not in', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('participant:joined', {
      participantId: 'phantom-1',
      displayName: 'Bee',
      sessionCode: 'G65WM',
      isRejoin: false,
    });

    expect(useSessionStore.getState().participants).toHaveLength(1);
    expect(socketMocks.toast.info).not.toHaveBeenCalled();

    // The current Session's events (store sessionCode OLD11) still land
    socket.trigger('participant:joined', {
      participantId: 'participant-2',
      displayName: 'Bob',
      sessionCode: 'OLD11',
      isRejoin: false,
    });
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Bob');
  });

  // #405: the start guard reads isHost off the roster, so a Host who left and
  // rejoined has to arrive as a Host. Assuming false leaves every other client
  // hostless and hands all of them a button the server refuses.
  it('takes a joiner isHost from the server', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('participant:joined', {
      participantId: 'participant-2',
      displayName: 'Bo',
      isRejoin: false,
      isHost: true,
    });
    expect(
      useSessionStore.getState().participants.find((p) => p.displayName === 'Bo')?.isHost
    ).toBe(true);

    // Additive (ADR 0007): an older backend sends none, so the entry keeps the
    // flag it already has rather than being demoted by a reconnect.
    socket.trigger('participant:joined', {
      participantId: 'participant-3',
      displayName: 'Bo',
      isRejoin: true,
    });
    expect(
      useSessionStore.getState().participants.find((p) => p.displayName === 'Bo')?.isHost
    ).toBe(true);
  });

  it('handles session lifecycle events and server errors', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('session:results', {
      sessionCode: 'AB123',
      hasOverlap: true,
      overlappingOptions: [{ placeId: 'pizza', name: 'Pizza' }],
      allSelections: { Alice: ['pizza'] },
      restaurantNames: { pizza: 'Pizza' },
    });
    expect(useSessionStore.getState().sessionStatus).toBe('complete');

    socket.trigger('session:restarted', { sessionCode: 'AB123' });
    expect(useSessionStore.getState().sessionStatus).toBe('selecting');

    socket.trigger('session:expired', { sessionCode: 'AB123' });
    expect(useSessionStore.getState().sessionStatus).toBe('expired');

    socket.trigger('error', { message: 'bad' });
    expect(socketMocks.toast.error).toHaveBeenCalledWith('bad');
    socket.trigger('error', {});
    expect(socketMocks.toast.error).toHaveBeenCalledWith('An error occurred');
  });

  it('carries session:results shoppingListId into the store, so a Cook Session can reach its list (#253)', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('session:results', {
      sessionCode: 'AB123',
      hasOverlap: true,
      overlappingOptions: [{ placeId: '634891', name: 'Best Chicken Parmesan' }],
      allSelections: { Alice: ['634891'] },
      restaurantNames: { '634891': 'Best Chicken Parmesan' },
      shoppingListId: '42690f06-ec14-4751-8dbf-45ce8dadc9d6',
    });

    // The binding used to rebuild the payload field-by-field and drop this one,
    // so the mint succeeded server-side and no Participant could ever reach it.
    expect(useSessionStore.getState().shoppingListId).toBe('42690f06-ec14-4751-8dbf-45ce8dadc9d6');
  });

  it('order:state toasts a removal by someone else — not my own removal, not an addition', () => {
    const socket = setupSocket();
    useSessionStore.setState({
      participants: [participant],
      currentUserId: participant.participantId,
    });
    socketBindings.initializeSocket();

    const order = { lines: [], shares: [], itemsCents: 0 } as never;

    // Someone else removes an item → toast.
    socket.trigger('order:state', {
      sessionCode: 'AB123',
      order,
      change: { by: 'Bob', name: 'Margherita', delta: -1 },
    });
    expect(socketMocks.toast.info).toHaveBeenCalledWith('Bob removed Margherita');
    socketMocks.toast.info.mockClear();

    // My own removal (participant is Alice) → no toast.
    socket.trigger('order:state', {
      sessionCode: 'AB123',
      order,
      change: { by: 'Alice', name: 'Margherita', delta: -1 },
    });
    // Any addition → no toast.
    socket.trigger('order:state', {
      sessionCode: 'AB123',
      order,
      change: { by: 'Bob', name: 'Margherita', delta: 1 },
    });
    expect(socketMocks.toast.info).not.toHaveBeenCalled();

    // The store keeps order and change for the page's ring flash.
    expect(useOrderStore.getState().change).toEqual({ by: 'Bob', name: 'Margherita', delta: 1 });
  });

  it('resolves a relative session:results photoUrl to an absolute URL on both overlappingOptions and topPick (hero rider, #166)', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    socket.trigger('session:results', {
      sessionCode: 'AB123',
      hasOverlap: true,
      overlappingOptions: [
        { placeId: 'pizza', name: 'Pizza', photoUrl: '/api/comparison/photo?name=pizza-photo' },
      ],
      allSelections: { Alice: ['pizza'] },
      restaurantNames: { pizza: 'Pizza' },
      topPick: {
        restaurant: {
          placeId: 'pizza',
          name: 'Pizza',
          photoUrl: '/api/comparison/photo?name=pizza-photo',
        },
        likedBy: 1,
        of: 1,
      },
    });

    const { overlappingOptions, topPick } = useSessionStore.getState();
    expect(overlappingOptions[0].photoUrl).toBe(
      'http://localhost:3001/api/comparison/photo?name=pizza-photo'
    );
    expect(topPick?.restaurant.photoUrl).toBe(
      'http://localhost:3001/api/comparison/photo?name=pizza-photo'
    );
  });

  it('keeps deliberate admission current while waiting through a transport reconnect', async () => {
    const { beginSessionIntent, isSessionIntentCurrent } =
      await import('../../src/services/sessionIntent');
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.getState().resetSession();
    const intent = beginSessionIntent('AAA11', 'Alice');
    socket.connected = false;
    const connected = socketBindings.waitForConnection();
    socket.trigger('disconnect', 'transport close');
    socket.connected = true;
    socket.trigger('connect');
    await connected;
    expect(isSessionIntentCurrent(intent)).toBe(true);
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: socket.id,
        state: 'waiting',
        rejoinToken: 'capability',
        participants: [participant],
      },
    });
    expect(await socketBindings.joinSession('AAA11', 'Alice', false, intent)).toMatchObject({
      success: true,
    });
    expect(useSessionStore.getState().sessionCode).toBe('AAA11');
  });

  it('recovers a successful deliberate join if transport changes during credential persistence', async () => {
    const storage = await import('../../src/services/nativeStorage');
    const save = storage.saveRejoinToken;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const saving = vi.spyOn(storage, 'saveRejoinToken').mockImplementationOnce(async (...args) => {
      await save(...args);
      await held;
    });
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.getState().resetSession();
    const joined = {
      success: true,
      data: {
        participantId: socket.id,
        state: 'waiting',
        rejoinToken: 'capability',
        participants: [{ ...participant, participantId: socket.id }],
      },
    };
    socket.acks.set('session:join', joined);
    const admission = socketBindings.joinSession('AAA11', 'Alice');
    try {
      await vi.waitFor(() => expect(saving).toHaveBeenCalledOnce());
      socket.connected = false;
      socket.trigger('disconnect', 'transport close');
      socket.id = 'new-socket';
      socket.connected = true;
      socket.acks.set('session:join', {
        ...joined,
        data: {
          ...joined.data,
          participantId: socket.id,
          participants: [{ ...participant, participantId: socket.id }],
        },
      });
      socket.trigger('connect');
      release();
      await admission;
      await vi.waitFor(() =>
        expect(useSessionStore.getState()).toMatchObject({
          sessionCode: 'AAA11',
          currentUserId: 'new-socket',
          isConnected: true,
        })
      );
    } finally {
      release();
      await admission;
    }
  });

  it('lets the real Invite Link destination retry an autojoin interrupted by transport loss', async () => {
    const { createElement: h } = await import('react');
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react/pure');
    const { MemoryRouter, Routes, Route } = await import('react-router-dom');
    const { default: JoinSessionPage } = await import('../../src/pages/JoinSessionPage');
    const api = await import('../../src/services/apiClient');
    vi.spyOn(api, 'getSession').mockResolvedValue({} as never);
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.getState().resetSession();
    useAuthStore.setState({
      user: { id: 'profile', user_metadata: { full_name: 'Alice' } } as never,
      isLoading: false,
    });
    let finish!: Handler;
    const original = socket.emit.bind(socket);
    const emit = vi.spyOn(socket, 'emit').mockImplementationOnce((_event, _payload, callback) => {
      finish = callback!;
      return socket;
    });
    try {
      render(
        h(
          MemoryRouter,
          { initialEntries: ['/join?code=AAA11'] },
          h(
            Routes,
            {},
            h(Route, { path: '/join', element: h(JoinSessionPage) }),
            h(Route, { path: '/session/:code', element: h('div', {}, 'Joined after retry') })
          )
        )
      );
      await vi.waitFor(() => expect(finish).toBeDefined());
      await act(async () => {
        socket.connected = false;
        socket.trigger('disconnect', 'transport close');
        finish(new Error('transport closed'));
      });
      expect(screen.getByRole('button', { name: 'Join session' })).toBeEnabled();
      expect(screen.getByRole('alert')).toHaveTextContent("The server didn't respond");
      emit.mockImplementation(original);
      socket.acks.set('session:join', {
        success: true,
        data: {
          participantId: socket.id,
          state: 'waiting',
          rejoinToken: 'capability',
          participants: [participant],
        },
      });
      await act(async () => {
        socket.connected = true;
        socket.trigger('connect');
        fireEvent.click(screen.getByRole('button', { name: 'Join session' }));
      });
      expect(await screen.findByText('Joined after retry')).toBeInTheDocument();
      expect(useSessionStore.getState().sessionCode).toBe('AAA11');
    } finally {
      cleanup();
    }
  });

  it.each(['success', 'failure'] as const)(
    'serializes admission and suppresses an older %s',
    async (outcome) => {
      const socket = setupSocket();
      socketBindings.initializeSocket();
      const pending: Array<{ event: string; payload: unknown; callback: Handler }> = [];
      vi.spyOn(socket, 'emit').mockImplementation((event, payload, callback) => {
        if (callback) pending.push({ event, payload, callback });
        return socket;
      });
      const data = (code: string) => ({
        success: true,
        data: {
          sessionCode: code,
          participantId: socket.id,
          state: 'waiting',
          rejoinToken: code,
          participants: [{ ...participant, participantId: socket.id }],
        },
      });
      const old = socketBindings.joinSession('AAA11', 'Alice');
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      const newer = socketBindings.joinSession('BBB22', 'Alice');
      expect(pending).toHaveLength(1);
      pending[0].callback(
        null,
        outcome === 'success'
          ? data('AAA11')
          : {
              success: false,
              error: { code: 'SESSION_NOT_FOUND', message: 'Old error' },
            }
      );
      await vi.waitFor(() => expect(pending[1]?.event).toBe('session:leave'));
      expect(useSessionStore.getState().sessionCode).toBe('OLD11');
      pending[1].callback(null, { success: true, data: null });
      await vi.waitFor(() => expect(pending[2]?.event).toBe('session:join'));
      pending[2].callback(null, data('BBB22'));
      expect(await old).toMatchObject({ success: false });
      expect(await newer).toMatchObject({ success: true });
      expect(useSessionStore.getState().sessionCode).toBe('BBB22');
      expect(sessionStorage.getItem('dinder:rejoin:AAA11:Alice')).toBeNull();
      expect(sessionStorage.getItem('dinder:rejoin:BBB22:Alice')).toBe('BBB22');
    }
  );

  it('preserves the capability when the latest admission targets the same Participant', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    let finish!: Handler;
    const original = socket.emit.bind(socket);
    const emit = vi.spyOn(socket, 'emit').mockImplementationOnce((_event, _payload, callback) => {
      finish = callback!;
      return socket;
    });
    const joined = {
      success: true,
      data: {
        participantId: socket.id,
        state: 'complete',
        rejoinToken: 'existing-capability',
        participants: [participant],
      },
    };
    socket.acks.set('session:join', joined);
    const old = socketBindings.joinSession('AAA11', 'Alice');
    await vi.waitFor(() => expect(finish).toBeDefined());
    const current = socketBindings.joinSession('AAA11', 'Alice');
    emit.mockImplementation(original);
    finish(null, joined);
    expect(await old).toMatchObject({ success: false });
    expect(await current).toMatchObject({ success: true });
    expect(emit).toHaveBeenLastCalledWith(
      'session:join',
      {
        sessionCode: 'AAA11',
        displayName: 'Alice',
        rejoinToken: 'existing-capability',
      },
      expect.any(Function)
    );
    expect(emit.mock.calls.some(([event]) => event === 'session:leave')).toBe(false);
  });

  it('does not let a delayed Leave reset a newer join', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    let left!: Handler;
    const original = socket.emit.bind(socket);
    vi.spyOn(socket, 'emit').mockImplementation((event, payload, callback) => {
      if (event === 'session:leave') {
        left = callback!;
        return socket;
      }
      return original(event, payload, callback);
    });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: socket.id,
        state: 'waiting',
        rejoinToken: 'new',
        participants: [participant],
      },
    });
    const leaving = socketBindings.leaveSession('OLD11');
    await vi.waitFor(() => expect(left).toBeDefined());
    const joining = socketBindings.joinSession('BBB22', 'Alice');
    left(null, { success: true, data: null });
    expect(await leaving).toMatchObject({ success: false });
    await joining;
    expect(useSessionStore.getState().sessionCode).toBe('BBB22');
  });

  it('stores session state when joining and resets it when leaving', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    socket.acks.set('session:join', {
      success: true,
      data: { participants: [participant], rejoinToken: 'rejoin-token' },
    });

    // A second join in the same tab reuses a live socket, so no `connect` event
    // fires — the ack is what has to mark the store connected.
    useSessionStore.setState({ isConnected: false });
    await expect(socketBindings.joinSession('AB123', 'Alice')).resolves.toMatchObject({
      success: true,
    });
    expect(useSessionStore.getState().sessionCode).toBe('AB123');
    expect(useSessionStore.getState().isConnected).toBe(true);
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toContain('Alice');
    expect(sessionStorage.getItem('dinder:rejoin:AB123:Alice')).toBe('rejoin-token');

    const emitSpy = vi.spyOn(socket, 'emit');
    await socketBindings.joinSession('AB123', 'Alice');
    expect(emitSpy).toHaveBeenCalledWith(
      'session:join',
      { sessionCode: 'AB123', displayName: 'Alice', rejoinToken: 'rejoin-token' },
      expect.any(Function)
    );

    socket.acks.set('session:leave', { success: true, data: null });
    await expect(socketBindings.leaveSession('AB123')).resolves.toEqual({
      success: true,
      data: null,
    });
    expect(useSessionStore.getState().sessionCode).toBeNull();
  });

  it('maps a canonical join ack DTO into Participant state and leaves store untouched on failure', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();

    // Canonical success: only `data`, no flattened fields.
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: 'p-canon',
        sessionCode: 'CN456',
        displayName: 'Carol',
        participantCount: 1,
        rejoinToken: 'carol-rejoin-token',
        participants: [{ participantId: 'p-canon', displayName: 'Carol', isHost: true }],
      },
    });
    await socketBindings.joinSession('CN456', 'Carol');
    expect(useSessionStore.getState().sessionCode).toBe('CN456');
    expect(useSessionStore.getState().participants.map((p) => p.displayName)).toEqual(['Carol']);

    // Canonical failure: store must not be mutated, ack surfaces the ApiError.
    socket.acks.set('session:join', {
      success: false,
      error: { code: 'SESSION_FULL', message: 'full' },
    });
    const ack = await socketBindings.joinSession('OTHER', 'Dave');
    expect(ack).toEqual({ success: false, error: { code: 'SESSION_FULL', message: 'full' } });
    expect(useSessionStore.getState().sessionCode).toBe('CN456'); // unchanged
  });

  // #258: the Branch decides what the results screen offers, and every
  // Participant — host and joiner alike — reaches it through this ack.
  it('stores the Session Branch from the join ack', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    socket.acks.set('session:join', {
      success: true,
      data: { participants: [participant], rejoinToken: 'rejoin-token', branch: 'eatout' },
    });

    await socketBindings.joinSession('AB123', 'Alice');

    expect(useSessionStore.getState().branch).toBe('eatout');
  });

  it('resets selections when joining a different session than the stored one', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({ selections: ['stale'] } as any);
    socket.acks.set('session:join', {
      success: true,
      data: { participants: [participant], rejoinToken: 'rejoin-token' },
    });

    await socketBindings.joinSession('NEW99', 'Alice');

    expect(useSessionStore.getState().selections).toEqual([]);
    expect(useSessionStore.getState().sessionCode).toBe('NEW99');
    expect(useSessionStore.getState().sessionStatus).toBe('waiting');
  });

  // #284: a join admitted mid-Deck carries the Session's state and who has
  // already submitted, so the joiner lands on the Deck with honest counts.
  // The store is seeded the way JoinSessionPage really leaves it — the SAME
  // sessionCode stored, status pinned 'waiting', BEFORE the ack lands — so
  // this fails if state adoption ever hides behind the different-session guard.
  it('adopts a selecting state and hasSubmitted flags from a late-join ack', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({ sessionCode: 'NEW99', sessionStatus: 'waiting' } as any);
    socket.acks.set('session:join', {
      success: true,
      data: {
        participants: [
          { participantId: 'p1', displayName: 'Alice', isHost: true, hasSubmitted: true },
          { participantId: 'p2', displayName: 'Bob', isHost: false },
        ],
        rejoinToken: 'rejoin-token',
        state: 'selecting',
      },
    });

    await socketBindings.joinSession('NEW99', 'Bob');

    expect(useSessionStore.getState().sessionStatus).toBe('selecting');
    expect(
      useSessionStore.getState().participants.map((p) => [p.displayName, p.hasSubmitted])
    ).toEqual([
      ['Alice', true],
      ['Bob', false],
    ]);
  });

  it('seeds presence from the join ack roster, so a Participant who dropped before the join starts offline', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    socket.acks.set('session:join', {
      success: true,
      data: {
        participants: [
          { participantId: 'p1', displayName: 'Alice', isHost: true, isOnline: false },
          { participantId: 'p2', displayName: 'Bob', isHost: false, isOnline: true },
          // Older backend: no flag reads as live.
          { participantId: 'p3', displayName: 'Cy', isHost: false },
        ],
        rejoinToken: 'rejoin-token',
      },
    });

    await socketBindings.joinSession('NEW99', 'Cy');

    expect(
      useSessionStore.getState().participants.map((p) => [p.displayName, p.isOnline === false])
    ).toEqual([
      ['Alice', true],
      ['Bob', false],
      ['Cy', false],
    ]);
  });

  it('leaves sessionStatus untouched when a same-session ack carries no state (older backend)', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({ sessionCode: 'AB123', sessionStatus: 'selecting' } as any);
    socket.acks.set('session:join', {
      success: true,
      data: { participants: [participant], rejoinToken: 'rejoin-token' },
    });

    await socketBindings.joinSession('AB123', 'Alice');

    expect(useSessionStore.getState().sessionStatus).toBe('selecting');
  });

  it('clears connection status when disconnecting', () => {
    setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.getState().setConnectionStatus(true);

    socketBindings.disconnectSocket();

    expect(useSessionStore.getState().isConnected).toBe(false);
  });

  // The "had a connection" flag is module-level. Left set across an intentional
  // teardown, the first connect of the NEXT Session announced "Reconnected".
  it('does not toast "Reconnected" on the first connect after leaving a Session and disconnecting', async () => {
    const first = setupSocket();
    socketBindings.initializeSocket();
    first.trigger('connect');
    first.acks.set('session:leave', { success: true, data: null });
    await socketBindings.leaveSession('OLD11');
    socketBindings.disconnectSocket();

    const next = setupSocket();
    socketBindings.initializeSocket();
    next.trigger('connect');

    expect(useSessionStore.getState().isConnected).toBe(true);
    expect(socketMocks.toast.success).not.toHaveBeenCalled();
  });
  it('adopts authoritative lobby choices, ignores stale revisions and restarts to the Lobby', () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({ sessionCode: 'AB123', selections: ['old'], deckCursor: 3 });
    const lobby = {
      sessionCode: 'AB123',
      state: 'waiting',
      branch: 'watch',
      revision: 2,
      mealType: 'main course',
      headcount: 2,
      deckSize: 15,
      searchRadiusMiles: 5,
      participants: [{ ...participant, ready: true, isOnline: true, waitingForNextRound: false }],
    };
    socket.trigger('session:lobby', lobby);
    socket.trigger('session:lobby', { ...lobby, revision: 1, participants: [] });
    expect(useSessionStore.getState().participants).toHaveLength(1);
    expect(useSessionStore.getState().lobby?.revision).toBe(2);
    socket.trigger('session:restarted', {
      sessionCode: 'AB123',
      state: 'waiting',
      lobby: { ...lobby, revision: 3 },
    });
    expect(useSessionStore.getState().sessionStatus).toBe('waiting');
    expect(useSessionStore.getState().selections).toEqual([]);
    expect(useSessionStore.getState().deckCursor).toBe(0);
  });

  it.each([
    { state: 'waiting', round: 7, revision: 9 },
    { state: 'selecting', round: 13, revision: 14 },
  ])('discards a missed Restart on rejoin into $state', async (recovered) => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    const lobby = {
      sessionCode: 'AB123',
      state: 'selecting' as const,
      branch: 'watch' as const,
      round: 7,
      revision: 8,
      mealType: 'main course' as const,
      headcount: 2,
      deckSize: 15,
      searchRadiusMiles: 5,
      participants: [{ ...participant, ready: true, isOnline: true, waitingForNextRound: false }],
    };
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      lobby,
      selections: ['old-movie'],
      deckCursor: 15,
      restaurants: [{ placeId: 'old-movie', name: 'Old movie' }],
      allSelections: { Alice: ['old-movie'] },
      liveSelections: { 'old-movie': ['Bob'] },
      overlappingOptions: [{ placeId: 'old-movie', name: 'Old movie' }],
      shoppingListId: 'old-list',
      orderPlaceId: 'old-venue',
    });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: participant.participantId,
        participants: lobby.participants,
        rejoinToken: 'rejoin-token',
        lobby: { ...lobby, ...recovered },
      },
    });

    await socketBindings.joinSession('AB123', 'Alice');

    expect(useSessionStore.getState()).toMatchObject({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      sessionStatus: recovered.state,
      lobby: { ...recovered },
      selections: [],
      deckCursor: 0,
      restaurants: [],
      allSelections: {},
      liveSelections: {},
      overlappingOptions: [],
      shoppingListId: undefined,
      orderPlaceId: null,
    });

    // Once selecting, membership revisions in this same round preserve progress.
    const activeLobby = {
      ...lobby,
      ...recovered,
      state: 'selecting',
      revision: recovered.revision + 1,
    };
    socket.trigger('session:lobby', activeLobby);
    useSessionStore.getState().setSelections(['new-movie']);
    useSessionStore.getState().setDeckCursor(1);
    socket.trigger('session:lobby', { ...activeLobby, revision: activeLobby.revision + 1 });
    expect(useSessionStore.getState().selections).toEqual(['new-movie']);
    expect(useSessionStore.getState().deckCursor).toBe(1);
  });

  it('does not restore a discarded Match from a delayed completed-rejoin ack', async () => {
    const socket = setupSocket();
    socketBindings.initializeSocket();
    const lobby = {
      sessionCode: 'AB123',
      state: 'complete' as const,
      branch: 'watch' as const,
      round: 7,
      revision: 8,
      mealType: 'main course' as const,
      headcount: 2,
      deckSize: 15,
      searchRadiusMiles: 5,
      participants: [{ ...participant, ready: true, isOnline: true, waitingForNextRound: false }],
    };
    useSessionStore.setState({ sessionCode: 'AB123', lobby, sessionStatus: 'complete' });
    socket.acks.set('session:join', {
      success: true,
      data: {
        participantId: participant.participantId,
        participants: lobby.participants,
        rejoinToken: 'rejoin-token',
        lobby,
        results: {
          sessionCode: 'AB123',
          hasOverlap: true,
          overlappingOptions: [{ placeId: 'old-movie', name: 'Old movie' }],
          allSelections: { Alice: ['old-movie'] },
        },
      },
    });

    const rejoin = socketBindings.joinSession('AB123', 'Alice');
    socket.trigger('session:restarted', {
      sessionCode: 'AB123',
      state: 'waiting',
      lobby: { ...lobby, state: 'waiting', revision: 9 },
    });
    await rejoin;

    expect(useSessionStore.getState()).toMatchObject({
      sessionStatus: 'waiting',
      lobby: { state: 'waiting', revision: 9 },
      overlappingOptions: [],
      allSelections: {},
    });
  });

  it('binds selections to the round that produced this Deck', async () => {
    const socket = setupSocket();
    const emit = vi.spyOn(socket, 'emit');
    socketBindings.initializeSocket();
    useSessionStore.setState({
      sessionCode: 'AB123',
      isConnected: true,
      lobby: { sessionCode: 'AB123', round: 7 } as never,
    });
    await socketBindings.submitSelection('AB123', ['movie-1']);
    await socketBindings.sendLiveSelection('AB123', 'movie-1', true);
    expect(emit).toHaveBeenCalledWith(
      'selection:submit',
      { sessionCode: 'AB123', selections: ['movie-1'], round: 7 },
      expect.any(Function)
    );
    expect(emit).toHaveBeenCalledWith(
      'selection:live',
      { sessionCode: 'AB123', placeId: 'movie-1', retract: true, round: 7 },
      expect.any(Function)
    );
  });

  it.each([
    ['session:join', 'none'],
    ['order:open', 'none'],
    ['session:join', 'different'],
    ['order:open', 'different'],
    ['session:join', 'same'],
    ['order:open', 'same'],
  ] as const)(
    'ignores late %s recovery after Leave (replacement Session: %s)',
    async (pendingEvent, replaced) => {
      const socket = setupSocket();
      socketBindings.initializeSocket();
      useSessionStore.setState({
        sessionCode: 'AB123',
        currentUserId: participant.participantId,
        orderPlaceId: 'pizza',
        isConnected: true,
      });
      sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
      const joined = {
        success: true,
        data: {
          participantId: participant.participantId,
          rejoinToken: 'rejoin-token',
          state: 'complete',
          participants: [participant],
        },
      };
      const basket = {
        success: true,
        data: {
          sessionCode: 'AB123',
          placeId: 'pizza',
          venueName: 'Pizza',
          platform: 'ubereats',
          pricesAt: '2026-09-08T00:00:00Z',
          state: 'building',
          lines: [],
          menu: [],
          feeCents: 0,
          itemsCents: 0,
          totalCents: 0,
          shares: [],
        },
      };
      socket.acks.set('session:join', joined);
      socket.acks.set('order:open', basket);
      socket.acks.set('session:leave', { success: true, data: null });
      let completeRead: Handler | undefined;
      const originalEmit = socket.emit.bind(socket);
      vi.spyOn(socket, 'emit').mockImplementation((event, payload, callback) => {
        if (event === pendingEvent && !completeRead) {
          completeRead = callback;
          return socket;
        }
        return originalEmit(event, payload, callback);
      });
      const recovery = socketBindings.reconcileSession();
      await vi.waitFor(() => expect(completeRead).toBeDefined());
      const leaving = socketBindings.leaveSession('AB123');
      if (pendingEvent === 'session:join') completeRead!(null, joined);
      await leaving;
      expect(useSessionStore.getState().sessionCode).toBeNull();
      if (replaced === 'different')
        useSessionStore.setState({
          sessionCode: 'NEW99',
          currentUserId: 'new-participant',
          isConnected: true,
        });
      if (replaced === 'same') {
        socket.acks.set('session:join', {
          ...joined,
          data: { ...joined.data, rejoinToken: 'fresh-admission-token' },
        });
        await socketBindings.joinSession('AB123', 'Alice');
      }
      completeRead!(
        null,
        replaced === 'different'
          ? { success: false, error: { code: 'SESSION_NOT_FOUND', message: 'Expired' } }
          : pendingEvent === 'session:join'
            ? joined
            : basket
      );
      await recovery;
      expect(useSessionStore.getState()).toMatchObject({
        sessionCode: replaced === 'different' ? 'NEW99' : replaced === 'same' ? 'AB123' : null,
        currentUserId:
          replaced === 'different'
            ? 'new-participant'
            : replaced === 'same'
              ? participant.participantId
              : null,
        isConnected: replaced !== 'none',
      });
      expect(useOrderStore.getState().order).toBeNull();
      expect(sessionStorage.getItem('dinder:rejoin:AB123:Alice')).toBe(
        replaced === 'same' ? 'fresh-admission-token' : null
      );
    }
  );

  it.each([false, true])(
    'hydrates a completed rejoin without resubmitting (collaborative: %s)',
    async (collaborative) => {
      const socket = setupSocket();
      const emit = vi.spyOn(socket, 'emit');
      socketBindings.initializeSocket();
      const lobby = collaborative
        ? {
            sessionCode: 'AB123',
            state: 'complete' as const,
            branch: 'watch' as const,
            round: 7,
            revision: 8,
            mealType: 'main course' as const,
            headcount: 2,
            deckSize: 15,
            searchRadiusMiles: 5,
            participants: [
              { ...participant, ready: true, isOnline: true, waitingForNextRound: false },
            ],
          }
        : undefined;
      useSessionStore.setState({ sessionCode: 'AB123', lobby });
      socket.acks.set('session:join', {
        success: true,
        data: {
          participantId: 'socket-1',
          participants: [participant],
          rejoinToken: 'token',
          state: 'complete',
          lobby,
          results: {
            sessionCode: 'AB123',
            overlappingOptions: [{ placeId: 'movie-1', name: 'Shared movie' }],
            allSelections: { Alice: ['movie-1'] },
            hasOverlap: true,
            topPick: {
              restaurant: { placeId: 'movie-1', name: 'Shared movie' },
              likedBy: 1,
              of: 1,
            },
            shoppingListId: 'existing-list',
          },
        },
      });
      const rejoin = socketBindings.joinSession('AB123', 'Alice');
      if (lobby) socket.trigger('session:lobby', { ...lobby, revision: lobby.revision + 1 });
      await rejoin;
      expect(useSessionStore.getState().sessionStatus).toBe('complete');
      expect(useSessionStore.getState().topPick?.restaurant.name).toBe('Shared movie');
      expect(useSessionStore.getState().shoppingListId).toBe('existing-list');
      expect(emit.mock.calls.map(([event]) => event)).toEqual(['session:join']);
    }
  );

  it.each(['stale', 'no_menu', 'invalid_outcome'])(
    'returns an authoritative missing basket (%s) to the existing menu recovery UI',
    async (reason) => {
      const socket = setupSocket();
      socketBindings.initializeSocket();
      useSessionStore.setState({
        sessionCode: 'AB123',
        currentUserId: participant.participantId,
        orderPlaceId: 'pizza',
        isConnected: true,
      });
      sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
      socket.acks.set('session:join', {
        success: true,
        data: {
          participantId: participant.participantId,
          rejoinToken: 'rejoin-token',
          state: 'complete',
          participants: [participant],
        },
      });
      socket.acks.set('order:open', {
        success: false,
        error: {
          code: reason === 'invalid_outcome' ? 'VALIDATION_ERROR' : 'NOT_FOUND',
          reason,
          message: 'No current menu',
        },
      });
      const emit = vi.spyOn(socket, 'emit');
      await socketBindings.reconcileSession();
      expect(useSessionStore.getState()).toMatchObject({
        sessionCode: 'AB123',
        isConnected: reason !== 'invalid_outcome',
        orderPlaceId: reason === 'invalid_outcome' ? null : 'pizza',
      });
      expect(useOrderStore.getState().order).toBeNull();
      if (reason === 'invalid_outcome') {
        await socketBindings.reconcileSession();
        expect(useSessionStore.getState().isConnected).toBe(true);
        expect(emit.mock.calls.filter(([event]) => event === 'order:open')).toHaveLength(1);
      }
    }
  );

  it('starts fresh recovery when transport reconnects during credential persistence', async () => {
    const storage = await import('../../src/services/nativeStorage');
    const save = storage.saveRejoinToken;
    let finishSave!: () => void;
    const heldSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const persist = vi.spyOn(storage, 'saveRejoinToken').mockImplementationOnce(async (...args) => {
      await save(...args);
      await heldSave;
    });
    const socket = setupSocket();
    socketBindings.initializeSocket();
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: participant.participantId,
      isConnected: true,
    });
    sessionStorage.setItem('dinder:rejoin:AB123:Alice', 'rejoin-token');
    const joined = {
      success: true,
      data: {
        participantId: socket.id,
        rejoinToken: 'rejoin-token',
        state: 'selecting',
        participants: [{ ...participant, participantId: socket.id }],
      },
    };
    socket.acks.set('session:join', joined);
    const emitted = vi.spyOn(socket, 'emit');
    const oldRecovery = socketBindings.reconcileSession();
    try {
      await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
      socket.connected = false;
      socket.trigger('disconnect', 'transport close');
      socket.id = 'socket-2';
      socket.connected = true;
      socket.acks.set('session:join', {
        success: true,
        data: {
          ...joined.data,
          participantId: socket.id,
          rejoinToken: 'newest-token',
          participants: [{ ...participant, participantId: socket.id }],
        },
      });
      socket.trigger('connect');
      finishSave();
      await vi.waitFor(() =>
        expect(emitted.mock.calls.filter(([event]) => event === 'session:join')).toHaveLength(2)
      );
      await oldRecovery;
      await vi.waitFor(() =>
        expect(useSessionStore.getState()).toMatchObject({
          sessionCode: 'AB123',
          currentUserId: 'socket-2',
          isConnected: true,
        })
      );
      expect(sessionStorage.getItem('dinder:rejoin:AB123:Alice')).toBe('newest-token');
    } finally {
      finishSave();
      await oldRecovery;
    }
  });
});
