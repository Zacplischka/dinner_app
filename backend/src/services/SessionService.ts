// Session service - Business logic for session lifecycle
// Based on: specs/001-dinner-decider-enables/plan.md
//
// createSessionService(deps) builds the service over an injected store and
// restaurant-search fn (tests pass fakes); sessionService below is the
// production instance bound to the real singletons.

import { logger } from '../logger.js';
import { shareableLink } from '../config/index.js';
import { getExpiresAtISO, sessionStore, type SessionStore } from '../store/sessionStore.js';
import * as RestaurantSearchService from './RestaurantSearchService.js';
import { DomainError } from './DomainError.js';
import type { Restaurant } from '@dinder/shared/types';

/** Maximum participants per session, including the reserved host slot (FR-004, FR-005). */
export const MAX_PARTICIPANTS = 4;

interface SessionServiceDeps {
  store: SessionStore;
  searchNearbyRestaurants: typeof RestaurantSearchService.searchNearbyRestaurants;
}

/**
 * Generate a unique 6-character alphanumeric session code (uppercase)
 */
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createSessionService({ store, searchNearbyRestaurants }: SessionServiceDeps) {
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
    searchRadiusMiles?: number
  ): Promise<{
    sessionCode: string;
    hostName: string;
    participantCount: number;
    state: string;
    expiresAt: string;
    shareableLink: string;
    location?: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    searchRadiusMiles?: number;
    restaurantCount?: number;
  }> {
    // Generate unique session code
    let sessionCode = generateSessionCode();
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    // Ensure uniqueness (extremely unlikely to collide, but good practice)
    while (attempts < MAX_ATTEMPTS) {
      if (!(await store.sessionExists(sessionCode))) break;
      logger.warn({
        sessionCode,
        attempt: attempts + 1,
      }, 'Session code collision during createSession');
      sessionCode = generateSessionCode();
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      logger.error({
        attempts: MAX_ATTEMPTS,
      }, 'Failed to generate unique session code');
      throw new Error('Failed to generate unique session code');
    }

    // Search for nearby restaurants if location is provided
    let restaurants: Restaurant[] = [];
    if (location && searchRadiusMiles) {
      // Convert miles to meters (1 mile = 1609.34 meters)
      const radiusMeters = searchRadiusMiles * 1609.34;

      restaurants = await searchNearbyRestaurants({
        latitude: location.latitude,
        longitude: location.longitude,
        radiusMeters,
        maxResults: 20, // Google Places API (New) max is 20
      });

      // Throw error if no restaurants found
      if (restaurants.length === 0) {
        logger.warn({
          sessionCode,
          searchRadiusMiles,
        }, 'No restaurants found during session creation');
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
      restaurants,
    });

    // Generate shareable link


    logger.info({
      sessionCode,
      hasLocation: Boolean(location),
      searchRadiusMiles,
      participantCount: 1,
      restaurantCount: restaurants.length,
    }, 'Session created');

    return {
      sessionCode,
      hostName,
      participantCount: 1,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink: shareableLink(sessionCode),
      location,
      searchRadiusMiles,
      restaurantCount: restaurants.length,
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
      logger.warn({
        sessionCode,
        ttl,
      }, 'Session lookup returned invalid TTL');
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
    displayName: string
  ): Promise<{
    participantId: string;
    sessionCode: string;
    participantName: string;
    participantCount: number;
    isHost: boolean;
    isRejoin: boolean;
    participants: { participantId: string; displayName: string; isHost: boolean }[];
  }> {
    // Check session exists
    const session = await store.readSession(sessionCode);
    if (!session) {
      logger.warn({
        sessionCode,
        participantId,
        reason: 'session_not_found',
      }, 'Rejected session join');
      throw new DomainError('SESSION_NOT_FOUND', `Session ${sessionCode} not found or has expired`);
    }

    const existing = await store.listParticipants(sessionCode);
    const hostPresent = existing.some((p) => p.isHost);
    const prior = existing.find((p) => p.displayName === displayName);

    let isHost: boolean;
    const isRejoin = Boolean(prior);

    if (prior) {
      // Rejoin: replace the old entry, preserving host status
      isHost = prior.isHost;
      await store.removeParticipant(sessionCode, prior.participantId);
    } else {
      isHost = !hostPresent && displayName === session.hostName;
    }

    // The host slot stays reserved in the count until the host claims it
    const reservedHostSlot = hostPresent || isHost ? 0 : 1;

    if (!prior) {
      // Check participant limit (FR-004, FR-005)
      if (existing.length + reservedHostSlot >= MAX_PARTICIPANTS) {
        logger.warn({
          sessionCode,
          participantId,
          reason: 'session_full',
          participantCount: existing.length + reservedHostSlot,
        }, 'Rejected session join');
        throw new DomainError(
          'SESSION_FULL',
          `Session is full (maximum ${MAX_PARTICIPANTS} participants)`
        );
      }
    }

    // Add participant (touches TTL and lastActivityAt)
    const setSize = await store.addParticipant(sessionCode, { participantId, displayName, isHost });

    // Re-check after adding to close the check-then-add race. Rejoins are
    // exempt: they're net-zero in isolation, and a concurrent join landing
    // inside a rejoin's remove/add window may transiently exceed the cap -
    // an accepted trade-off over kicking out a legitimately-rejoining
    // participant.
    if (!prior && setSize + reservedHostSlot > MAX_PARTICIPANTS) {
      await store.removeParticipant(sessionCode, participantId);
      logger.warn({
        sessionCode,
        participantId,
        reason: 'session_full_after_add',
        participantCount: setSize + reservedHostSlot,
      }, 'Rejected session join');
      throw new DomainError(
        'SESSION_FULL',
        `Session is full (maximum ${MAX_PARTICIPANTS} participants)`
      );
    }

    // Sole participantCount writer: set size plus the reserved host slot
    const participantCount = setSize + reservedHostSlot;
    await store.setParticipantCount(sessionCode, participantCount);

    const participants = await store.listParticipants(sessionCode);

    logger.info({
      sessionCode,
      participantId,
      participantCount,
    }, 'Participant joined session');

    return {
      participantId,
      sessionCode,
      participantName: displayName,
      participantCount,
      isHost,
      isRejoin,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        isHost: p.isHost,
      })),
    };
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
    results?: Awaited<ReturnType<SessionStore['computeAndStoreResults']>>;
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
    const results = await store.computeAndStoreResults(sessionCode);
    await store.updateState(sessionCode, 'complete');
    logger.info({ sessionCode, hasOverlap: results.hasOverlap }, 'Session complete');

    return { submittedCount, participantCount, results };
  }

  /**
   * Expire a session (cleanup)
   */
  async function expireSession(sessionCode: string): Promise<void> {
    await store.updateState(sessionCode, 'expired');
    await store.deleteSession(sessionCode);
    logger.info({
      sessionCode,
    }, 'Expired session cleanup complete');
  }

  return { createSession, getSession, joinSession, submitSelections, expireSession };
}

export type SessionService = ReturnType<typeof createSessionService>;

// Production instance bound to the real store and Google Places caller.
export const sessionService = createSessionService({
  store: sessionStore,
  searchNearbyRestaurants: (...args) => RestaurantSearchService.searchNearbyRestaurants(...args),
});
