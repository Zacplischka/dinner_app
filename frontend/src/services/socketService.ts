// Socket.IO client transport - connection lifecycle and ack-based requests.
// Knows nothing about stores or toasts: UI wiring is injected via SocketConfig
// (see socketBindings.ts, which supplies the concretions). Pages import from
// socketBindings, not from here.

import { io, Socket } from 'socket.io-client';
import type {
  Ack,
  SessionLobbyState,
  SessionLobbyPayload,
  SessionChoicesPayload,
  SessionReadyPayload,
  SessionRemovePayload,
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
  OrderItemPayload,
  OrderState,
  OrderBuyPayload,
  OrderBuyResponse,
} from '@dinder/shared/types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Reserved socket.io lifecycle events, alongside the app's server events
type SocketEventHandlers = Partial<ServerToClientEvents> & {
  connect?: () => void;
  disconnect?: (reason: string) => void;
  connect_error?: (error: Error) => void;
};

export interface SocketConfig {
  getAuthToken?: () => string | undefined;
  canMutate?: () => boolean;
  onUncertainOutcome?: () => void;
  onEvent?: SocketEventHandlers;
}

// Typed socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let onUncertainOutcome: (() => void) | undefined;
let canMutate: (() => boolean) | undefined;

/**
 * Initialize Socket.IO client connection.
 * Includes an auth token and event handlers when the config provides them.
 */
export function initializeSocket(config: SocketConfig = {}): void {
  // Guard on existence, not on connected: a call mid-reconnect used to open a
  // second io() and orphan the one still retrying (and holding the handlers).
  // disconnectSocket() is the one way to want a fresh socket; it nulls this.
  if (socket) {
    if (import.meta.env.DEV) console.log('Socket already initialized');
    return;
  }

  onUncertainOutcome = config.onUncertainOutcome;
  canMutate = config.canMutate;

  socket = io(BACKEND_URL, {
    reconnection: true,
    // Never give up on our own: a cap of 5 stopped retrying ~15s into a
    // 30-minute Session while the UI kept saying "Reconnecting...". The
    // Session's TTL bounds the useful lifetime instead — once it expires,
    // the rejoin on connect fails and the store resets.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: config.getAuthToken
      ? (callback) => {
          const token = config.getAuthToken?.();
          callback(token ? { token } : {});
        }
      : undefined,
  });

  for (const [event, handler] of Object.entries(config.onEvent ?? {})) {
    // Handler signatures are enforced by SocketEventHandlers; socket.io's
    // overloaded `on` can't infer them from Object.entries.
    socket.on(event as never, handler as never);
  }
}

// ponytail: one round-trip budget, not a retry policy — the caller's existing
// failure path ("try again") is the retry. Raise it before adding retries here.
const ACK_TIMEOUT_MS = 10_000;

// Every command's ack is a canonical Ack<T> from the backend (#116): a
// discriminated { success: true; data } | { success: false; error: ApiError }.
// The transport resolves it as-is; the only acks the client mints itself are
// the not-connected and timed-out failures below. Without the timeout a
// command lost mid-flight never settles and its screen spins forever.
// Both messages land in a toast or an inline error verbatim, so they are
// written as sentences that tell the user what to do (#409).
function emitAck<T>(event: keyof ClientToServerEvents, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({
        success: false,
        error: {
          code: 'UNKNOWN',
          // Not "You're offline": this is also true mid-reconnect, before
          // initializeSocket() has run, and when the server is down.
          message: 'Not connected. Check your connection and try again.',
        },
      });
      return;
    }
    // A connected transport does not prove an uncertain mutation's outcome.
    // Recovery reads and deliberate Leave remain usable; never queue a retry.
    if (
      canMutate &&
      !canMutate() &&
      !['session:join', 'session:leave', 'order:open'].includes(event)
    ) {
      resolve({
        success: false,
        error: {
          code: 'UNKNOWN',
          message: 'Your session is still being checked. Try again once it reconnects.',
        },
      });
      return;
    }
    // socket.io's typed `emit` can't infer through this generic wrapper; the
    // wire contract is enforced by each caller's declared Ack<T> return type.
    (
      socket.timeout(ACK_TIMEOUT_MS).emit as (
        e: string,
        p: unknown,
        cb: (err: Error | null, ack: Ack<T>) => void
      ) => void
    )(event, payload, (err, ack) => {
      if (err && !['session:join', 'session:leave', 'selection:live'].includes(event)) {
        onUncertainOutcome?.();
      }
      resolve(
        err
          ? {
              success: false,
              error: {
                code: 'UNKNOWN',
                message:
                  "The server didn't respond. Reconnecting to check what happened before you try again.",
              },
            }
          : ack
      );
    });
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
export function submitSelection(
  sessionCode: string,
  optionIds: string[],
  round?: number
): Promise<Ack<null>> {
  const payload: SelectionSubmitPayload = { sessionCode, selections: optionIds, round };
  return emitAck<null>('selection:submit', payload);
}

/**
 * Live Selection: fire-and-forget chrome. The Selection is NOT persisted here —
 * the Match is still computed from `selection:submit`. `retract` takes one back
 * (an Undo), so the other phones stop counting it (#410).
 */
export function sendLiveSelection(
  sessionCode: string,
  placeId: string,
  retract?: boolean,
  round?: number
): Promise<Ack<null>> {
  const payload: SelectionLivePayload = { sessionCode, placeId, retract, round };
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
 * Add (delta 1) or remove (delta -1) one Order Line. The server resolves the
 * name, price and who from the caller — the payload carries only what to change.
 */
export function addOrderItem(
  sessionCode: string,
  index: number,
  delta: 1 | -1
): Promise<Ack<null>> {
  const payload: OrderItemPayload = { sessionCode, index, delta };
  return emitAck<null>('order:item', payload);
}

/**
 * "I'll order": claim the Buyer and lock the Group Order. First tap wins.
 * `feeCents`, when present, is the Buyer's debounced delivery-fee edit riding
 * the same event (#179).
 */
export function claimBuyer(sessionCode: string, feeCents?: number): Promise<OrderBuyResponse> {
  // Socket.IO's serializer drops undefined-valued keys, so an absent feeCents
  // arrives at the server as if the key were never sent - no ternary needed.
  const payload: OrderBuyPayload = { sessionCode, feeCents };
  return emitAck<null>('order:buy', payload);
}

/**
 * Restart session
 */
export function restartSession(sessionCode: string): Promise<Ack<null>> {
  const payload: SessionRestartPayload = { sessionCode };
  return emitAck<null>('session:restart', payload);
}

export function updateSessionChoices(
  payload: SessionChoicesPayload
): Promise<Ack<SessionLobbyState>> {
  return emitAck<SessionLobbyState>('session:choices', payload);
}
export function setSessionReady(payload: SessionReadyPayload): Promise<Ack<SessionLobbyState>> {
  return emitAck<SessionLobbyState>('session:ready', payload);
}
export function startSession(payload: SessionLobbyPayload): Promise<Ack<SessionLobbyState>> {
  return emitAck<SessionLobbyState>('session:start', payload);
}
export function removeSessionParticipant(
  payload: SessionRemovePayload
): Promise<Ack<SessionLobbyState>> {
  return emitAck<SessionLobbyState>('session:remove', payload);
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
