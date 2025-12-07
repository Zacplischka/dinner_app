// Socket.IO client service
// Based on: specs/001-dinner-decider-enables/tasks.md T048

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionJoinPayload,
  SessionJoinResponse,
  SelectionSubmitPayload,
  SelectionSubmitResponse,
  SessionRestartPayload,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantSubmittedEvent,
  SessionResultsEvent,
  SessionRestartedEvent,
  SessionExpiredEvent,
  ErrorEvent,
} from '@dinner-app/shared/types';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Typed socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Initialize Socket.IO client connection
 * Includes auth token if user is authenticated
 */
export function initializeSocket(): void {
  if (socket?.connected) {
    console.log('Socket already connected');
    return;
  }

  // Get auth token if available
  const session = useAuthStore.getState().session;
  const authToken = session?.access_token;

  socket = io(BACKEND_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: authToken ? { token: authToken } : undefined,
  });

  // Connection status handlers
  socket.on('connect', () => {
    const socketId = socket?.id;
    console.log('Socket connected:', socketId);
    useSessionStore.getState().setConnectionStatus(true);
    if (socketId) {
      useSessionStore.getState().setCurrentUserId(socketId);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    useSessionStore.getState().setConnectionStatus(false);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    useSessionStore.getState().setConnectionStatus(false);
  });

  // Event handlers that update Zustand store
  setupEventHandlers();
}

/**
 * Setup all Socket.IO event handlers
 */
function setupEventHandlers(): void {
  if (!socket) return;

  // participant:joined - Another participant joined the session
  // Handles both new joins AND rejoins (same displayName with new socket.id)
  socket.on('participant:joined', (event: ParticipantJoinedEvent) => {
    console.log('Participant joined:', event);
    const store = useSessionStore.getState();

    // Check if this is a rejoin (same displayName, new participantId)
    const existingIndex = store.participants.findIndex(
      (p) => p.displayName === event.displayName
    );

    if (existingIndex >= 0) {
      // Rejoin: update existing participant's socket ID
      const updatedParticipants = [...store.participants];
      updatedParticipants[existingIndex] = {
        ...updatedParticipants[existingIndex],
        participantId: event.participantId,
      };
      store.updateParticipants(updatedParticipants);
      console.log('Updated existing participant socket ID:', event.displayName);
    } else {
      // New participant: add to list
      store.addParticipant({
        participantId: event.participantId,
        displayName: event.displayName,
        sessionCode: '',
        joinedAt: Date.now(),
        hasSubmitted: false,
        isHost: false,
      });
    }
  });

  // participant:left - A participant left the session
  // Note: Per FR-025, participants are NOT removed on disconnect.
  // The session stays in waiting state until they reconnect or session expires.
  socket.on('participant:left', (event: ParticipantLeftEvent) => {
    console.log('Participant left:', event);
    // Do not remove participant - they remain in the session
  });

  // participant:submitted - A participant submitted their selections
  socket.on('participant:submitted', (event: ParticipantSubmittedEvent) => {
    console.log('Participant submitted:', event);
    // Update participant's hasSubmitted status
    const store = useSessionStore.getState();
    const updatedParticipants = store.participants.map((p) =>
      p.participantId === event.participantId ? { ...p, hasSubmitted: true } : p
    );
    store.updateParticipants(updatedParticipants);
  });

  // session:results - All participants submitted, results revealed
  socket.on('session:results', (event: SessionResultsEvent) => {
    console.log('Session results:', event);
    useSessionStore.getState().setResults({
      sessionCode: event.sessionCode,
      overlappingOptions: event.overlappingOptions,
      allSelections: event.allSelections,
      hasOverlap: event.hasOverlap,
    });
  });

  // session:restarted - Session was restarted by a participant
  socket.on('session:restarted', (event: SessionRestartedEvent) => {
    console.log('Session restarted:', event);
    useSessionStore.getState().resetSelections();
  });

  // session:expired - Session expired due to inactivity
  socket.on('session:expired', (event: SessionExpiredEvent) => {
    console.log('Session expired:', event);
    useSessionStore.getState().setSessionStatus('expired');
  });

  // error - Server-side error
  socket.on('error', (event: ErrorEvent) => {
    console.error('Socket error:', event);
    // TODO: Display error message to user (via toast/alert)
  });
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
        const store = useSessionStore.getState();

        // Check if joining a different session - reset selections from previous session
        if (store.sessionCode !== sessionCode) {
          store.resetSelections();
        }

        // Update store with session data
        store.setSessionCode(sessionCode);
        store.updateParticipants(ack.participants.map(p => ({
          ...p,
          sessionCode,
          joinedAt: Date.now(),
          hasSubmitted: false,
        })));
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
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    useSessionStore.getState().setConnectionStatus(false);
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