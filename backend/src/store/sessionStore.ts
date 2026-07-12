// SessionStore - the sole keeper of everything a live Session remembers.
// Owns every Redis key format and the session TTL; callers never build keys.
// See CONTEXT.md for the domain language (Session, Participant, Submission, Match).
//
// createSessionStore(redis) builds a store bound to any ioredis-compatible
// client (tests inject ioredis-mock); server.ts constructs the production
// instance.

import type { Redis } from 'ioredis';
import { DomainError } from '../services/DomainError.js';
import type { Participant, Restaurant, Session } from '@dinder/shared/types';

export const SESSION_TTL_SECONDS = 30 * 60;

// --- Keyspace (private) ------------------------------------------------
// session:{code}                     hash: session metadata
// session:{code}:participants       set:  participant ids
// session:{code}:{pid}:selections   set:  place ids a participant selected
// session:{code}:results            set:  the Match ('__empty__' sentinel keeps TTL on empty)
// session:{code}:restaurant_ids     set:  valid place ids for the session
// session:{code}:restaurants        hash: placeId -> Restaurant JSON
// participant:{pid}                 hash: participant metadata

const sessionKey = (code: string) => `session:${code}`;
const participantsKey = (code: string) => `session:${code}:participants`;
const selectionsKey = (code: string, pid: string) => `session:${code}:${pid}:selections`;
const resultsKey = (code: string) => `session:${code}:results`;
const restaurantIdsKey = (code: string) => `session:${code}:restaurant_ids`;
const restaurantsKey = (code: string) => `session:${code}:restaurants`;
const participantKey = (pid: string) => `participant:${pid}`;

// Atomically EXPIREAT every session-related key
const REFRESH_TTL_LUA = `
local expireAt = tonumber(ARGV[1])
for i = 1, #KEYS do
    redis.call('EXPIREAT', KEYS[i], expireAt)
end
return expireAt
`;

export function calculateExpireAt(): number {
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
  return sessionCode.length === 6 ? sessionCode : null;
}

export function createSessionStore(redis: Redis) {
  /**
   * Refresh TTL on every key belonging to a session and stamp lastActivityAt.
   * Called internally by every mutating operation - callers cannot forget it.
   */
  async function touch(sessionCode: string): Promise<number> {
    const expireAt = calculateExpireAt();
    const participantIds = await redis.smembers(participantsKey(sessionCode));

    const keys = [
      sessionKey(sessionCode),
      participantsKey(sessionCode),
      resultsKey(sessionCode),
      restaurantIdsKey(sessionCode),
      restaurantsKey(sessionCode),
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
      location?: { latitude: number; longitude: number; address?: string };
      searchRadiusMiles?: number;
      restaurants?: Restaurant[];
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

    if (opts.restaurants && opts.restaurants.length > 0) {
      pipeline.sadd(restaurantIdsKey(sessionCode), ...opts.restaurants.map((r) => r.placeId));
      const restaurantData: Record<string, string> = {};
      opts.restaurants.forEach((r) => {
        restaurantData[r.placeId] = JSON.stringify(r);
      });
      pipeline.hset(restaurantsKey(sessionCode), restaurantData);
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
    pipeline.del(resultsKey(sessionCode));
    pipeline.del(restaurantIdsKey(sessionCode));
    pipeline.del(restaurantsKey(sessionCode));
    participantIds.forEach((pid) => {
      pipeline.del(participantKey(pid));
      pipeline.del(selectionsKey(sessionCode, pid));
    });
    await pipeline.exec();
  }

  // --- Participants ------------------------------------------------------

  /** Adds a Participant and returns the new participant set size. Touches TTL. */
  async function addParticipant(
    sessionCode: string,
    participant: { participantId: string; displayName: string; isHost?: boolean }
  ): Promise<number> {
    const { participantId, displayName, isHost = false } = participant;
    const now = Math.floor(Date.now() / 1000);

    const pipeline = redis.pipeline();
    pipeline.sadd(participantsKey(sessionCode), participantId);
    pipeline.hset(participantKey(participantId), {
      displayName,
      sessionCode,
      joinedAt: now,
      isHost: isHost ? '1' : '0',
      hasSubmitted: '0',
    });
    await pipeline.exec();

    await touch(sessionCode);
    return await redis.scard(participantsKey(sessionCode));
  }

  /** Removes a Participant and their Selections; returns the remaining count. */
  async function removeParticipant(sessionCode: string, participantId: string): Promise<number> {
    const pipeline = redis.pipeline();
    pipeline.srem(participantsKey(sessionCode), participantId);
    pipeline.del(participantKey(participantId));
    pipeline.del(selectionsKey(sessionCode, participantId));
    await pipeline.exec();

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

  // --- Match -------------------------------------------------------------

  /**
   * Computes the Match (restaurants every Participant selected) via SINTER,
   * stores it, and returns it with per-participant selections for transparency.
   */
  async function computeAndStoreResults(sessionCode: string): Promise<{
    overlappingOptions: Restaurant[];
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

    // Single participant: their selections are the Match (FR-021)
    const overlappingPlaceIds =
      selectionKeys.length === 1
        ? await redis.smembers(selectionKeys[0])
        : await redis.sinter(...selectionKeys);

    const readRestaurant = async (placeId: string): Promise<Restaurant | null> => {
      const raw = await redis.hget(restaurantsKey(sessionCode), placeId);
      return raw ? (JSON.parse(raw) as Restaurant) : null;
    };

    const overlappingOptions: Restaurant[] = [];
    for (const placeId of overlappingPlaceIds) {
      const restaurant = await readRestaurant(placeId);
      if (restaurant) {
        overlappingOptions.push(restaurant);
      }
    }

    // displayName -> selected placeIds, for the results screen
    const allSelections: Record<string, string[]> = {};
    for (const p of participants) {
      allSelections[p.displayName] = await redis.smembers(
        selectionsKey(sessionCode, p.participantId)
      );
    }

    // Names for every selected placeId (not just the Match)
    const restaurantNames: Record<string, string> = {};
    const allPlaceIds = new Set(Object.values(allSelections).flat());
    for (const placeId of allPlaceIds) {
      const restaurant = await readRestaurant(placeId);
      if (restaurant) {
        restaurantNames[placeId] = restaurant.name;
      }
    }

    // Store the Match; sentinel keeps the key alive under TTL when empty
    if (overlappingOptions.length > 0) {
      await redis.sadd(resultsKey(sessionCode), ...overlappingOptions.map((r) => r.placeId));
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

  // --- Restart -----------------------------------------------------------

  /**
   * Restart: wipes all Selections, Submissions, and the Match so the same
   * Participants can decide again; puts the session back in 'selecting'.
   */
  async function resetForRestart(sessionCode: string): Promise<void> {
    const participantIds = await redis.smembers(participantsKey(sessionCode));

    const pipeline = redis.pipeline();
    participantIds.forEach((pid) => {
      pipeline.del(selectionsKey(sessionCode, pid));
      pipeline.hset(participantKey(pid), 'hasSubmitted', '0');
    });
    pipeline.del(resultsKey(sessionCode));
    pipeline.hset(sessionKey(sessionCode), 'state', 'selecting');
    await pipeline.exec();

    await touch(sessionCode);
  }

  // --- Restaurants -------------------------------------------------------

  /** missingCount = place ids whose restaurant data is absent (data loss signal). */
  async function getRestaurants(
    sessionCode: string
  ): Promise<{ restaurants: Restaurant[]; missingCount: number }> {
    const placeIds = await redis.smembers(restaurantIdsKey(sessionCode));
    const restaurants: Restaurant[] = [];
    for (const placeId of placeIds) {
      const raw = await redis.hget(restaurantsKey(sessionCode), placeId);
      if (raw) {
        restaurants.push(JSON.parse(raw) as Restaurant);
      }
    }
    return { restaurants, missingCount: placeIds.length - restaurants.length };
  }

  return {
    sessionExists,
    createSession,
    readSession,
    getSessionTtl,
    updateState,
    deleteSession,
    addParticipant,
    removeParticipant,
    getParticipant,
    listParticipants,
    isParticipant,
    countParticipants,
    setParticipantCount,
    recordSubmission,
    computeAndStoreResults,
    resetForRestart,
    getRestaurants,
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
