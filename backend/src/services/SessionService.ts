// Session service - Business logic for session lifecycle
//
// createSessionService(deps) builds the service over an injected store and
// restaurant-search fn (tests pass fakes); server.ts constructs the
// production instance.

import { logger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import { config, shareableLink } from '../config/index.js';
import { getExpiresAtISO, type SessionStore } from '../store/sessionStore.js';
import * as RestaurantSearchService from './RestaurantSearchService.js';
import { DomainError } from './DomainError.js';
import { createLobbyCommands } from './SessionLobbyService.js';
import {
  MAX_RESTAURANT_DECK_SIZE,
  SESSION_CODE_LENGTH,
  type Branch,
  type Craving,
  type DeckEntry,
  type MealType,
  type Mood,
  type SessionLocation,
  isRestaurant,
  type SessionLobbyState,
  type SessionResultsEvent,
  type TopPick,
  type Craving as CollaborativeCraving,
} from '@dinder/shared/types';

/** Maximum participants per session, including the reserved host slot — the cap the join path enforces. */
export const MAX_PARTICIPANTS = 4;

/**
 * The Top Pick's middle rung, per Deck Entry kind: a Restaurant's rating, a
 * Recipe's Spoonacular aggregate likes. A Movie's rating shares the Restaurant
 * arm. An entry the source knows nothing about sinks to the bottom of its own
 * rung, as an unrated Restaurant always has.
 */
function middleRung(entry: DeckEntry): number {
  return (entry.kind === 'recipe' ? entry.aggregateLikes : entry.rating) ?? -1;
}

/** The same read-only crown rule for completion and completed rejoin. */
function rankTopPick(
  results: {
    allSelections: Record<string, string[]>;
    overlappingOptions: DeckEntry[];
    hasOverlap: boolean;
  },
  deck: DeckEntry[]
): TopPick | undefined {
  const selections = Object.values(results.allSelections);
  const tally = new Map<string, number>();
  for (const ids of selections) for (const id of ids) tally.set(id, (tally.get(id) ?? 0) + 1);
  let pool = results.overlappingOptions;
  if (!results.hasOverlap) {
    const selected = deck.filter((e) => (tally.get(e.placeId) ?? 0) > 0);
    const open = deck.filter((e) => !isRestaurant(e) || e.openNow !== false);
    pool = selected.length ? selected : open.length ? open : deck;
  }
  const crowned = [...pool].sort(
    (a, b) =>
      (tally.get(b.placeId) ?? 0) - (tally.get(a.placeId) ?? 0) ||
      middleRung(b) - middleRung(a) ||
      a.name.localeCompare(b.name)
  )[0];
  return crowned
    ? { restaurant: crowned, likedBy: tally.get(crowned.placeId) ?? 0, of: selections.length }
    : undefined;
}

export interface SessionServiceDeps {
  store: SessionStore;
  searchNearbyRestaurants: typeof RestaurantSearchService.searchNearbyRestaurants;
  /**
   * The Cook Branch's Deck supply: a random cut of the union of both Recipe
   * supplies, plus whether the recipe source being dark is why the cut came up
   * short (#333). Rejects only when neither supply could answer.
   */
  dealRecipeDeck: (
    craving: Craving,
    deckSize?: number
  ) => Promise<{ entries: DeckEntry[]; recipeSourceDown: boolean }>;
  /**
   * The Watch Branch's Deck supply (#369): the corpus Movies matching a Mood,
   * the ones already dealt last. Synchronous and never rejects — the corpus is
   * in memory.
   */
  redealMovieDeck: (
    mood: Mood,
    current: DeckEntry[],
    deckSize?: number,
    interests?: Mood[]
  ) => DeckEntry[];
  dealCollaborativeRecipeDeck?: (
    craving: CollaborativeCraving,
    interests: CollaborativeCraving['cuisines'][],
    current: DeckEntry[],
    deckSize?: number
  ) => Promise<{ entries: DeckEntry[]; recipeSourceDown: boolean }>;
  /**
   * Mints the Shopping List a completed Cook Session's crowned Recipe calls
   * for (#262), returning its id — or undefined when there is nothing to mint.
   * Returns before the list is priced: the Match must not wait on Woolworths.
   */
  mintShoppingList: (sessionCode: string, placeId: string) => Promise<string | undefined>;
}

/**
 * Generate a random Session Code. Uniqueness is NOT guaranteed here —
 * createSession's collision-retry loop owns that.
 *
 * The alphabet omits the characters that look or sound alike when a code is
 * read aloud at the table (0/O, 1/I, 5/S, 8/B, 2/Z): 29 symbols, ~20.5M codes.
 * Only minting narrows; SESSION_CODE_PATTERN stays [A-Z0-9] so codes minted
 * before this change still join.
 */
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ34679';
  let code = '';
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createSessionService({
  store,
  searchNearbyRestaurants,
  dealRecipeDeck,
  redealMovieDeck,
  mintShoppingList,
  dealCollaborativeRecipeDeck,
}: SessionServiceDeps) {
  /**
   * Create a new Lobby Session with the given host. Nothing is dealt here: the
   * room gathers first and the host's start deals (SessionLobbyService).
   *
   * Everything past the host's name is setup the chosen Branch decides, in one
   * object — the same shape apiClient.createSession takes on the other side of
   * the wire, so the next optional field is one line on each side.
   */
  async function createSession(
    hostName: string,
    setup: {
      location?: SessionLocation;
      searchRadiusMiles?: number;
      branch?: Branch;
      /** The Cook lobby's starting meal type; the room can change it. */
      mealType?: MealType;
      headcount?: number;
      /**
       * How many cards the Host asked to swipe (#415), already range-checked
       * by the router. Undefined means the Branch's own default. Every Branch
       * reads it as a ceiling: a thin supply still deals what it has.
       */
      deckSize?: number;
    } = {}
  ): Promise<{
    lobby?: SessionLobbyState;
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
    branch?: Branch;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    searchRadiusMiles?: number;
    headcount?: number;
  }> {
    const { location, searchRadiusMiles, headcount } = setup;
    // A create with no Branch predates the fork (#255), when every Session
    // searched nearby Restaurants: Eat Out.
    const branch = setup.branch ?? 'eatout';
    const deckSize =
      setup.deckSize ??
      (branch === 'eatout' || branch === 'takeaway'
        ? MAX_RESTAURANT_DECK_SIZE
        : config.spoonacular.deckSize);

    let sessionCode = generateSessionCode();
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    // Ensure uniqueness (extremely unlikely to collide, but good practice)
    while (attempts < MAX_ATTEMPTS) {
      if (!(await store.sessionExists(sessionCode))) break;
      logger.warn(
        {
          sessionCode,
          attempt: attempts + 1,
        },
        'Session code collision during createSession'
      );
      sessionCode = generateSessionCode();
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      logger.error(
        {
          attempts: MAX_ATTEMPTS,
        },
        'Failed to generate unique session code'
      );
      throw new Error('Failed to generate unique session code');
    }

    // Create session (host will be added when they join via WebSocket)
    const { session, expireAt } = await store.createSession(sessionCode, {
      mealType: setup.mealType,
      hostName,
      location,
      searchRadiusMiles,
      branch,
      headcount: headcount ?? 2,
      deckSize,
    });

    logger.info(
      {
        sessionCode,
        hasLocation: Boolean(location),
        searchRadiusMiles,
        participantCount: 1,
      },
      'Session created'
    );

    return {
      lobby: await lobby.getLobby(sessionCode),
      sessionCode,
      hostName,
      participantCount: 1,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink: shareableLink(sessionCode),
      branch,
      location,
      searchRadiusMiles,
      headcount,
    };
  }

  /**
   * Get session details
   */
  async function getSession(sessionCode: string): Promise<{
    lobby?: SessionLobbyState;
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
    branch?: Branch;
    recipeSourceDown?: boolean;
  } | null> {
    const session = await store.readSession(sessionCode);

    if (!session) {
      return null;
    }

    const participants = await store.listParticipants(sessionCode);
    const host = participants.find((p) => p.isHost);

    // If no host exists yet, use the hostName from session creation
    // This handles the case where a session was created via REST but host hasn't joined via WebSocket
    const hostName = host ? host.displayName : session.hostName;

    const ttl = await store.getSessionTtl(sessionCode);

    // TTL -2 means key doesn't exist, -1 means no expiry set
    if (ttl < 0) {
      logger.warn(
        {
          sessionCode,
          ttl,
        },
        'Session lookup returned invalid TTL'
      );
      return null; // Session expired or doesn't exist
    }

    const expireAt = Math.floor(Date.now() / 1000) + ttl;

    return {
      lobby: await lobby.getLobby(sessionCode),
      sessionCode,
      hostName: hostName || 'Unknown Host',
      participantCount: session.participantCount,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink: shareableLink(sessionCode),
      branch: session.branch,
      // Read by every Participant's Selection screen, so the one plain line
      // about the short deal is the same line for the whole room (#333).
      recipeSourceDown: session.recipeSourceDown,
    };
  }

  /**
   * Join an existing session - the single join path for both REST and WebSocket.
   * Handles rejoin (same displayName, new participantId), host-slot assignment
   * (the joiner matching the session's hostName claims the reserved host slot),
   * and the participant cap.
   *
   * The reported participantCount is the participant set size plus one reserved
   * slot while the host hasn't joined yet.
   */
  async function joinSession(
    sessionCode: string,
    participantId: string,
    displayName: string,
    rejoinToken?: string,
    avatarUrl: string | null = null
  ): Promise<{
    participantId: string;
    sessionCode: string;
    participantName: string;
    results?: SessionResultsEvent;
    lobby?: SessionLobbyState;
    participantCount: number;
    isHost: boolean;
    isRejoin: boolean;
    rejoinToken: string;
    participants: {
      participantId: string;
      displayName: string;
      avatarUrl?: string | null;
      isHost: boolean;
      hasSubmitted: boolean;
      isOnline: boolean;
    }[];
    branch?: Branch;
    state: string;
    /** The Session this join pulled the Participant out of, if any (#284). */
    leftSession?: {
      sessionCode: string;
      displayName: string;
      participantCount: number;
      results?: Awaited<ReturnType<typeof completeSession>>;
    };
  }> {
    const session = await store.readSession(sessionCode);
    if (!session) {
      logger.warn(
        {
          sessionCode,
          participantId,
          reason: 'session_not_found',
        },
        'Rejected session join'
      );
      throw new DomainError('SESSION_NOT_FOUND', `Session ${sessionCode} not found or has expired`);
    }

    const existing = await store.listParticipants(sessionCode);
    const hostPresent = existing.some((p) => p.isHost);
    const sameName = existing.filter((p) => p.displayName === displayName);
    const prior = sameName.find(
      (participant) => rejoinToken !== undefined && participant.rejoinToken === rejoinToken
    );

    // A resume capability is never permission for fresh admission. Check before
    // claiming a name or leaving another Session, including when a code is reused.
    if (rejoinToken !== undefined && !prior) {
      throw new DomainError('NOT_IN_SESSION', 'Your place in this session is no longer available');
    }

    // The Invite Link's rule (CONTEXT.md): anyone holding it can join while the
    // Session lives — 'waiting' and 'selecting' alike (#284). Only the terminal
    // states refuse, named explicitly, each with its own words: the message
    // reaches the client verbatim, and "already started" would be a lie for the
    // only states still refused.
    if (!prior && (session.state === 'complete' || session.state === 'expired')) {
      logger.warn(
        { sessionCode, participantId, reason: 'session_over', state: session.state },
        'Rejected session join'
      );
      throw new DomainError(
        'SESSION_ALREADY_STARTED',
        session.state === 'complete' ? 'This session has finished' : 'This session has expired'
      );
    }

    let isHost: boolean;
    let participantRejoinToken: string;
    const isRejoin = Boolean(prior);

    if (prior) {
      // Rejoin: replace the old entry, preserving host status
      isHost = prior.isHost;
      participantRejoinToken = prior.rejoinToken!;
    } else {
      isHost = !session.hostSlotReleased && !hostPresent && displayName === session.hostName;
      participantRejoinToken = randomUUID();
    }

    // The host slot stays reserved in the count until the host claims it
    const reservedHostSlot = Number(!(hostPresent || isHost || session.hostSlotReleased));

    if (!prior) {
      if (existing.length + reservedHostSlot >= MAX_PARTICIPANTS) {
        logger.warn(
          {
            sessionCode,
            participantId,
            reason: 'session_full',
            participantCount: existing.length + reservedHostSlot,
          },
          'Rejected session join'
        );
        throw new DomainError(
          'SESSION_FULL',
          `Session is full (maximum ${MAX_PARTICIPANTS} participants)`
        );
      }
    }

    const nameClaimed = await store.claimDisplayName(
      sessionCode,
      displayName,
      participantId,
      participantRejoinToken,
      prior?.participantId
    );
    if (!nameClaimed) {
      logger.warn(
        { sessionCode, participantId, reason: 'display_name_taken' },
        'Rejected session join'
      );
      throw new DomainError(
        'DISPLAY_NAME_TAKEN',
        'That display name is already in use in this session'
      );
    }

    // The flip side of #283's phantom rooms: a Participant carries at most one
    // Session in Redis too. Joining a new one leaves the old one for real —
    // otherwise the old Session's completion (submittedCount === participantCount)
    // waits forever on someone who will never submit. Ordered after the name
    // claim so the common refusals (full, name taken, finished) cost the
    // Participant nothing; only the post-add cap race can still strand them.
    const elsewhere = await store.getParticipant(participantId);
    let leftSession:
      | {
          sessionCode: string;
          displayName: string;
          participantCount: number;
          results?: Awaited<ReturnType<typeof completeSession>>;
        }
      | undefined;
    if (elsewhere && elsewhere.sessionCode !== sessionCode) {
      try {
        leftSession = {
          sessionCode: elsewhere.sessionCode,
          ...(await guarded(leaveSession)(elsewhere.sessionCode, participantId)),
        };
      } catch (error) {
        // The old Session being gone already is not this join's problem.
        if (!(error instanceof DomainError)) throw error;
      }
    }

    // A rejoin re-keys the Participant by socket.id: the store's removeParticipant
    // DELs their Selections set and its addParticipant rewrites hasSubmitted '0'.
    // Copy an already-recorded Submission out first — and note that inside
    // Socket.IO's 2-minute recovery window (server.ts connectionStateRecovery)
    // the socket id is unchanged, so prior's Selections key IS the new one.
    const carriedSelections = prior?.hasSubmitted
      ? await store.readSelections(sessionCode, prior.participantId)
      : null;

    // Same-socket recovery already owns this name claim. Removing that entry
    // would release the claim we just retained and break the next rejoin.
    if (prior && prior.participantId !== participantId) {
      await store.removeParticipant(sessionCode, prior.participantId);
    }

    // Add participant (touches TTL and lastActivityAt)
    const setSize = await store.addParticipant(sessionCode, {
      participantId,
      displayName,
      isHost,
      rejoinToken: participantRejoinToken,
      avatarUrl,
      ready: prior?.ready,
      mood: prior?.mood,
      cuisines: prior?.cuisines,
      diets: prior?.diets,
      waitingForNextRound:
        prior?.waitingForNextRound ?? (session.branch === 'cook' && session.state === 'selecting'),
    });

    // Re-check after adding to close the check-then-add race. Rejoins are
    // exempt: they're net-zero in isolation, and a concurrent join landing
    // inside a rejoin's remove/add window may transiently exceed the cap -
    // an accepted trade-off over kicking out a legitimately-rejoining
    // participant.
    //
    // Both post-add refusals below carry the already-committed old-Session
    // departure on the error: the transport must still tell the old room even
    // when this join fails, or an old Session completed by the departure sits
    // on a Match nobody is ever sent (#284 review).
    if (!prior && setSize + reservedHostSlot > MAX_PARTICIPANTS) {
      await store.removeParticipant(sessionCode, participantId);
      logger.warn(
        {
          sessionCode,
          participantId,
          reason: 'session_full_after_add',
          participantCount: setSize + reservedHostSlot,
        },
        'Rejected session join'
      );
      throw Object.assign(
        new DomainError(
          'SESSION_FULL',
          `Session is full (maximum ${MAX_PARTICIPANTS} participants)`
        ),
        { leftSession }
      );
    }

    // Same mirror for the state guard (#284 review): admitting during
    // 'selecting' put the closing Submission inside the read-then-add window,
    // so a Session can complete while this join is in flight. Re-read and back
    // out rather than keep a joiner the completed Match never counted.
    if (!prior) {
      const now = await store.readSession(sessionCode);
      if (!now || now.state === 'complete' || now.state === 'expired') {
        await store.removeParticipant(sessionCode, participantId);
        logger.warn(
          { sessionCode, participantId, reason: 'session_over_after_add', state: now?.state },
          'Rejected session join'
        );
        throw Object.assign(
          new DomainError(
            'SESSION_ALREADY_STARTED',
            !now || now.state === 'expired'
              ? 'This session has expired'
              : 'This session has finished'
          ),
          { leftSession }
        );
      }
    }

    // Sole participantCount writer: Participants in this round plus the reserved host slot
    const joinedRoster = await store.listParticipants(sessionCode);
    const participantCount =
      joinedRoster.filter((p) => !p.waitingForNextRound).length + reservedHostSlot;
    if (!prior && session.state === 'waiting') {
      for (const p of joinedRoster)
        await store.writeParticipantChoices(p.participantId, { ready: false });
    }
    session.lobby!.revision++;
    session.lobby!.starting = false;
    await store.writeLobbySession(session);
    await store.setParticipantCount(sessionCode, participantCount);

    if (carriedSelections) {
      // Replays the Submission onto the new connection: SADDs the place ids and
      // sets hasSubmitted '1'. Empty array is correct and still marks them
      // submitted (a Submission is a fact about the Participant, not its size).
      // ponytail: not atomic with addParticipant — a submit landing inside this
      // two-round-trip window counts the rejoiner as pending and won't complete
      // the Session. Upgrade path if it ever bites: fold the restore into
      // addParticipant behind a hasSubmitted flag, or a Lua script.
      await store.recordSubmission(sessionCode, participantId, carriedSelections);
    }

    const participants = await store.listParticipants(sessionCode);

    logger.info(
      {
        sessionCode,
        participantId,
        participantCount,
      },
      'Participant joined session'
    );

    return {
      participantId,
      sessionCode,
      participantName: displayName,
      results: session.state === 'complete' ? await readCompletedResults(sessionCode) : undefined,
      lobby: await lobby.getLobby(sessionCode),
      participantCount,
      isHost,
      isRejoin,
      rejoinToken: participantRejoinToken,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        isHost: p.isHost,
        // A late joiner must see who has already submitted, or "x of y have
        // swiped" starts at zero in a room where it isn't (#284).
        hasSubmitted: p.hasSubmitted,
        // ...and who has dropped, so presence starts from server truth rather
        // than a client's guess that everyone is live.
        isOnline: p.isOnline,
      })),
      branch: session.branch,
      state: session.state,
      leftSession,
    };
  }

  async function readCompletedResults(sessionCode: string): Promise<SessionResultsEvent> {
    const stored = await store.readCompletedResults(sessionCode).catch((error: unknown) => {
      // Unreadable must not fail every rejoin for the rest of the Session's life.
      if (!(error instanceof SyntaxError)) throw error;
      logger.warn({ err: error, sessionCode }, 'Stored Session outcome unreadable, recomputing');
      return null;
    });
    if (stored) return stored;
    // ponytail: transitional. The recompute over whoever is left only serves
    // Sessions completed before #506 stored the outcome, and Session data
    // expires in 30 minutes, so a later PR can delete it (an unreadable copy
    // would then answer with no results rather than a recompute).
    const session = await store.readSession(sessionCode);
    const results = await store.readMatch(sessionCode);
    return {
      sessionCode,
      ...results,
      topPick: rankTopPick(
        results,
        results.hasOverlap ? [] : (await store.getDeck(sessionCode)).entries
      ),
      shoppingListId: session?.shoppingListId,
    };
  }

  /**
   * Complete the Session: compute and store the Match, mark the session
   * complete, and emit the anonymous session-outcome metrics line (#68 kill
   * gates) — counts and the session code only, never names or ids.
   */
  async function completeSession(sessionCode: string) {
    // Complete once. Late joins (#284) made a second completion reachable — a
    // joiner slipping in beside the closing Submission would recompute a
    // narrower Match over the broadcast one and SADD more ids into the results
    // set (computeAndStoreResults never clears it). Guarded here, the one seam
    // every caller routes through; the read-then-act window that remains is
    // the same residual sliver the cap re-check accepts.
    const current = await store.readSession(sessionCode);
    if (!current || current.state === 'complete') return undefined;

    const results = await store.computeAndStoreResults(sessionCode);
    await store.updateState(sessionCode, 'complete');
    logger.info({ sessionCode, hasOverlap: results.hasOverlap }, 'Session complete');

    // Near Miss tier: restaurants selected by exactly all-but-one current
    // Participant. Logged for all group sizes and alongside non-empty Matches
    // (#69) — the glossary's render rules (empty Match, n>=3) are a UI concern.
    // allSelections is keyed by displayName; safe as a per-Participant map
    // because joinSession treats a duplicate name as a rejoin.
    const selections = Object.values(results.allSelections);
    const tally = new Map<string, number>();
    for (const placeIds of selections) {
      for (const placeId of placeIds) {
        tally.set(placeId, (tally.get(placeId) ?? 0) + 1);
      }
    }
    const nearMissCount = [...tally.values()].filter((n) => n === selections.length - 1).length;

    const topPick = rankTopPick(
      results,
      results.hasOverlap ? [] : (await store.getDeck(sessionCode)).entries
    );
    // The Group Order gate is SISMEMBER session:{code}:results — admit the crown there too.
    if (!results.hasOverlap && topPick) {
      await store.addResultPlaceId(sessionCode, topPick.restaurant.placeId);
    }

    // The Cook ending (#262): a crowned Recipe mints its Shopping List, and
    // from here the list is on its own — its own URL, its own 7-day clock, no
    // Participant check. A mint that cannot happen must never cost the group
    // their Match, so it degrades to no list rather than throwing.
    const shoppingListId =
      topPick?.restaurant.kind === 'recipe'
        ? await mintShoppingList(sessionCode, topPick.restaurant.placeId).catch(
            (error: unknown) => {
              logger.error({ err: error, sessionCode }, 'Shopping List mint could not start');
              return undefined;
            }
          )
        : undefined;
    const outcome = { ...results, topPick, shoppingListId };
    // Crowned once (#399): a rejoin reads this copy, never a recompute over a
    // roster a Leave has since changed (#506).
    await store.writeCompletedResults(sessionCode, { sessionCode, ...outcome });

    const matchSize = results.overlappingOptions.length;
    const restartFollowed = await store.wasRestartedAfterComplete(sessionCode);

    logger.info(
      {
        sessionCode,
        participantCount: selections.length,
        matchSize,
        nearMissCount,
        restartFollowed,
        restartReachedMatch: restartFollowed && matchSize > 0,
      },
      'Session outcome'
    );

    current.lobby!.revision++;
    await store.writeLobbySession(current);
    return outcome;
  }

  /**
   * Record a participant's selections. When the last participant submits,
   * computes the Match, marks the session complete, and returns the results.
   */
  async function submitSelections(
    sessionCode: string,
    participantId: string,
    placeIds: string[],
    round?: number
  ): Promise<{
    submittedCount: number;
    participantCount: number;
    results?: Awaited<ReturnType<typeof completeSession>>;
  }> {
    const session = await store.readSession(sessionCode);
    if (!session) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
    }
    if (round !== undefined && session.lobby?.round !== round) {
      throw new DomainError('VALIDATION_ERROR', 'That submission belongs to a previous round.');
    }
    const submitter = await store.getParticipant(participantId);
    if (session.state !== 'selecting' || submitter?.waitingForNextRound) {
      throw new DomainError('VALIDATION_ERROR', 'You are waiting for the next round.');
    }

    if (!(await store.isParticipant(sessionCode, participantId))) {
      throw new DomainError('NOT_IN_SESSION', 'You are not a participant in this session');
    }

    const { submittedCount, participantCount } = await store.recordSubmission(
      sessionCode,
      participantId,
      placeIds
    );

    if (submittedCount !== participantCount) {
      return { submittedCount, participantCount };
    }

    // Everyone has submitted: compute the Match and complete the session
    const results = await completeSession(sessionCode);

    return { submittedCount, participantCount, results };
  }

  /**
   * Remove a Participant who deliberately left. Keeps the persisted
   * participantCount in sync and — because leaving can complete the Session
   * for those remaining (CONTEXT.md) — computes the Match when everyone
   * still present has already submitted.
   */
  async function leaveSession(
    sessionCode: string,
    participantId: string
  ): Promise<{
    displayName: string;
    participantCount: number;
    results?: Awaited<ReturnType<typeof completeSession>>;
  }> {
    const session = await store.readSession(sessionCode);
    if (!session) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
    }

    const participant = await store.getParticipant(participantId);
    if (!participant || participant.sessionCode !== sessionCode) {
      throw new DomainError('NOT_IN_SESSION', 'You are not a participant in this session');
    }

    await store.removeParticipant(sessionCode, participantId);
    const remaining = await store.listParticipants(sessionCode);

    // Same counting rule as joinSession: the host slot stays reserved
    // whenever no host is currently present — a host who leaves can rejoin
    // into the reserved slot, and the next join would recompute this anyway.
    const hostPresent = remaining.some((p) => p.isHost);
    const active = remaining.filter((p) => !p.waitingForNextRound);
    const participantCount = active.length + (hostPresent || session.hostSlotReleased ? 0 : 1);
    session.lobby!.revision++;
    session.lobby!.starting = false;
    await store.writeLobbySession(session);
    await store.setParticipantCount(sessionCode, participantCount);

    logger.info({ sessionCode, participantId, participantCount }, 'Participant left session');

    if (session.state === 'selecting' && active.length > 0 && active.every((p) => p.hasSubmitted)) {
      // The leaver was the last holdout: complete the session for those remaining
      const results = await completeSession(sessionCode);
      return { displayName: participant.displayName, participantCount, results };
    }

    return { displayName: participant.displayName, participantCount };
  }

  /**
   * Wipe Selections, Submissions, and the Match and return the room to the
   * lobby, where the same Participants review their choices and the host's
   * next start deals again.
   */
  async function restartSession(sessionCode: string, participantId: string): Promise<void> {
    const session = await store.readSession(sessionCode);
    if (!session) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
    }

    if (!(await store.isParticipant(sessionCode, participantId))) {
      throw new DomainError('NOT_IN_SESSION', 'You are not a participant in this session');
    }

    // This command moves the whole room back to the lobby, so it is the Host's
    // alone (#405). Guarded here, not in the handler, so every caller of the
    // one command is covered.
    //
    // Only while a Host is actually in the room: nothing promotes a successor,
    // so a Host who taps Leave would otherwise strand everyone else on "Waiting
    // for the host" until the TTL. No Host present, anyone left may start.
    //
    // Present means online, not merely listed: a Disconnect keeps the Host a
    // current Participant, and a Host who reopens the Invite Link in a new tab
    // has no rejoin token, so they join as an ordinary Participant beside their
    // own dead entry. Keying off the entry alone would freeze that room — the
    // real Host refused, everyone else refused.
    const roster = await store.listParticipants(sessionCode);
    if (roster.find((p) => p.participantId === participantId)?.waitingForNextRound) {
      throw new DomainError('NOT_HOST', 'The host must return the group to the lobby.');
    }
    if (
      roster.some((p) => p.isHost && p.isOnline) &&
      !roster.find((p) => p.participantId === participantId)?.isHost
    ) {
      throw new DomainError('NOT_HOST', 'Only the host can start selecting');
    }

    await store.resetForRestart(sessionCode);
    for (const p of roster)
      await store.writeParticipantChoices(p.participantId, {
        ready: false,
        waitingForNextRound: false,
      });
    session.lobby = {
      ...session.lobby!,
      revision: session.lobby!.revision + 1,
      starting: false,
      notice: undefined,
    };
    await store.writeLobbySession(session);
    await store.setParticipantCount(
      sessionCode,
      roster.length + (roster.some((p) => p.isHost) || session.hostSlotReleased ? 0 : 1)
    );
  }

  const lobby = createLobbyCommands({
    store,
    searchNearbyRestaurants,
    redealMovieDeck,
    dealRecipeDeck,
    dealCollaborativeRecipeDeck,
  });
  const guarded =
    <A extends unknown[], T>(command: (sessionCode: string, ...args: A) => Promise<T>) =>
    (sessionCode: string, ...args: A): Promise<T> =>
      store.withSessionLock(sessionCode, () => command(sessionCode, ...args));
  async function joinGuarded(
    sessionCode: string,
    participantId: string,
    displayName: string,
    rejoinToken?: string,
    avatarUrl: string | null = null
  ) {
    // A connection can switch Sessions, so lock both in one stable order.
    // The participant lock serializes simultaneous switches by this connection.
    return store.withSessionLock(`connection-${participantId}`, async () => {
      const elsewhere = await store.getParticipant(participantId);
      const codes = [
        ...new Set([sessionCode, ...(elsewhere ? [elsewhere.sessionCode] : [])]),
      ].sort();
      const enter = async (index: number): Promise<Awaited<ReturnType<typeof joinSession>>> => {
        if (index === codes.length)
          return joinSession(sessionCode, participantId, displayName, rejoinToken, avatarUrl);
        return store.withSessionLock(codes[index], () => enter(index + 1));
      };
      return enter(0);
    });
  }
  return {
    createSession,
    getSession: guarded(getSession),
    joinSession: joinGuarded,
    submitSelections: guarded(submitSelections),
    leaveSession: guarded(leaveSession),
    restartSession: guarded(restartSession),
    ...lobby,
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
