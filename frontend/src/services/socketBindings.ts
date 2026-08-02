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
  ParticipantSelectedEvent,
  SessionResultsEvent,
  SessionRestartedEvent,
  SessionExpiredEvent,
  ErrorEvent,
  OrderStateEvent,
} from '@dinder/shared/types';
import * as socketService from './socketService';
import type { SocketConfig } from './socketService';
import { resolvePhotoUrls } from './apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
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
          if (!ack.success) {
            localStorage.removeItem(
              `dinder:rejoin:${store.sessionCode}:${previousParticipant.displayName}`
            );
            store.resetSession();
            toast.error(`Could not rejoin session: ${ack.error.message}`);
          }
          // orderStore is deliberately non-persisted: on a hard reload (ordinary
          // iOS behaviour after backgrounding) it is empty and cannot guard this
          // re-fire, so the guard is the route instead. Un-guarded, the order
          // page's own on-mount order:open loses the race against this
          // un-awaited rejoin and acks NOT_IN_SESSION.
          if (ack.success && window.location.pathname.endsWith('/order')) {
            const { sessionCode, orderPlaceId } = useSessionStore.getState();
            if (sessionCode && orderPlaceId) {
              // The backend acks order:open directly — it does not also
              // broadcast order:state — so a successful re-open must feed
              // orderStore here itself, exactly like GroupOrderPage's own
              // on-mount open. Otherwise a re-open that wins the race after
              // the page already rendered a failure screen never clears it.
              void socketService.openOrder(sessionCode, orderPlaceId).then((openAck) => {
                if (openAck.success) {
                  useOrderStore.getState().setOrder(openAck.data, openAck.data.menu);
                }
              });
            }
          }
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

      // #283: drop events for a Session this client is no longer in — a stale
      // delivery must never grow the roster. An event without a sessionCode
      // (older backend, ADR 0007) passes through.
      if (event.sessionCode && event.sessionCode !== store.sessionCode) return;

      const existingIndex = event.isRejoin
        ? store.participants.findIndex((p) => p.displayName === event.displayName)
        : -1;

      if (existingIndex >= 0) {
        // Rejoin: update existing participant's socket ID
        const updatedParticipants = [...store.participants];
        updatedParticipants[existingIndex] = {
          ...updatedParticipants[existingIndex],
          participantId: event.participantId,
          isOnline: true,
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

    // ponytail: client-only presence, no server truth. Two holes: (i) a Participant who
    // dropped before you joined shows as Live to you; (ii) your OWN reconnect resets every
    // badge to Live, because the connect handler re-joins and joinSession replaces
    // the list from SessionJoinData.participants, which is { participantId, displayName,
    // isHost } only. Badges are honest again from the next participant:disconnected.
    // Upgrade that fixes both at once: hset an offline flag on participant:{pid} in
    // disconnectHandler and widen SessionJoinData.participants with isOnline?: boolean
    // (additive, ADR 0007).
    // participant:disconnected - A participant lost connection (network issue, browser close, etc.)
    // This is INFORMATIONAL only - the participant is NOT removed from the session.
    // They can reconnect and will be re-registered with a new socket.id.
    'participant:disconnected': (event: ParticipantDisconnectedEvent) => {
      console.log('Participant disconnected:', event);
      const store = useSessionStore.getState();

      // Find participant to get their name
      const participant = store.participants.find((p) => p.participantId === event.participantId);
      const displayName = participant?.displayName || event.displayName;

      // Do NOT remove the participant - they may reconnect
      // Just show an informational toast
      toast.warning(`${displayName} lost connection`, { duration: 3000 });

      store.updateParticipants(
        store.participants.map((p) =>
          p.participantId === event.participantId ? { ...p, isOnline: false } : p
        )
      );
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

    // participant:selected - Another Participant made a Live Selection mid-deck.
    // Ephemeral chrome: never written to Redis, never affects the Match. The
    // buffer is keyed by displayName (ADR 0009) so a rejoin under a new
    // socket.id collapses onto the one entry that is already there.
    'participant:selected': (event: ParticipantSelectedEvent) => {
      useSessionStore.getState().recordLiveSelection(event.placeId, event.displayName);
    },

    // session:results - All participants submitted, results revealed
    'session:results': (event: SessionResultsEvent) => {
      console.log('Session results:', event);
      useSessionStore.getState().setResults({
        sessionCode: event.sessionCode,
        overlappingOptions: resolvePhotoUrls(event.overlappingOptions),
        allSelections: event.allSelections,
        restaurantNames: event.restaurantNames,
        hasOverlap: event.hasOverlap,
        topPick: event.topPick && {
          ...event.topPick,
          restaurant: resolvePhotoUrls([event.topPick.restaurant])[0],
        },
        shoppingListId: event.shoppingListId,
      });
    },

    // order:state - Group Order state sans Pinned Menu, broadcast on every
    // Order Line change and the Buyer claim (order:open acks directly and
    // broadcasts nothing).
    // io.in broadcasts to the sender too, so the toast is gated on the change
    // being a removal by someone other than me; an addition toasts on no phone.
    'order:state': (event: OrderStateEvent) => {
      const { setOrder, setChange } = useOrderStore.getState();
      setOrder(event.order);
      setChange(event.change);
      const { participants, currentUserId } = useSessionStore.getState();
      const me = participants.find((p) => p.participantId === currentUserId)?.displayName;
      if (event.change && event.change.delta === -1 && event.change.by !== me) {
        toast.info(`${event.change.by} removed ${event.change.name}`);
      }
    },

    // session:restarted - a Restart, or the lobby's start riding the same
    // event; the server's message says which (#289), so log that, not a
    // hardcoded "Session restarted" that makes real Restarts unspottable.
    'session:restarted': (event: SessionRestartedEvent) => {
      console.log(event.message, event);
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

  // Adopt the ack's state OUTSIDE the different-session guard: the /join page
  // pre-stores this very sessionCode before the ack lands, so a guard-bound
  // adoption would never run for the one path #284 exists for — leaving a late
  // joiner's status pinned at 'waiting' and the lobby's auto-forward dead.
  // An ack without state (older backend, ADR 0007) touches nothing.
  const { state } = ack.data;
  if (state === 'waiting' || state === 'selecting' || state === 'complete' || state === 'expired') {
    store.setSessionStatus(state);
  }

  // Update store with session data
  store.setSessionCode(sessionCode);
  store.setBranch(ack.data.branch);
  store.updateParticipants(
    ack.data.participants.map((p) => ({
      ...p,
      sessionCode,
      joinedAt: Date.now(),
      // The server says who already submitted (#284); absent on older backends.
      hasSubmitted: p.hasSubmitted ?? false,
    }))
  );

  return ack;
}

/**
 * Commands that touch no store and raise no toast. They are re-exported rather
 * than wrapped so pages still see one import surface, but the seam does not
 * pretend to add behaviour it doesn't have.
 *
 * What makes them store-free: each one's effect reaches the UI as a server
 * broadcast, not a local write. addOrderItem and claimBuyer are the clearest
 * case — the order:state broadcast includes the sender, so it is what updates
 * every basket, this phone's too. claimBuyer doubles as the Buyer's debounced
 * delivery-fee edit (#179): `feeCents` present with an existing lock is a fee
 * update, not a re-claim, and the server tells the two apart.
 */
export {
  submitSelection,
  sendLiveSelection,
  restartSession,
  openOrder,
  addOrderItem,
  claimBuyer,
} from './socketService';

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
