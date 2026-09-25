// socketBindings - the UI side of the socket seam. Owns every store mutation
// and toast triggered by socket traffic, and supplies the auth token to the
// transport. Pages import from here; socketService stays UI-free.

import type {
  Ack,
  SessionLobbyState,
  SessionJoinData,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantDisconnectedEvent,
  ParticipantSubmittedEvent,
  ParticipantSelectedEvent,
  SessionResultsEvent,
  SessionRestartedEvent,
  SessionExpiredEvent,
  OrderStateEvent,
} from '@dinder/shared/types';
import * as socketService from './socketService';
import {
  sessionIntent,
  intendedParticipant,
  beginSessionIntent,
  isSessionIntentCurrent,
} from './sessionIntent';
import type { SocketConfig } from './socketService';
import { resolvePhotoUrls } from './apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { toast } from '../hooks/useToast';
import { getRejoinToken, saveRejoinToken, clearRejoinToken } from './rejoinToken';

// Socket payloads carry display names; keep the chatter out of production
// consoles. console.error stays unconditional.
const log = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

// Track if we had a previous connection (for showing "Reconnected" toast)
let hadPreviousConnection = false;
let recovery: Promise<void> | undefined;
let recoveryIntent = -1;
// A transport drop invalidates recovery reads, not the person's Join/Create intent.
let recoveryGeneration = 0;
let admissionQueue = Promise.resolve();

const superseded = (): Ack<never> => ({
  success: false,
  error: { code: 'UNKNOWN', message: 'Session action superseded.' },
});
function queueAdmission<T>(action: () => Promise<T>): Promise<T> {
  const result = admissionQueue.then(action);
  admissionQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// A Disconnect is not a Leave: the server holds the Participant's place for
// two minutes of connection-state recovery, and most drops (a locked phone, a
// lift) are back well inside that. So "lost connection" waits a grace period
// and a rejoin inside it cancels the toast. Keyed by displayName because the
// rejoin arrives under a new participantId.
// ponytail: 5s, not the full two minutes — a real drop should still reach the
// room quickly. Raise it if brief blips still toast.
const DISCONNECT_TOAST_GRACE_MS = 5_000;
const pendingDisconnectToasts = new Map<string, ReturnType<typeof setTimeout>>();

// Returns whether a toast was still pending — i.e. the room never heard.
function cancelDisconnectToast(displayName: string): boolean {
  const timer = pendingDisconnectToasts.get(displayName);
  clearTimeout(timer);
  return pendingDisconnectToasts.delete(displayName);
}

function applyResults(event: SessionResultsEvent): void {
  useSessionStore.getState().setResults({
    ...event,
    overlappingOptions: resolvePhotoUrls(event.overlappingOptions),
    topPick: event.topPick && {
      ...event.topPick,
      restaurant: resolvePhotoUrls([event.topPick.restaurant])[0],
    },
  });
}

// #513: a Live Selection is never stored, so a phone that was not in the room
// holds none of the likes made meanwhile, and could never complete a Full House
// on them. Re-send this phone's current likes (an Undo has already taken a
// retracted one out of `selections`) when someone joins, and when this phone
// gets its own place back — it never hears participant:joined for itself.
// Phones that already hold them drop duplicates, keyed by display name. Not
// while disconnected: canMutate would refuse every send.
// ponytail: one selection:live per like, at most MAX_DECK_SIZE (50) with no
// server rate limit to trip. Batch into one event if Decks outgrow that.
function replayLiveSelections(): void {
  const { isConnected, sessionStatus, sessionCode, selections } = useSessionStore.getState();
  if (!isConnected || sessionStatus !== 'selecting' || !sessionCode) return;
  for (const placeId of selections) void sendLiveSelection(sessionCode, placeId);
}
// Every join and every recovery path (connect, app resume, RequireSession)
// ends by marking the store connected, so the rising edge is "back in the room".
useSessionStore.subscribe((state, previous) => {
  if (state.isConnected && !previous.isConnected) replayLiveSelections();
});

const socketConfig: SocketConfig = {
  mutationBlocked: (event) => {
    if (!useSessionStore.getState().isConnected)
      return 'Your session is still being checked. Try again once it reconnects.';
    // A basket change also needs a basket the server confirmed: a failed restore
    // drops it (#511), and the tap whose ack was lost may already have landed.
    if (event.startsWith('order:') && !useOrderStore.getState().order)
      return 'Your basket is reloading. Try again in a moment.';
    return undefined;
  },
  onUncertainOutcome: () => {
    void reconcileSession();
  },

  onEvent: {
    connect: () => {
      const socketId = socketService.getSocketId();
      const store = useSessionStore.getState();
      const previousParticipant = store.participants.find(
        (participant) =>
          participant.participantId === store.currentUserId &&
          participant.sessionCode === store.sessionCode
      );
      log('Socket connected:', socketId);
      if (store.sessionCode && previousParticipant) {
        void reconcileSession();
      } else {
        store.setConnectionStatus(true);
        if (socketId) store.setCurrentUserId(socketId);
      }

      // Show reconnected toast (only if we had a previous connection)
      if (hadPreviousConnection && !previousParticipant) {
        toast.success('Reconnected to server');
      }
      hadPreviousConnection = true;
    },

    disconnect: (reason: string) => {
      log('Socket disconnected:', reason);
      recoveryGeneration++;
      recovery = undefined;
      useSessionStore.getState().setConnectionStatus(false);

      // Only show toast for unexpected disconnects, not intentional ones
      if (reason !== 'io client disconnect') {
        toast.warning('Connection lost. Reconnecting…', { duration: 4000 });
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
      log('Participant joined:', event);
      const store = useSessionStore.getState();

      // #283: drop events for a Session this client is no longer in — a stale
      // delivery must never grow the roster. An event without a sessionCode
      // (older backend, ADR 0007) passes through.
      if (event.sessionCode && event.sessionCode !== store.sessionCode) return;

      const existingIndex = event.isRejoin
        ? store.participants.findIndex((p) => p.displayName === event.displayName)
        : -1;
      // Back inside the grace window: the room never heard about the drop, so
      // it hears nothing about the recovery either.
      const dropUnannounced = cancelDisconnectToast(event.displayName);

      if (existingIndex >= 0) {
        const updatedParticipants = [...store.participants];
        updatedParticipants[existingIndex] = {
          ...updatedParticipants[existingIndex],
          participantId: event.participantId,
          isOnline: true,
          // Server truth (#405): a rejoin can re-grant the Host role. Absent
          // from an older backend (ADR 0007) — keep what the roster has.
          isHost: event.isHost ?? updatedParticipants[existingIndex].isHost,
          avatarUrl:
            event.avatarUrl === undefined
              ? updatedParticipants[existingIndex].avatarUrl
              : event.avatarUrl,
        };
        store.updateParticipants(updatedParticipants);
        log('Updated existing participant socket ID:', event.displayName);

        if (!dropUnannounced) toast.info(`${event.displayName} reconnected`);
      } else {
        store.addParticipant({
          participantId: event.participantId,
          displayName: event.displayName,
          sessionCode: '',
          hasSubmitted: false,
          // A Host who left and came back joins as a new entry here, and the
          // start guard reads this flag — assuming false leaves every roster
          // hostless and hands everyone a button the server refuses (#405).
          isHost: event.isHost ?? false,
          avatarUrl: event.avatarUrl,
        });

        toast.info(`${event.displayName} joined the session`);
      }

      replayLiveSelections();
    },

    // participant:left - A participant INTENTIONALLY left the session (session:leave)
    // This removes the participant from the session permanently.
    'participant:left': (event: ParticipantLeftEvent) => {
      log('Participant left:', event);
      const store = useSessionStore.getState();

      const participant = store.participants.find((p) => p.participantId === event.participantId);
      const displayName = participant?.displayName || 'Someone';

      store.removeParticipant(event.participantId);

      toast.info(`${displayName} left the session`);
    },

    // participant:disconnected - A participant lost connection (network issue, browser close, etc.)
    // This is INFORMATIONAL only - the participant is NOT removed from the session.
    // They can reconnect and will be re-registered with a new socket.id.
    'participant:disconnected': (event: ParticipantDisconnectedEvent) => {
      log('Participant disconnected:', event);
      const store = useSessionStore.getState();

      const participant = store.participants.find((p) => p.participantId === event.participantId);
      const displayName = participant?.displayName || event.displayName;

      // Do NOT remove the participant - they may reconnect
      // Just show an informational toast, once the grace period says it's real
      cancelDisconnectToast(displayName);
      pendingDisconnectToasts.set(
        displayName,
        setTimeout(() => {
          pendingDisconnectToasts.delete(displayName);
          toast.warning(`${displayName} lost connection`, { duration: 3000 });
        }, DISCONNECT_TOAST_GRACE_MS)
      );

      store.updateParticipants(
        store.participants.map((p) =>
          p.participantId === event.participantId ? { ...p, isOnline: false } : p
        )
      );
    },

    // participant:submitted - A participant submitted their selections
    'participant:submitted': (event: ParticipantSubmittedEvent) => {
      log('Participant submitted:', event);
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
    // An Undo arrives as the same event with retract set (#410) — drop the
    // sender's name instead of adding it, so the count corrects itself.
    'participant:selected': (event: ParticipantSelectedEvent) => {
      const store = useSessionStore.getState();
      if (event.retract) store.retractLiveSelection(event.placeId, event.displayName);
      else store.recordLiveSelection(event.placeId, event.displayName);
    },

    // session:results - All participants submitted, results revealed
    'session:results': applyResults,

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

    'session:lobby': (event: SessionLobbyState) => {
      useSessionStore.getState().setLobby(event);
    },

    // session:restarted - a Restart, or the lobby's start riding the same
    // event; the server's message says which (#289), so log that, not a
    // hardcoded "Session restarted" that makes real Restarts unspottable.
    'session:restarted': (event: SessionRestartedEvent) => {
      log(event.message, event);
      useSessionStore.getState().resetSelections();
      // resetSelections() also flips sessionStatus, but the lobby's
      // auto-navigate keys off this transition — keep it explicit here.
      useSessionStore.getState().setSessionStatus(event.state ?? 'selecting');
      if (event.lobby) useSessionStore.getState().setLobby(event.lobby);
    },

    // session:expired - Session expired due to inactivity. The status drives
    // the header's expired banner on every Session screen; the toast is the
    // one interruption, fired here because the event arrives exactly once.
    'session:expired': (event: SessionExpiredEvent) => {
      log('Session expired:', event);
      useSessionStore.getState().setSessionStatus('expired');
      toast.error('This session has expired');
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
  displayName: string,
  resumeOnly = false,
  generation = resumeOnly ? sessionIntent : beginSessionIntent(sessionCode, displayName)
): Promise<Ack<SessionJoinData>> {
  const transportGeneration = recoveryGeneration;
  return queueAdmission(() =>
    admitSession(sessionCode, displayName, resumeOnly, generation, transportGeneration)
  );
}

async function admitSession(
  sessionCode: string,
  displayName: string,
  resumeOnly: boolean,
  generation: number,
  transportGeneration: number
): Promise<Ack<SessionJoinData>> {
  if (!isSessionIntentCurrent(generation)) return superseded();
  const previousParticipantId = useSessionStore.getState().currentUserId;
  const stillResuming = () => {
    const current = useSessionStore.getState();
    return (
      transportGeneration === recoveryGeneration &&
      current.sessionCode === sessionCode &&
      current.currentUserId === previousParticipantId
    );
  };
  const token = await getRejoinToken(sessionCode, displayName);
  if (!isSessionIntentCurrent(generation) || (resumeOnly && !stillResuming()))
    return {
      success: false,
      error: { code: 'UNKNOWN', message: 'Your session changed before recovery completed.' },
    };
  if (resumeOnly && !token)
    return {
      success: false,
      error: {
        code: 'NOT_IN_SESSION',
        message: 'Your saved place is no longer available. Join again to take a new place.',
      },
    };
  const ack = await socketService.joinSession({
    sessionCode,
    displayName,
    rejoinToken: token ?? undefined,
    accessToken: useAuthStore.getState().session?.access_token,
  });
  if (!isSessionIntentCurrent(generation) || (resumeOnly && !stillResuming())) {
    // Finish departure before a queued newer join, even if the older ack timed out.
    if (!resumeOnly) {
      if (ack.success && intendedParticipant === `${sessionCode}:${displayName}`) {
        await saveRejoinToken(sessionCode, displayName, ack.data.rejoinToken);
      } else {
        await socketService.leaveSession({ sessionCode });
        await clearRejoinToken(sessionCode, displayName);
      }
    }
    return superseded();
  }
  if (!ack.success) {
    if (
      ['SESSION_NOT_FOUND', 'NOT_IN_SESSION', 'SESSION_ALREADY_STARTED'].includes(ack.error.code)
    ) {
      await clearRejoinToken(sessionCode, displayName);
    }
    return ack;
  }

  try {
    await saveRejoinToken(sessionCode, displayName, ack.data.rejoinToken);
  } catch {
    if (isSessionIntentCurrent(generation))
      toast.warning(
        'Your session is open, but this phone could not save it. Keep YupCrew open to keep your place.'
      );
  }

  if (!isSessionIntentCurrent(generation) || (resumeOnly && !stillResuming())) {
    // Finish departure before a queued newer join, even if the older ack timed out.
    if (!resumeOnly) {
      if (ack.success && intendedParticipant === `${sessionCode}:${displayName}`) {
        await saveRejoinToken(sessionCode, displayName, ack.data.rejoinToken);
      } else {
        await socketService.leaveSession({ sessionCode });
        await clearRejoinToken(sessionCode, displayName);
      }
    }
    return superseded();
  }

  const store = useSessionStore.getState();

  // Check if joining a different session - reset selections from previous session
  if (store.sessionCode !== sessionCode) {
    store.resetSelections();
    store.setSessionStatus('waiting');
  }

  // Legacy acks carry state alone. Collaborative acks use their revisioned
  // snapshot, so an older ack cannot roll back a newer broadcast.
  const { state } = ack.data;
  if (
    !ack.data.lobby &&
    (state === 'waiting' || state === 'selecting' || state === 'complete' || state === 'expired')
  ) {
    store.setSessionStatus(state);
  }

  // Update store with session data. The roster is server truth for presence
  // too: `...p` carries isOnline, so a Participant who dropped before this join
  // — or before my own rejoin replaced the list — starts offline, not live.
  // Absent on an older backend, which reads as live (ADR 0007).
  store.setSessionCode(sessionCode);
  store.setCurrentUserId(ack.data.participantId);
  if (store.lobby?.sessionCode !== sessionCode) store.setLobby(undefined);
  // A successful ack proves the socket is up. Set it here, where all three join
  // paths meet: the `connect` handler only fires on a socket that wasn't already
  // connected, so a second join in the same tab — leaveSession resets the store
  // without disconnecting — would otherwise sit on a false "Disconnected" banner.
  // Resume stays inert until reconcileSession has also refreshed the basket.
  if (!resumeOnly) store.setConnectionStatus(transportGeneration === recoveryGeneration);
  store.setBranch(ack.data.branch);
  if (!ack.data.lobby)
    store.updateParticipants(
      ack.data.participants.map((p) => ({
        ...p,
        sessionCode,
        // The server says who already submitted (#284); absent on older backends.
        hasSubmitted: p.hasSubmitted ?? false,
      }))
    );

  if (ack.data.lobby) store.setLobby(ack.data.lobby);
  const currentLobby = useSessionStore.getState().lobby;
  // A delayed completed ack must not restore a Match discarded by Restart.
  // Later roster revisions are fine while this same round remains complete.
  if (
    ack.data.results &&
    (!ack.data.lobby ||
      (currentLobby?.state === 'complete' && currentLobby.round === ack.data.lobby.round))
  )
    applyResults(ack.data.results);

  // The ack may have arrived before a drop while credential storage was pending.
  // Keep its capability, then recover the new socket before enabling mutations.
  if (!resumeOnly && transportGeneration !== recoveryGeneration) void reconcileSession();
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
  restartSession,
  updateSessionChoices,
  setSessionReady,
  startSession,
  removeSessionParticipant,
  openOrder,
  addOrderItem,
  claimBuyer,
} from './socketService';

// Include the round that produced this phone's Deck, so a delayed Selection
// cannot become a vote in a freshly restarted round.
export function submitSelection(sessionCode: string, optionIds: string[]): Promise<Ack<null>> {
  const lobby = useSessionStore.getState().lobby;
  return socketService.submitSelection({
    sessionCode,
    selections: optionIds,
    round: lobby?.sessionCode === sessionCode ? lobby.round : undefined,
  });
}
export function sendLiveSelection(
  sessionCode: string,
  placeId: string,
  retract?: boolean
): Promise<Ack<null>> {
  const lobby = useSessionStore.getState().lobby;
  return socketService.sendLiveSelection({
    sessionCode,
    placeId,
    retract,
    round: lobby?.sessionCode === sessionCode ? lobby.round : undefined,
  });
}

/**
 * Leave session intentionally and clear local session state. The store is reset
 * regardless of ack outcome — every caller navigates away either way.
 */
export async function leaveSession(
  sessionCode: string,
  generation = beginSessionIntent()
): Promise<Ack<null>> {
  const initial = useSessionStore.getState();
  const me = initial.participants.find((p) => p.participantId === initial.currentUserId);
  return queueAdmission(async () => {
    if (!isSessionIntentCurrent(generation)) return superseded();
    try {
      const ack = await socketService.leaveSession({ sessionCode });
      return isSessionIntentCurrent(generation) ? ack : superseded();
    } finally {
      if (me) {
        try {
          await clearRejoinToken(sessionCode, me.displayName);
        } catch {
          if (isSessionIntentCurrent(generation))
            toast.warning(
              'Could not clear saved credentials. Your session will not reopen automatically.'
            );
        }
      }
      if (isSessionIntentCurrent(generation)) useSessionStore.getState().resetSession();
    }
  });
}

export function reconcileSession(): Promise<void> {
  if (recovery && recoveryIntent === sessionIntent) return recovery;
  recoveryIntent = sessionIntent;
  const intent = sessionIntent;
  const store = useSessionStore.getState();
  const code = store.sessionCode;
  const me = store.participants.find((p) => p.participantId === store.currentUserId);
  if (!code || !me) return Promise.resolve();
  const generation = recoveryGeneration;
  let participantId = me.participantId;
  const stillCurrent = () => {
    const current = useSessionStore.getState();
    return (
      generation === recoveryGeneration &&
      isSessionIntentCurrent(intent) &&
      current.sessionCode === code &&
      current.currentUserId === participantId
    );
  };
  store.setConnectionStatus(false);
  recovery = (async () => {
    try {
      await waitForConnection();
      if (!stillCurrent()) return;
      const ack = await joinSession(code, me.displayName, true);
      if (ack.success) participantId = ack.data.participantId;
      if (!stillCurrent()) return;
      if (!ack.success) {
        if (
          ['SESSION_NOT_FOUND', 'NOT_IN_SESSION', 'SESSION_ALREADY_STARTED'].includes(
            ack.error.code
          )
        ) {
          store.resetSession();
          useSessionStore.setState({ rejectedSessionCode: code });
        }
        toast.error(`Could not rejoin session: ${ack.error.message}`);
        return;
      }
      const { orderPlaceId, lobby } = useSessionStore.getState();
      if (orderPlaceId) {
        const order = await socketService.openOrder({ sessionCode: code, placeId: orderPlaceId });
        if (!stillCurrent()) return;
        const current = useSessionStore.getState();
        if (current.orderPlaceId !== orderPlaceId || current.lobby?.round !== lobby?.round) {
          // A Restart's authoritative event already discarded this basket.
          store.setConnectionStatus(true);
          return;
        }
        if (!order.success) {
          if (
            order.error.code === 'NOT_FOUND' &&
            'reason' in order.error &&
            (order.error.reason === 'stale' || order.error.reason === 'no_menu')
          ) {
            // These verdicts prove no basket exists. Let the page run its
            // existing Comparison refresh/no-menu fallback instead of trapping Retry.
            useOrderStore.getState().clear();
            store.setConnectionStatus(true);
            return;
          }
          if (order.error.code === 'VALIDATION_ERROR') {
            store.setOrderPlaceId(null);
            useOrderStore.getState().clear();
          }
          if (['SESSION_NOT_FOUND', 'NOT_IN_SESSION'].includes(order.error.code)) {
            store.resetSession();
            useSessionStore.setState({ rejectedSessionCode: code });
          } else {
            // The rejoin succeeded, so the phone is back in its Session (#511).
            // The order page opens the basket itself and has its own failure
            // screens. Drop only the unconfirmed basket so nothing is added
            // against it; the Pinned Menu and no-menu markers still hold.
            useOrderStore.setState({ order: null });
            store.setConnectionStatus(true);
          }
          toast.error(`Could not restore the basket: ${order.error.message}`);
          return;
        }
        useOrderStore.getState().setOrder(order.data, order.data.menu);
      }
      store.setConnectionStatus(true);
    } catch {
      if (stillCurrent())
        toast.error('Could not restore your session yet. Check your connection and try again.');
    } finally {
      if (generation === recoveryGeneration && isSessionIntentCurrent(intent)) recovery = undefined;
    }
  })();
  return recovery;
}

/**
 * Disconnect socket and mark the session store disconnected.
 */
export function disconnectSocket(): void {
  beginSessionIntent();
  recoveryGeneration++;
  recovery = undefined;
  socketService.disconnectSocket();
  useSessionStore.getState().setConnectionStatus(false);
  // An intentional teardown is not a lost connection: the next connect is a
  // fresh Session, not a reconnect, so it must not toast "Reconnected".
  hadPreviousConnection = false;
}
