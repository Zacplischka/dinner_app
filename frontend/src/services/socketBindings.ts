// socketBindings - the UI side of the socket seam. Owns every store mutation
// and toast triggered by socket traffic, and supplies the auth token to the
// transport. Pages import from here; socketService stays UI-free.

import type {
  Ack,
  SessionJoinData,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantDisconnectedEvent,
  ParticipantSubmittedEvent,
  SessionResultsEvent,
  SessionRestartedEvent,
  SessionExpiredEvent,
  ErrorEvent,
} from '@dinder/shared/types';
import * as socketService from './socketService';
import type { SocketConfig } from './socketService';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import { toast } from '../hooks/useToast';

// Track if we had a previous connection (for showing "Reconnected" toast)
let hadPreviousConnection = false;

const socketConfig: SocketConfig = {
  getAuthToken: () => useAuthStore.getState().session?.access_token,

  onEvent: {
    connect: () => {
      const socketId = socketService.getSocketId();
      const store = useSessionStore.getState();
      const previousParticipant = store.participants.find(
        (participant) =>
          participant.participantId === store.currentUserId &&
          participant.sessionCode === store.sessionCode
      );
      console.log('Socket connected:', socketId);
      store.setConnectionStatus(true);
      if (socketId) {
        store.setCurrentUserId(socketId);
      }

      if (store.sessionCode && previousParticipant) {
        void joinSession(store.sessionCode, previousParticipant.displayName).then((ack) => {
          if (!ack.success) toast.error(`Could not rejoin session: ${ack.error.message}`);
        });
      }

      // Show reconnected toast (only if we had a previous connection)
      if (hadPreviousConnection) {
        toast.success('Reconnected to server');
      }
      hadPreviousConnection = true;
    },

    disconnect: (reason: string) => {
      console.log('Socket disconnected:', reason);
      useSessionStore.getState().setConnectionStatus(false);

      // Only show toast for unexpected disconnects, not intentional ones
      if (reason !== 'io client disconnect') {
        toast.warning('Connection lost. Reconnecting...', { duration: 4000 });
      }
    },

    connect_error: (error: Error) => {
      console.error('Socket connection error:', error);
      useSessionStore.getState().setConnectionStatus(false);
    },

    // participant:joined - Another participant joined the session
    // The server decides whether this is a rejoin (isRejoin); the client just
    // applies it. Fall back to add if the rejoiner isn't in our local list.
    'participant:joined': (event: ParticipantJoinedEvent) => {
      console.log('Participant joined:', event);
      const store = useSessionStore.getState();

      const existingIndex = event.isRejoin
        ? store.participants.findIndex((p) => p.displayName === event.displayName)
        : -1;

      if (existingIndex >= 0) {
        // Rejoin: update existing participant's socket ID
        const updatedParticipants = [...store.participants];
        updatedParticipants[existingIndex] = {
          ...updatedParticipants[existingIndex],
          participantId: event.participantId,
        };
        store.updateParticipants(updatedParticipants);
        console.log('Updated existing participant socket ID:', event.displayName);

        // Show reconnected toast for rejoin
        toast.info(`${event.displayName} reconnected`);
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

        // Show joined toast for new participant
        toast.info(`${event.displayName} joined the session`);
      }
    },

    // participant:left - A participant INTENTIONALLY left the session (session:leave)
    // This removes the participant from the session permanently.
    'participant:left': (event: ParticipantLeftEvent) => {
      console.log('Participant left:', event);
      const store = useSessionStore.getState();

      // Find participant name before removing
      const participant = store.participants.find((p) => p.participantId === event.participantId);
      const displayName = participant?.displayName || 'Someone';

      store.removeParticipant(event.participantId);

      // Show left toast
      toast.info(`${displayName} left the session`);
    },

    // participant:disconnected - A participant lost connection (network issue, browser close, etc.)
    // This is INFORMATIONAL only - the participant is NOT removed from the session (FR-025).
    // They can reconnect and will be re-registered with a new socket.id.
    'participant:disconnected': (event: ParticipantDisconnectedEvent) => {
      console.log('Participant disconnected:', event);
      const store = useSessionStore.getState();

      // Find participant to get their name
      const participant = store.participants.find((p) => p.participantId === event.participantId);
      const displayName = participant?.displayName || event.displayName;

      // Do NOT remove the participant - they may reconnect (FR-025)
      // Just show an informational toast
      toast.warning(`${displayName} lost connection`, { duration: 3000 });
    },

    // participant:submitted - A participant submitted their selections
    'participant:submitted': (event: ParticipantSubmittedEvent) => {
      console.log('Participant submitted:', event);
      // Update participant's hasSubmitted status
      const store = useSessionStore.getState();
      const updatedParticipants = store.participants.map((p) =>
        p.participantId === event.participantId ? { ...p, hasSubmitted: true } : p
      );
      store.updateParticipants(updatedParticipants);
    },

    // session:results - All participants submitted, results revealed
    'session:results': (event: SessionResultsEvent) => {
      console.log('Session results:', event);
      useSessionStore.getState().setResults({
        sessionCode: event.sessionCode,
        overlappingOptions: event.overlappingOptions,
        allSelections: event.allSelections,
        restaurantNames: event.restaurantNames,
        hasOverlap: event.hasOverlap,
      });
    },

    // session:restarted - Session was restarted by a participant
    'session:restarted': (event: SessionRestartedEvent) => {
      console.log('Session restarted:', event);
      useSessionStore.getState().resetSelections();
      // resetSelections() also flips sessionStatus, but the lobby's
      // auto-navigate keys off this transition — keep it explicit here.
      useSessionStore.getState().setSessionStatus('selecting');
    },

    // session:expired - Session expired due to inactivity
    'session:expired': (event: SessionExpiredEvent) => {
      console.log('Session expired:', event);
      useSessionStore.getState().setSessionStatus('expired');
    },

    // error - Server-side error
    error: (event: ErrorEvent) => {
      console.error('Socket error:', event);
      toast.error(event.message || 'An error occurred');
    },
  },
};

/**
 * Initialize the socket with the app's UI wiring.
 */
export function initializeSocket(): void {
  socketService.initializeSocket(socketConfig);
}

/**
 * Wait for socket to be connected, initializing it with UI wiring if needed.
 */
export function waitForConnection(timeoutMs?: number): Promise<void> {
  return socketService.waitForConnection(timeoutMs, socketConfig);
}

/**
 * Join a session and, on success, map the ack DTO into local Participant state.
 * Returns the canonical Ack<T> so callers branch on one success-or-failure shape.
 */
export async function joinSession(
  sessionCode: string,
  displayName: string
): Promise<Ack<SessionJoinData>> {
  const tokenKey = `dinder:rejoin:${sessionCode}:${displayName}`;
  const ack = await socketService.joinSession(
    sessionCode,
    displayName,
    localStorage.getItem(tokenKey) ?? undefined
  );
  if (!ack.success) return ack;

  localStorage.setItem(tokenKey, ack.data.rejoinToken);

  const store = useSessionStore.getState();

  // Check if joining a different session - reset selections from previous session
  if (store.sessionCode !== sessionCode) {
    store.resetSelections();
    store.setSessionStatus('waiting');
  }

  // Update store with session data
  store.setSessionCode(sessionCode);
  store.updateParticipants(
    ack.data.participants.map((p) => ({
      ...p,
      sessionCode,
      joinedAt: Date.now(),
      hasSubmitted: false,
    }))
  );

  return ack;
}

/**
 * Submit selections
 */
export function submitSelection(sessionCode: string, optionIds: string[]): Promise<Ack<null>> {
  return socketService.submitSelection(sessionCode, optionIds);
}

/**
 * Restart session
 */
export function restartSession(sessionCode: string): Promise<Ack<null>> {
  return socketService.restartSession(sessionCode);
}

/**
 * Leave session intentionally and clear local session state. The store is reset
 * regardless of ack outcome — every caller navigates away either way.
 */
export async function leaveSession(sessionCode: string): Promise<Ack<null>> {
  const ack = await socketService.leaveSession(sessionCode);
  useSessionStore.getState().resetSession();
  return ack;
}

/**
 * Disconnect socket and mark the session store disconnected.
 */
export function disconnectSocket(): void {
  socketService.disconnectSocket();
  useSessionStore.getState().setConnectionStatus(false);
}
