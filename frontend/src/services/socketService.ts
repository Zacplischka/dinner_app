// Socket.IO client transport - connection lifecycle and ack-based requests.
// Knows nothing about stores or toasts: UI wiring is injected via SocketConfig
// (see socketBindings.ts, which supplies the concretions). Pages import from
// socketBindings, not from here.

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinResponse,
  SelectionSubmitPayload,
  SelectionSubmitResponse,
  SessionRestartPayload,
  SessionLeavePayload,
  SessionLeaveResponse,
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

/**
 * Join a session
 */
export function joinSession(
  sessionCode: string,
  displayName: string
): Promise<SessionJoinResponse> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const payload: SessionJoinPayload = {
      sessionCode,
      displayName,
    };

    socket.emit('session:join', payload, (ack: SessionJoinResponse) => {
      if (ack.success && ack.participants) {
        resolve(ack);
      } else {
        reject(new Error(ack.error || 'Failed to join session'));
      }
    });
  });
}

/**
 * Submit selections
 */
export function submitSelection(
  sessionCode: string,
  optionIds: string[]
): Promise<SelectionSubmitResponse> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const payload: SelectionSubmitPayload = {
      sessionCode,
      selections: optionIds,
    };

    socket.emit('selection:submit', payload, (ack: SelectionSubmitResponse) => {
      if (ack.success) {
        resolve(ack);
      } else {
        reject(new Error(ack.error || 'Failed to submit selection'));
      }
    });
  });
}

/**
 * Restart session
 */
export function restartSession(sessionCode: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const payload: SessionRestartPayload = {
      sessionCode,
    };

    socket.emit('session:restart', payload, (ack: { success?: boolean; error?: string }) => {
      if (ack.success) {
        resolve();
      } else {
        reject(new Error(ack.error || 'Failed to restart session'));
      }
    });
  });
}

/**
 * Leave session intentionally (removes participant from session)
 */
export function leaveSession(sessionCode: string): Promise<SessionLeaveResponse> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const payload: SessionLeavePayload = {
      sessionCode,
    };

    socket.emit('session:leave', payload, (ack: SessionLeaveResponse) => {
      if (ack.success) {
        resolve(ack);
      } else {
        reject(new Error(ack.error || 'Failed to leave session'));
      }
    });
  });
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
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected || false;
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
