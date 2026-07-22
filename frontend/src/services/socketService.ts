// Socket.IO client transport - connection lifecycle and ack-based requests.
// Knows nothing about stores or toasts: UI wiring is injected via SocketConfig
// (see socketBindings.ts, which supplies the concretions). Pages import from
// socketBindings, not from here.

import { io, Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinData,
  SelectionSubmitPayload,
  SelectionLivePayload,
  SessionRestartPayload,
  SessionLeavePayload,
  OrderOpenPayload,
  OrderOpenResponse,
  OrderState,
} from '@dinder/shared/types';

/* v8 ignore next */
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Reserved socket.io lifecycle events, alongside the app's server events
type SocketEventHandlers = Partial<ServerToClientEvents> & {
  connect?: () => void;
  disconnect?: (reason: string) => void;
  connect_error?: (error: Error) => void;
};

export interface SocketConfig {
  getAuthToken?: () => string | undefined;
  onEvent?: SocketEventHandlers;
}

// Typed socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Initialize Socket.IO client connection.
 * Includes an auth token and event handlers when the config provides them.
 */
export function initializeSocket(config: SocketConfig = {}): void {
  if (socket?.connected) {
    console.log('Socket already connected');
    return;
  }

  const authToken = config.getAuthToken?.();

  socket = io(BACKEND_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: authToken ? { token: authToken } : undefined,
  });

  for (const [event, handler] of Object.entries(config.onEvent ?? {})) {
    // Handler signatures are enforced by SocketEventHandlers; socket.io's
    // overloaded `on` can't infer them from Object.entries.
    socket.on(event as never, handler as never);
  }
}

// Every command's ack is a canonical Ack<T> from the backend (#116): a
// discriminated { success: true; data } | { success: false; error: ApiError }.
// The transport resolves it as-is; the only ack the client mints itself is the
// not-connected failure below.
function emitAck<T>(event: keyof ClientToServerEvents, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ success: false, error: { code: 'UNKNOWN', message: 'Socket not connected' } });
      return;
    }
    // socket.io's typed `emit` can't infer through this generic wrapper; the
    // wire contract is enforced by each caller's declared Ack<T> return type.
    (socket.emit as (e: string, p: unknown, cb: (ack: Ack<T>) => void) => void)(
      event,
      payload,
      resolve
    );
  });
}

/**
 * Join a session
 */
export function joinSession(
  sessionCode: string,
  displayName: string,
  rejoinToken?: string
): Promise<Ack<SessionJoinData>> {
  const payload: SessionJoinPayload = { sessionCode, displayName, rejoinToken };
  return emitAck<SessionJoinData>('session:join', payload);
}

/**
 * Submit selections
 */
export function submitSelection(sessionCode: string, optionIds: string[]): Promise<Ack<null>> {
  const payload: SelectionSubmitPayload = { sessionCode, selections: optionIds };
  return emitAck<null>('selection:submit', payload);
}

/**
 * Live Selection: fire-and-forget chrome. The Selection is NOT persisted here —
 * the Match is still computed from `selection:submit`.
 */
export function sendLiveSelection(sessionCode: string, placeId: string): Promise<Ack<null>> {
  const payload: SelectionLivePayload = { sessionCode, placeId };
  return emitAck<null>('selection:live', payload);
}

/**
 * Open (or rejoin) the Group Order for the crowned Restaurant.
 */
export function openOrder(sessionCode: string, placeId: string): Promise<OrderOpenResponse> {
  const payload: OrderOpenPayload = { sessionCode, placeId };
  // ponytail: emitAck<T> resolves Ack<T>, whose failure arm is the plain ApiError;
  // OrderUnavailableError adds `reason`, so widen at this one call site. If a second
  // command ever carries an extended error, make emitAck generic over the whole ack.
  return emitAck<OrderState>('order:open', payload) as Promise<OrderOpenResponse>;
}

/**
 * Restart session
 */
export function restartSession(sessionCode: string): Promise<Ack<null>> {
  const payload: SessionRestartPayload = { sessionCode };
  return emitAck<null>('session:restart', payload);
}

/**
 * Leave session intentionally (removes participant from session)
 */
export function leaveSession(sessionCode: string): Promise<Ack<null>> {
  const payload: SessionLeavePayload = { sessionCode };
  return emitAck<null>('session:leave', payload);
}

/**
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get socket ID
 */
export function getSocketId(): string | undefined {
  return socket?.id;
}

/**
 * Wait for socket to be connected
 * Returns a promise that resolves when connected or rejects on timeout
 */
export function waitForConnection(timeoutMs = 5000, config?: SocketConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket?.connected) {
      resolve();
      return;
    }

    initializeSocket(config);

    const timeout = setTimeout(() => {
      reject(new Error('Socket connection timeout'));
    }, timeoutMs);

    socket?.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });

    socket?.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
