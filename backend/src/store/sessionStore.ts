// SessionStore - the sole keeper of everything a live Session remembers.
// Owns every Redis key format and the session TTL; callers never build keys.
// See CONTEXT.md for the domain language (Session, Participant, Submission, Match).
//
// createSessionStore(redis) builds a store bound to any ioredis-compatible
// client (tests inject ioredis-mock); server.ts constructs the production
// instance.

import type { ChainableCommander, Redis } from 'ioredis';
import { DomainError } from '../services/DomainError.js';
import { SESSION_CODE_LENGTH, type Branch, type DeckEntry } from '@dinder/shared/types';

export const SESSION_TTL_SECONDS = 30 * 60;

// --- Persistence models (backend-only) ---------------------------------
// How a live Session and its Participants are represented in Redis. These are
// not wire contracts and never leave the backend — SessionStore is their sole
// reader and writer (ADR 0001; issue #113). Data expires in 30 min, so there is
// no schema version or runtime decoder: the shapes below are the only encoding.

export interface Session {
  sessionCode: string;
  hostId: string;
  state: 'waiting' | 'selecting' | 'complete' | 'expired';
  participantCount: number;
  createdAt: number;
  lastActivityAt: number;
  hostName?: string;
  /** Fixed at creation for the Session's life (#255); absent on pre-fork sessions. */
  branch?: Branch;
  /**
   * Cook Branch only (#259). The Headcount the Top Pick's ingredients will be
   * scaled to — set at setup, never part of the Craving, and untouched by the
   * deal. `cravingKey` points back at the shared pool this Deck was dealt from.
   */
  headcount?: number;
  cravingKey?: string;
  /**
   * Cook Branch only (#333). This Session's Deck came up short because the
   * recipe source was dark when it was dealt — the one plain line every
   * Participant sees. A fact about the deal, so it is fixed at creation
   * alongside the Deck itself.
   */
  recipeSourceDown?: boolean;
  /**
   * The Shopping List this Session minted from its Top Pick (#262). Written
   * once, by whichever completion got there first — the Session's record that
   * minting has happened, not a handle on anything it owns: the list lives on
   * its own keys, its own URL, and its own 7-day clock.
   */
  shoppingListId?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  searchRadiusMiles?: number;
}

export interface Participant {
  participantId: string;
  displayName: string;
  sessionCode: string;
  joinedAt: number;
  hasSubmitted: boolean;
  isHost: boolean;
  rejoinToken?: string;
}

// --- Keyspace (private) ------------------------------------------------
// session:{code}                     hash: session metadata
// session:{code}:participants       set:  participant ids
// session:{code}:display_names      hash: display name -> [participant id, rejoin token]
// session:{code}:{pid}:selections   set:  place ids a participant selected
// session:{code}:results            set:  placeIds this Session may act on — the Match, plus the
//                                         crowned Top Pick when there is none ('__empty__' sentinel keeps TTL)
// session:{code}:restaurant_ids     set:  valid place ids for the session's Deck
// session:{code}:restaurants        hash: placeId -> DeckEntry JSON (the Deck; keys keep
//                                         their restaurant-era names, ADR 0007 is
//                                         about the wire and these never leave here)
// session:{code}:order              hash: the Group Order's fixed metadata + Pinned Menu
// session:{code}:order:lines        hash: "{index}:{displayName}" -> qty
// participant:{pid}                 hash: participant metadata

const sessionKey = (code: string) => `session:${code}`;
const participantsKey = (code: string) => `session:${code}:participants`;
const displayNamesKey = (code: string) => `session:${code}:display_names`;
const selectionsKey = (code: string, pid: string) => `session:${code}:${pid}:selections`;
const resultsKey = (code: string) => `session:${code}:results`;
const restaurantIdsKey = (code: string) => `session:${code}:restaurant_ids`;
const restaurantsKey = (code: string) => `session:${code}:restaurants`;
const orderKey = (code: string) => `session:${code}:order`;
const orderLinesKey = (code: string) => `session:${code}:order:lines`;
const participantKey = (pid: string) => `participant:${pid}`;

// Atomically EXPIREAT every session-related key
const REFRESH_TTL_LUA = `
local expireAt = tonumber(ARGV[1])
for i = 1, #KEYS do
    redis.call('EXPIREAT', KEYS[i], expireAt)
end
return expireAt
`;

// Atomically create a display-name claim or transfer an existing claim from
// the participant being rejoined to their replacement connection.
const CLAIM_DISPLAY_NAME_LUA = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if current then
    if current ~= ARGV[2] then return 0 end
elseif ARGV[2] ~= '' then
    return 0
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('EXPIREAT', KEYS[1], ARGV[4])
return 1
`;

// A stale connection must not release a claim already transferred to its
// replacement.
const RELEASE_DISPLAY_NAME_LUA = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
return redis.call('HDEL', KEYS[1], ARGV[1])
`;

function calculateExpireAt(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

export function getExpiresAtISO(expireAt: number): string {
  return new Date(expireAt * 1000).toISOString();
}

/**
 * Extracts the session code from an expired-key notification, or null if the
 * key isn't a session's root key (e.g. it's a sub-key like ...:results).
 */
export function sessionCodeFromExpiredKey(key: string): string | null {
  if (!key.startsWith('session:')) {
    return null;
  }
  const sessionCode = key.replace('session:', '');
  return sessionCode.length === SESSION_CODE_LENGTH ? sessionCode : null;
}

/**
 * Queues the two commands that make a Deck — the id set and the entry hash —
 * onto a pipeline or a MULTI. Both the Session's first Deck and a Cook
 * Restart's replacement go through here, so the two halves can never drift.
 */
function queueDeckWrite(
  chain: ChainableCommander,
  sessionCode: string,
  entries: DeckEntry[]
): void {
  chain.sadd(restaurantIdsKey(sessionCode), ...entries.map((e) => e.placeId));
  chain.hset(
    restaurantsKey(sessionCode),
    Object.fromEntries(entries.map((e) => [e.placeId, JSON.stringify(e)]))
  );
}

export function createSessionStore(redis: Redis) {
  /**
   * Refresh TTL on every key belonging to a session and stamp lastActivityAt.
   * Called by the flow mutations — create, join, submission, results, restart,
   * deck replace, and the Group Order writes. NOT by every mutating operation:
   * updateState, claimDisplayName, setParticipantCount, removeParticipant,
   * addResultPlaceId, claimShoppingListId and releaseShoppingListId leave the
   * clock untouched (whether they should is an open Session-expiry question).
   */
  async function touch(sessionCode: string): Promise<number> {
    const expireAt = calculateExpireAt();
    const participantIds = await redis.smembers(participantsKey(sessionCode));

    const keys = [
      sessionKey(sessionCode),
      participantsKey(sessionCode),
      displayNamesKey(sessionCode),
      resultsKey(sessionCode),
      restaurantIdsKey(sessionCode),
      restaurantsKey(sessionCode),
      orderKey(sessionCode),
      orderLinesKey(sessionCode),
    ];
    participantIds.forEach((pid) => {
      keys.push(participantKey(pid));
      keys.push(selectionsKey(sessionCode, pid));
    });

    await redis.hset(sessionKey(sessionCode), 'lastActivityAt', Math.floor(Date.now() / 1000));
    await redis.eval(REFRESH_TTL_LUA, keys.length, ...keys, expireAt);

    return expireAt;
  }

  // --- Session -----------------------------------------------------------

  async function sessionExists(sessionCode: string): Promise<boolean> {
    return (await redis.exists(sessionKey(sessionCode))) === 1;
  }

  async function createSession(
    sessionCode: string,
    opts: {
      hostId: string;
      hostName?: string;
      branch?: Branch;
      headcount?: number;
      cravingKey?: string;
      recipeSourceDown?: boolean;
      location?: { latitude: number; longitude: number; address?: string };
      searchRadiusMiles?: number;
      /** The Deck this Session deals: Restaurants or Recipes. */
      entries?: DeckEntry[];
    }
  ): Promise<{ session: Session; expireAt: number }> {
    const now = Math.floor(Date.now() / 1000);

    const session: Session = {
      sessionCode,
      hostId: opts.hostId,
      state: 'waiting',
      participantCount: 1,
      createdAt: now,
      lastActivityAt: now,
      hostName: opts.hostName,
      branch: opts.branch,
      headcount: opts.headcount,
      cravingKey: opts.cravingKey,
      recipeSourceDown: opts.recipeSourceDown || undefined,
      location: opts.location,
      searchRadiusMiles: opts.searchRadiusMiles,
    };

    const sessionData: Record<string, string | number> = {
      createdAt: session.createdAt,
      hostId: session.hostId,
      state: session.state,
      participantCount: session.participantCount,
      lastActivityAt: session.lastActivityAt,
    };
    if (opts.hostName) sessionData.hostName = opts.hostName;
    if (opts.branch) sessionData.branch = opts.branch;
    if (opts.headcount !== undefined) sessionData.headcount = opts.headcount;
    if (opts.cravingKey) sessionData.cravingKey = opts.cravingKey;
    if (opts.recipeSourceDown) sessionData.recipeSourceDown = '1';
    if (opts.location) {
      sessionData.locationLat = opts.location.latitude;
      sessionData.locationLng = opts.location.longitude;
      if (opts.location.address) sessionData.locationAddress = opts.location.address;
    }
    if (opts.searchRadiusMiles !== undefined) {
      sessionData.searchRadiusMiles = opts.searchRadiusMiles;
    }

    const pipeline = redis.pipeline();
    pipeline.hset(sessionKey(sessionCode), sessionData);

    if (opts.entries && opts.entries.length > 0) {
      queueDeckWrite(pipeline, sessionCode, opts.entries);
    }

    await pipeline.exec();
    const expireAt = await touch(sessionCode);

    return { session, expireAt };
  }

  async function readSession(sessionCode: string): Promise<Session | null> {
    const data = await redis.hgetall(sessionKey(sessionCode));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    const session: Session = {
      sessionCode,
      hostId: data.hostId,
      state: data.state as Session['state'],
      participantCount: parseInt(data.participantCount, 10),
      createdAt: parseInt(data.createdAt, 10),
      lastActivityAt: parseInt(data.lastActivityAt, 10),
      hostName: data.hostName,
      branch: data.branch as Branch | undefined,
      headcount: data.headcount ? parseInt(data.headcount, 10) : undefined,
      cravingKey: data.cravingKey,
      recipeSourceDown: data.recipeSourceDown === '1' ? true : undefined,
      shoppingListId: data.shoppingListId,
    };

    if (data.locationLat && data.locationLng) {
      session.location = {
        latitude: parseFloat(data.locationLat),
        longitude: parseFloat(data.locationLng),
        address: data.locationAddress,
      };
    }
    if (data.searchRadiusMiles) {
      session.searchRadiusMiles = parseFloat(data.searchRadiusMiles);
    }

    return session;
  }

  /** Seconds until the session expires (-2 if it doesn't exist, -1 if no expiry). */
  async function getSessionTtl(sessionCode: string): Promise<number> {
    return await redis.ttl(sessionKey(sessionCode));
  }

  async function updateState(sessionCode: string, state: Session['state']): Promise<void> {
    await redis.hset(sessionKey(sessionCode), 'state', state);
  }

  async function deleteSession(sessionCode: string): Promise<void> {
    const participantIds = await redis.smembers(participantsKey(sessionCode));

    const pipeline = redis.pipeline();
    pipeline.del(sessionKey(sessionCode));
    pipeline.del(participantsKey(sessionCode));
    pipeline.del(displayNamesKey(sessionCode));
    pipeline.del(resultsKey(sessionCode));
    pipeline.del(restaurantIdsKey(sessionCode));
    pipeline.del(restaurantsKey(sessionCode));
    pipeline.del(orderKey(sessionCode));
    pipeline.del(orderLinesKey(sessionCode));
    participantIds.forEach((pid) => {
      pipeline.del(participantKey(pid));
      pipeline.del(selectionsKey(sessionCode, pid));
    });
    await pipeline.exec();
  }

  // --- Participants ------------------------------------------------------

  async function claimDisplayName(
    sessionCode: string,
    displayName: string,
    participantId: string,
    rejoinToken: string,
    previousParticipantId?: string
  ): Promise<boolean> {
    const previousOwner = previousParticipantId
      ? JSON.stringify([previousParticipantId, rejoinToken])
      : '';
    const nextOwner = JSON.stringify([participantId, rejoinToken]);
    const claimed = await redis.eval(
      CLAIM_DISPLAY_NAME_LUA,
      1,
      displayNamesKey(sessionCode),
      displayName,
      previousOwner,
      nextOwner,
      calculateExpireAt()
    );
    return claimed === 1;
  }

  /** Adds a Participant and returns the new participant set size. Touches TTL. */
  async function addParticipant(
    sessionCode: string,
    participant: {
      participantId: string;
      displayName: string;
      isHost?: boolean;
      rejoinToken?: string;
    }
  ): Promise<number> {
    const { participantId, displayName, isHost = false, rejoinToken } = participant;
    const now = Math.floor(Date.now() / 1000);

    const pipeline = redis.pipeline();
    pipeline.sadd(participantsKey(sessionCode), participantId);
    const participantData: Record<string, string | number> = {
      displayName,
      sessionCode,
      joinedAt: now,
      isHost: isHost ? '1' : '0',
      hasSubmitted: '0',
    };
    if (rejoinToken) participantData.rejoinToken = rejoinToken;
    pipeline.hset(participantKey(participantId), participantData);
    await pipeline.exec();

    await touch(sessionCode);
    return await redis.scard(participantsKey(sessionCode));
  }

  /** Removes a Participant and their Selections; returns the remaining count. */
  async function removeParticipant(sessionCode: string, participantId: string): Promise<number> {
    const participant = await getParticipant(participantId);
    const pipeline = redis.pipeline();
    pipeline.srem(participantsKey(sessionCode), participantId);
    pipeline.del(participantKey(participantId));
    pipeline.del(selectionsKey(sessionCode, participantId));
    await pipeline.exec();

    if (participant?.rejoinToken) {
      await redis.eval(
        RELEASE_DISPLAY_NAME_LUA,
        1,
        displayNamesKey(sessionCode),
        participant.displayName,
        JSON.stringify([participantId, participant.rejoinToken])
      );
    }

    return await redis.scard(participantsKey(sessionCode));
  }

  async function getParticipant(participantId: string): Promise<Participant | null> {
    const data = await redis.hgetall(participantKey(participantId));
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    return {
      participantId,
      displayName: data.displayName,
      sessionCode: data.sessionCode,
      joinedAt: parseInt(data.joinedAt, 10),
      hasSubmitted: data.hasSubmitted === '1',
      isHost: data.isHost === '1',
      rejoinToken: data.rejoinToken || undefined,
    };
  }

  async function listParticipants(sessionCode: string): Promise<Participant[]> {
    const participantIds = await redis.smembers(participantsKey(sessionCode));
    const participants: Participant[] = [];
    for (const pid of participantIds) {
      const participant = await getParticipant(pid);
      if (participant) {
        participants.push(participant);
      }
    }
    return participants;
  }

  async function isParticipant(sessionCode: string, participantId: string): Promise<boolean> {
    return (await redis.sismember(participantsKey(sessionCode), participantId)) === 1;
  }

  async function countParticipants(sessionCode: string): Promise<number> {
    return await redis.scard(participantsKey(sessionCode));
  }

  async function setParticipantCount(sessionCode: string, count: number): Promise<void> {
    await redis.hset(sessionKey(sessionCode), 'participantCount', count);
  }

  // --- Submissions -------------------------------------------------------

  /**
   * Records a Participant's Submission: stores their Selections (may be empty)
   * and marks them submitted. A Submission is a fact about the Participant,
   * not about how many Selections it contains.
   *
   * Throws ALREADY_SUBMITTED if the participant already has a Submission,
   * INVALID_RESTAURANTS if any place id isn't in the session's restaurant list.
   */
  async function recordSubmission(
    sessionCode: string,
    participantId: string,
    placeIds: string[]
  ): Promise<{ submittedCount: number; participantCount: number }> {
    const participant = await getParticipant(participantId);
    if (participant?.hasSubmitted) {
      throw new DomainError('ALREADY_SUBMITTED', 'You have already submitted your selections');
    }

    if (placeIds.length > 0) {
      const validPlaceIds = await redis.smembers(restaurantIdsKey(sessionCode));
      const invalid = placeIds.filter((id) => !validPlaceIds.includes(id));
      if (invalid.length > 0) {
        throw new DomainError('INVALID_RESTAURANTS', 'One or more selected options are invalid');
      }
    }

    const pipeline = redis.pipeline();
    if (placeIds.length > 0) {
      pipeline.sadd(selectionsKey(sessionCode, participantId), ...placeIds);
    }
    pipeline.hset(participantKey(participantId), 'hasSubmitted', '1');
    await pipeline.exec();

    await touch(sessionCode);

    const participants = await listParticipants(sessionCode);
    return {
      submittedCount: participants.filter((p) => p.hasSubmitted).length,
      participantCount: participants.length,
    };
  }

  /**
   * A Participant's Selections. Only the rejoin path needs this: it must copy the
   * set out before removeParticipant DELs it (see SessionService.joinSession).
   */
  async function readSelections(sessionCode: string, participantId: string): Promise<string[]> {
    return await redis.smembers(selectionsKey(sessionCode, participantId));
  }

  // --- Match -------------------------------------------------------------

  /**
   * Computes the Match (the Deck Entries every Participant selected) via SINTER,
   * stores it, and returns it with per-participant selections for transparency.
   */
  async function computeAndStoreResults(sessionCode: string): Promise<{
    overlappingOptions: DeckEntry[];
    allSelections: Record<string, string[]>;
    restaurantNames: Record<string, string>;
    hasOverlap: boolean;
  }> {
    const participants = await listParticipants(sessionCode);

    if (participants.length === 0) {
      return {
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
      };
    }

    const selectionKeys = participants.map((p) => selectionsKey(sessionCode, p.participantId));

    // Single participant: their selections are the Match
    const overlappingPlaceIds =
      selectionKeys.length === 1
        ? await redis.smembers(selectionKeys[0])
        : await redis.sinter(...selectionKeys);

    const overlappingOptions = (await readEntries(sessionCode, overlappingPlaceIds)).filter(
      (entry): entry is DeckEntry => entry !== null
    );

    // displayName -> selected placeIds, for the results screen
    const selections = await Promise.all(selectionKeys.map((key) => redis.smembers(key)));
    const allSelections: Record<string, string[]> = {};
    participants.forEach((p, i) => {
      allSelections[p.displayName] = selections[i];
    });

    // Names for every selected placeId (not just the Match)
    const restaurantNames: Record<string, string> = {};
    const allPlaceIds = [...new Set(Object.values(allSelections).flat())];
    const namedEntries = await readEntries(sessionCode, allPlaceIds);
    allPlaceIds.forEach((placeId, i) => {
      const entry = namedEntries[i];
      if (entry) {
        restaurantNames[placeId] = entry.name;
      }
    });

    // Store the Match; sentinel keeps the key alive under TTL when empty
    if (overlappingOptions.length > 0) {
      await redis.sadd(resultsKey(sessionCode), ...overlappingOptions.map((c) => c.placeId));
    } else {
      await redis.sadd(resultsKey(sessionCode), '__empty__');
    }

    await touch(sessionCode);

    return {
      overlappingOptions,
      allSelections,
      restaurantNames,
      hasOverlap: overlappingOptions.length > 0,
    };
  }

  /** Admits a Top Pick crowned on the empty-Match path into the results set. */
  async function addResultPlaceId(sessionCode: string, placeId: string): Promise<void> {
    await redis.sadd(resultsKey(sessionCode), placeId);
  }

  // --- Shopping List -----------------------------------------------------

  /**
   * Mint-once: HSETNX decides which completion mints, and the winner's id is
   * returned to every caller. A second completion therefore re-reads the first
   * list rather than re-pricing it — the whole point of "minted once" (#239).
   *
   * The claim is a pointer, and only as live as what it points at: a mint the
   * process never finished leaves nothing under that id, and the next
   * completion releases the claim rather than answering with it (#274).
   */
  async function claimShoppingListId(sessionCode: string, listId: string): Promise<string> {
    const won = await redis.hsetnx(sessionKey(sessionCode), 'shoppingListId', listId);
    if (won === 1) return listId;
    return (await redis.hget(sessionKey(sessionCode), 'shoppingListId')) ?? listId;
  }

  /**
   * Undoes a claim whose mint never landed, so the Session is not stuck
   * answering with a URL that will never resolve. Guarded on the id still
   * being ours: a claim already replaced is not this failure's to release.
   */
  async function releaseShoppingListId(sessionCode: string, listId: string): Promise<void> {
    const current = await redis.hget(sessionKey(sessionCode), 'shoppingListId');
    if (current === listId) await redis.hdel(sessionKey(sessionCode), 'shoppingListId');
  }

  // --- Restart -----------------------------------------------------------

  /**
   * Restart: wipes all Selections, Submissions, and the Match so the same
   * Participants can decide again; puts the session back in 'selecting'.
   */
  async function resetForRestart(sessionCode: string): Promise<void> {
    const participantIds = await redis.smembers(participantsKey(sessionCode));
    const wasComplete = (await redis.hget(sessionKey(sessionCode), 'state')) === 'complete';

    const pipeline = redis.pipeline();
    participantIds.forEach((pid) => {
      pipeline.del(selectionsKey(sessionCode, pid));
      pipeline.hset(participantKey(pid), 'hasSubmitted', '0');
    });
    pipeline.del(resultsKey(sessionCode));
    pipeline.del(orderKey(sessionCode));
    pipeline.del(orderLinesKey(sessionCode));
    // A Restart voids the crown, so it voids the Session's claim to have
    // minted for it: deciding again may crown a different Recipe, and the
    // list already minted must not be served as that one's. The minted list
    // is untouched — it has its own URL and its own clock, and anyone holding
    // the link keeps it.
    pipeline.hdel(sessionKey(sessionCode), 'shoppingListId');
    pipeline.hset(sessionKey(sessionCode), 'state', 'selecting');
    if (wasComplete) {
      // Session-outcome metrics: the next completion is a Restart's outcome
      pipeline.hset(sessionKey(sessionCode), 'restartedAfterComplete', '1');
    }
    await pipeline.exec();

    await touch(sessionCode);
  }

  /** True once a Restart has wiped a completed outcome (session-outcome metrics). */
  async function wasRestartedAfterComplete(sessionCode: string): Promise<boolean> {
    return (await redis.hget(sessionKey(sessionCode), 'restartedAfterComplete')) === '1';
  }

  // --- Deck --------------------------------------------------------------

  /**
   * Swaps the Session's Deck for a fresh deal — a Cook Restart (#260). The swap
   * is one MULTI so no reader ever sees the old ids against the new entries;
   * choosing the new deal is the caller's, and happens before this. An empty
   * deal is refused outright, since it would leave the Session unswipeable.
   */
  async function replaceDeck(sessionCode: string, entries: DeckEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const swap = redis.multi().del(restaurantIdsKey(sessionCode)).del(restaurantsKey(sessionCode));
    queueDeckWrite(swap, sessionCode, entries);
    await swap.exec();

    await touch(sessionCode);
  }

  /**
   * The Deck Entries under `placeIds`, in the same order, in one HMGET; null
   * where the entry data is absent. HMGET with no fields is an error, so the
   * empty case answers without a round trip.
   */
  async function readEntries(
    sessionCode: string,
    placeIds: string[]
  ): Promise<(DeckEntry | null)[]> {
    if (placeIds.length === 0) return [];
    const raws = await redis.hmget(restaurantsKey(sessionCode), ...placeIds);
    return raws.map((raw) => (raw ? (JSON.parse(raw) as DeckEntry) : null));
  }

  /** missingCount = place ids whose entry data is absent (data loss signal). */
  async function getDeck(
    sessionCode: string
  ): Promise<{ entries: DeckEntry[]; missingCount: number }> {
    const placeIds = await redis.smembers(restaurantIdsKey(sessionCode));
    const entries = (await readEntries(sessionCode, placeIds)).filter(
      (entry): entry is DeckEntry => entry !== null
    );
    return { entries, missingCount: placeIds.length - entries.length };
  }

  // --- Group Order -------------------------------------------------------

  /** The Group Order's raw hash, or null when none is open. */
  async function readOrder(sessionCode: string): Promise<Record<string, string> | null> {
    const data = await redis.hgetall(orderKey(sessionCode));
    return Object.keys(data).length > 0 ? data : null;
  }

  /** Field "{index}:{displayName}" -> qty, written by addLine (order:item). */
  async function readOrderLines(sessionCode: string): Promise<Record<string, string>> {
    return await redis.hgetall(orderLinesKey(sessionCode));
  }

  /** Writes the fixed metadata once and slides the session TTL forward. */
  async function openOrder(sessionCode: string, fields: Record<string, string>): Promise<void> {
    await redis.hset(orderKey(sessionCode), fields);
    await touch(sessionCode);
  }

  /**
   * Adds or removes one of `displayName`'s Order Lines; returns the resulting
   * qty. Deletes the field at zero — HINCRBY -1 on a missing field lands at -1
   * and is immediately HDEL'd, a no-op the caller detects via a negative return.
   * The field is "{index}:{displayName}"; readOrderLines' first-colon parse
   * keeps a displayName containing ':' unambiguous.
   */
  async function addLine(
    sessionCode: string,
    index: number,
    displayName: string,
    delta: 1 | -1
  ): Promise<number> {
    const field = `${index}:${displayName}`;
    const qty = await redis.hincrby(orderLinesKey(sessionCode), field, delta);
    if (qty <= 0) {
      await redis.hdel(orderLinesKey(sessionCode), field);
    }
    await touch(sessionCode);
    return qty;
  }

  /** The placeIds this Session may act on (the Match, plus the crown). */
  async function isResultPlaceId(sessionCode: string, placeId: string): Promise<boolean> {
    return (await redis.sismember(resultsKey(sessionCode), placeId)) === 1;
  }

  /**
   * First tap wins. HSETNX decides the Buyer; the HSET is unconditional because
   * the order ends 'locked' whichever tap won, so a loser re-setting it is a
   * no-op. Returns false when someone else already claimed it.
   * ponytail: MULTI, not Lua — two commands, one round trip, no lock. Lua only
   * if a future Buyer-transfer flow needs a compare-and-swap.
   */
  async function claimBuyer(sessionCode: string, displayName: string): Promise<boolean> {
    const key = orderKey(sessionCode);
    const res = await redis
      .multi()
      .hsetnx(key, 'buyer', displayName)
      .hset(key, 'state', 'locked')
      .exec();
    await touch(sessionCode);
    return res?.[0]?.[1] === 1;
  }

  /** Writes the Buyer's chosen delivery fee onto the order hash. */
  async function setFee(sessionCode: string, feeCents: number): Promise<void> {
    await redis.hset(orderKey(sessionCode), 'feeCents', String(feeCents));
    await touch(sessionCode);
  }

  return {
    sessionExists,
    createSession,
    readSession,
    getSessionTtl,
    updateState,
    deleteSession,
    claimDisplayName,
    addParticipant,
    removeParticipant,
    getParticipant,
    listParticipants,
    isParticipant,
    countParticipants,
    setParticipantCount,
    recordSubmission,
    readSelections,
    computeAndStoreResults,
    addResultPlaceId,
    claimShoppingListId,
    releaseShoppingListId,
    resetForRestart,
    wasRestartedAfterComplete,
    replaceDeck,
    getDeck,
    readOrder,
    readOrderLines,
    openOrder,
    addLine,
    isResultPlaceId,
    claimBuyer,
    setFee,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
