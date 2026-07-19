// Socket.IO client transport - connection lifecycle and ack-based requests.
// Knows nothing about stores or toasts: UI wiring is injected via SocketConfig
// (see socketBindings.ts, which supplies the concretions). Pages import from
// socketBindings, not from here.

import { io, Socket } from 'socket.io-client';
import { isApiError } from '@dinder/shared/types';
import type {
  Ack,
  ApiError,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinData,
  SelectionSubmitPayload,
  SessionRestartPayload,
  SessionLeavePayload,
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

// The ONE ack normalization boundary (#115). Every command's raw ack — legacy
// (flattened success + `error` string), bridge (`data` + `error` string +
// `apiError`), or canonical (`data` + ApiError `error`) — collapses into a
// single Ack<T> here. Failure prefers the canonical public error (`apiError`
// bridge key, then an ApiError-typed `error`), falling back to the legacy
// human-readable string. Stores/components downstream only ever see Ack<T>.
type RawAck = {
  success?: boolean;
  data?: unknown;
  error?: unknown;
  apiError?: unknown;
};

function toApiError(raw: RawAck, fallbackMessage: string): ApiError {
  if (isApiError(raw.apiError)) return raw.apiError; // bridge
  if (isApiError(raw.error)) return raw.error; // canonical
  const message = typeof raw.error === 'string' && raw.error ? raw.error : fallbackMessage;
  return { code: 'UNKNOWN', message }; // legacy string (or nothing)
}

function normalizeAck<T>(
  raw: RawAck,
  fallbackMessage: string,
  successData: (raw: RawAck) => T
): Ack<T> {
  if (raw?.success) {
    return { success: true, data: successData(raw) };
  }
  return { success: false, error: toApiError(raw ?? {}, fallbackMessage) };
}

function emitAck<T>(
  event: keyof ClientToServerEvents,
  payload: unknown,
  fallbackMessage: string,
  successData: (raw: RawAck) => T
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ success: false, error: { code: 'UNKNOWN', message: 'Socket not connected' } });
      return;
    }
    // socket.io's typed `emit` can't infer through this generic wrapper; the
    // wire contract is enforced by each caller's declared Ack<T> return type.
    (socket.emit as (e: string, p: unknown, cb: (raw: RawAck) => void) => void)(
      event,
      payload,
      (raw) => resolve(normalizeAck(raw, fallbackMessage, successData))
    );
  });
}

/**
 * Join a session
 */
export function joinSession(
  sessionCode: string,
  displayName: string
): Promise<Ack<SessionJoinData>> {
  const payload: SessionJoinPayload = { sessionCode, displayName };
  return emitAck(
    'session:join',
    payload,
    'Failed to join session',
    (raw) =>
      // Canonical/bridge carry `data`; legacy only the flattened fields.
      (raw.data as SessionJoinData | undefined) ?? {
        participantId: (raw as { participantId?: string }).participantId ?? '',
        sessionCode: (raw as { sessionCode?: string }).sessionCode ?? sessionCode,
        displayName: (raw as { displayName?: string }).displayName ?? displayName,
        participantCount: (raw as { participantCount?: number }).participantCount ?? 0,
        participants:
          (raw as { participants?: SessionJoinData['participants'] }).participants ?? [],
      }
  );
}

/**
 * Submit selections
 */
export function submitSelection(sessionCode: string, optionIds: string[]): Promise<Ack<null>> {
  const payload: SelectionSubmitPayload = { sessionCode, selections: optionIds };
  return emitAck('selection:submit', payload, 'Failed to submit selection', () => null);
}

/**
 * Restart session
 */
export function restartSession(sessionCode: string): Promise<Ack<null>> {
  const payload: SessionRestartPayload = { sessionCode };
  return emitAck('session:restart', payload, 'Failed to restart session', () => null);
}

/**
 * Leave session intentionally (removes participant from session)
 */
export function leaveSession(sessionCode: string): Promise<Ack<null>> {
  const payload: SessionLeavePayload = { sessionCode };
  return emitAck('session:leave', payload, 'Failed to leave session', () => null);
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
