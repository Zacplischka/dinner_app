// Session service - Business logic for session lifecycle
//
// createSessionService(deps) builds the service over an injected store and
// restaurant-search fn (tests pass fakes); server.ts constructs the
// production instance.

import { logger } from '../logger.js';
import { randomUUID } from 'node:crypto';
import { shareableLink } from '../config/index.js';
import { getExpiresAtISO, type SessionStore } from '../store/sessionStore.js';
import * as RestaurantSearchService from './RestaurantSearchService.js';
import { DomainError } from './DomainError.js';
import { cravingPoolKey } from './RecipePoolService.js';
import {
  SESSION_CODE_LENGTH,
  type Branch,
  type Craving,
  type DeckEntry,
  type Mood,
  isRestaurant,
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

interface SessionServiceDeps {
  store: SessionStore;
  searchNearbyRestaurants: typeof RestaurantSearchService.searchNearbyRestaurants;
  /**
   * The Cook Branch's Deck supply: a random cut of the union of both Recipe
   * supplies, plus whether the recipe source being dark is why the cut came up
   * short (#333). Rejects only when neither supply could answer.
   */
  dealRecipeDeck: (
    craving: Craving
  ) => Promise<{ entries: DeckEntry[]; recipeSourceDown: boolean }>;
  /**
   * A Cook Restart's Deck: another cut of the same pool, avoiding the just-wiped
   * deal where it can. Best-effort by contract — it degrades to reshuffling what
   * it was handed rather than failing, which is what lets Restart never fail.
   */
  redealRecipeDeck: (poolKey: string, current: DeckEntry[]) => Promise<DeckEntry[]>;
  /**
   * The Watch Branch's Deck supply (#369): the corpus Movies matching a Mood,
   * cut to a Deck. Synchronous and never rejects — the corpus is in memory.
   */
  dealMovieDeck: (mood: Mood) => DeckEntry[];
  /** A Watch Restart's Deck: the same Mood again, the just-wiped Movies dealt last. */
  redealMovieDeck: (mood: Mood, current: DeckEntry[]) => DeckEntry[];
  /**
   * Mints the Shopping List a completed Cook Session's crowned Recipe calls
   * for (#262), returning its id — or undefined when there is nothing to mint.
   * Returns before the list is priced: the Match must not wait on Woolworths.
   */
  mintShoppingList: (sessionCode: string, placeId: string) => Promise<string | undefined>;
}

/** What Cook setup captured: the Craving to deal from, and who's eating. */
export interface CookSetup {
  craving: Craving;
  headcount: number;
}

/** What Watch setup captured: the Mood to deal from. */
export interface WatchSetup {
  mood: Mood;
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
  redealRecipeDeck,
  dealMovieDeck,
  redealMovieDeck,
  mintShoppingList,
}: SessionServiceDeps) {
  /**
   * Create a new session with the given host
   * Returns session data including code and shareable link
   */
  async function createSession(
    hostName: string,
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
    },
    searchRadiusMiles?: number,
    branch?: Branch,
    cook?: CookSetup,
    watch?: WatchSetup
  ): Promise<{
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
    restaurantCount?: number;
    headcount?: number;
  }> {
    // Generate unique session code
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

    // Deal the Session's Deck. A Cook Session deals Recipes from the shared
    // Craving pool, a Watch Session deals Movies from the corpus; every other
    // Branch searches nearby Restaurants as before.
    let deckEntries: DeckEntry[] = [];
    let recipeSourceDown = false;
    if (cook) {
      // The two ways a deal can come back without Recipes are different facts
      // and get different words (#250): the source answering "none" is about
      // the Craving, the source not answering is not.
      //
      // Every rejection is read as the second, which holds because dealDeck's
      // one documented failure is the source, and since #333 it only rejects
      // when the Owned Recipe Store had nothing to deal either. A deal that
      // ever learns to reject for a reason of its own must say so with a
      // DomainError and be let through here, or it will be mislabelled.
      const dealt = await dealRecipeDeck(cook.craving).catch((error: unknown) => {
        logger.error({ err: error, sessionCode }, 'Recipe source failed dealing a Deck');
        throw new DomainError(
          'RECIPE_SOURCE_UNAVAILABLE',
          "Couldn't load recipes just now. Try again in a moment."
        );
      });
      deckEntries = dealt.entries;
      recipeSourceDown = dealt.recipeSourceDown;

      if (deckEntries.length === 0) {
        // The zero-Recipe Craving: the Cook Branch's one refusal, and it lands
        // at setup with the chips still editable, never on a Session (#260).
        // Since the blend it is a statement about the *union* — both supplies
        // empty (#316). Nothing is auto-relaxed — the Host relaxes their own
        // chips.
        logger.warn({ sessionCode, craving: cook.craving }, 'No recipes found for Craving');
        throw new DomainError(
          'NO_RECIPES_FOUND',
          'No recipes match those choices. Try removing a filter.'
        );
      }
    } else if (watch) {
      // The corpus is in memory, so a deal cannot fail — only come up empty,
      // which like the Cook refusal lands at setup with the chips still
      // editable, never on a Session (#369).
      deckEntries = dealMovieDeck(watch.mood);

      if (deckEntries.length === 0) {
        logger.warn({ sessionCode, mood: watch.mood }, 'No movies found for Mood');
        throw new DomainError(
          'NO_MOVIES_FOUND',
          'No movies match those choices. Try removing a genre or decade.'
        );
      }
    } else if (location && searchRadiusMiles) {
      // Convert miles to meters (1 mile = 1609.34 meters)
      const radiusMeters = searchRadiusMiles * 1609.34;

      deckEntries = await searchNearbyRestaurants({
        latitude: location.latitude,
        longitude: location.longitude,
        radiusMeters,
        maxResults: 20, // a local post-search cap — RestaurantSearchService
        // slices its merged results to this; nothing is sent to the Places API
      });

      // Throw error if no restaurants found
      if (deckEntries.length === 0) {
        logger.warn(
          {
            sessionCode,
            searchRadiusMiles,
          },
          'No restaurants found during session creation'
        );
        throw new DomainError(
          'NO_RESTAURANTS_FOUND',
          'No restaurants found in the specified area. Try expanding your search radius.'
        );
      }
    }

    // Create session (host will be added when they join via WebSocket)
    // Note: hostId is temporary and not used since host joins via WebSocket
    const { session, expireAt } = await store.createSession(sessionCode, {
      hostId: `temp-${Date.now()}`,
      hostName,
      location,
      searchRadiusMiles,
      branch,
      headcount: cook?.headcount,
      cravingKey: cook && cravingPoolKey(cook.craving),
      mood: watch?.mood,
      recipeSourceDown,
      entries: deckEntries,
    });

    logger.info(
      {
        sessionCode,
        hasLocation: Boolean(location),
        searchRadiusMiles,
        participantCount: 1,
        restaurantCount: deckEntries.length,
      },
      'Session created'
    );

    return {
      sessionCode,
      hostName,
      participantCount: 1,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink: shareableLink(sessionCode),
      branch,
      location,
      searchRadiusMiles,
      restaurantCount: deckEntries.length,
      headcount: cook?.headcount,
    };
  }

  /**
   * Get session details
   */
  async function getSession(sessionCode: string): Promise<{
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

    // Get host participant to retrieve hostName
    const participants = await store.listParticipants(sessionCode);
    const host = participants.find((p) => p.isHost);

    // If no host exists yet, use the hostName from session creation
    // This handles the case where a session was created via REST but host hasn't joined via WebSocket
    const hostName = host ? host.displayName : session.hostName;

    // Calculate expiresAt from TTL
    const ttl = await store.getSessionTtl(sessionCode);

    // Guard against negative TTL values
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
    rejoinToken?: string
  ): Promise<{
    participantId: string;
    sessionCode: string;
    participantName: string;
    participantCount: number;
    isHost: boolean;
    isRejoin: boolean;
    rejoinToken: string;
    participants: {
      participantId: string;
      displayName: string;
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
    // Check session exists
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
      isHost = !hostPresent && displayName === session.hostName;
      participantRejoinToken = randomUUID();
    }

    // The host slot stays reserved in the count until the host claims it
    const reservedHostSlot = Number(!(hostPresent || isHost));

    if (!prior) {
      // Check participant limit
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
          ...(await leaveSession(elsewhere.sessionCode, participantId)),
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

    if (prior) {
      await store.removeParticipant(sessionCode, prior.participantId);
    }

    // Add participant (touches TTL and lastActivityAt)
    const setSize = await store.addParticipant(sessionCode, {
      participantId,
      displayName,
      isHost,
      rejoinToken: participantRejoinToken,
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

    // Sole participantCount writer: set size plus the reserved host slot
    const participantCount = setSize + reservedHostSlot;
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
      participantCount,
      isHost,
      isRejoin,
      rejoinToken: participantRejoinToken,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
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

    // Top Pick: crown one entry from the Match, else every entry anyone selected,
    // else the Deck's open entries.
    const of = selections.length;
    let pool = results.overlappingOptions;
    if (!results.hasOverlap) {
      const deck = (await store.getDeck(sessionCode)).entries;
      const selected = deck.filter((e) => (tally.get(e.placeId) ?? 0) > 0);
      // Nobody selected anything: fall back to the Deck so the screen still answers,
      // but don't crown a venue Places says is shut when an open one exists. Only a
      // Restaurant can be shut — every other kind is always in the open pool.
      const open = deck.filter((e) => !isRestaurant(e) || e.openNow !== false);
      pool = selected.length > 0 ? selected : open.length > 0 ? open : deck;
    }
    const crowned = [...pool].sort(
      (a, b) =>
        (tally.get(b.placeId) ?? 0) - (tally.get(a.placeId) ?? 0) ||
        middleRung(b) - middleRung(a) ||
        a.name.localeCompare(b.name)
    )[0];
    const topPick = crowned
      ? { restaurant: crowned, likedBy: tally.get(crowned.placeId) ?? 0, of }
      : undefined;
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

    return { ...results, topPick, shoppingListId };
  }

  /**
   * Record a participant's selections. When the last participant submits,
   * computes the Match, marks the session complete, and returns the results.
   */
  async function submitSelections(
    sessionCode: string,
    participantId: string,
    placeIds: string[]
  ): Promise<{
    submittedCount: number;
    participantCount: number;
    results?: Awaited<ReturnType<typeof completeSession>>;
  }> {
    if (!(await store.readSession(sessionCode))) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
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
    const participantCount = remaining.length + (hostPresent ? 0 : 1);
    await store.setParticipantCount(sessionCode, participantCount);

    logger.info({ sessionCode, participantId, participantCount }, 'Participant left session');

    if (
      session.state !== 'complete' &&
      remaining.length > 0 &&
      remaining.every((p) => p.hasSubmitted)
    ) {
      // The leaver was the last holdout: complete the session for those remaining
      const results = await completeSession(sessionCode);
      return { displayName: participant.displayName, participantCount, results };
    }

    return { displayName: participant.displayName, participantCount };
  }

  /**
   * Wipe Selections, Submissions, and the Match so the same Participants can
   * decide again.
   *
   * A Cook Session also deals again (#246, #260): Recipe supply is a shared pool
   * with nothing geographic about it, so "show me different ones" is honest
   * here — and only here. A Watch Session deals again for the same reason
   * (#369). A Restaurant Session keeps its Deck, as it always has.
   */
  async function restartSession(
    sessionCode: string,
    participantId: string
  ): Promise<{ restarted: boolean }> {
    const session = await store.readSession(sessionCode);
    if (!session) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
    }

    if (!(await store.isParticipant(sessionCode, participantId))) {
      throw new DomainError('NOT_IN_SESSION', 'You are not a participant in this session');
    }

    // The lobby's "Start Selecting" is this same command from 'waiting' — the
    // first start, not a Restart. The distinction is surfaced so "Session
    // restarted" in a log is always a real mid-flight Restart (#289).
    const restarted = session.state !== 'waiting';

    // cravingKey is what a Cook Session's Deck was dealt from, and the only
    // handle a Restart needs — the redeal reads the pool that key names and
    // never goes to the source, so a Restart costs no lookup and cannot fail.
    //
    // 'waiting' is excluded because there the Deck is the one setup just
    // dealt and nobody has seen it, so a redeal would throw away the Host's
    // deal for a disjoint one.
    if (session.cravingKey && restarted) {
      const { entries } = await store.getDeck(sessionCode);
      await store.replaceDeck(sessionCode, await redealRecipeDeck(session.cravingKey, entries));
    } else if (session.mood && restarted) {
      // The Watch twin (#369): the Mood itself is the handle, and the redeal
      // filters the in-memory corpus again — no pool, no lookup, cannot fail.
      const { entries } = await store.getDeck(sessionCode);
      await store.replaceDeck(sessionCode, redealMovieDeck(session.mood, entries));
    }

    await store.resetForRestart(sessionCode);
    logger.info(
      { sessionCode, participantId },
      restarted ? 'Session restarted' : 'Session selection started'
    );
    return { restarted };
  }

  return { createSession, getSession, joinSession, submitSelections, leaveSession, restartSession };
}

export type SessionService = ReturnType<typeof createSessionService>;
