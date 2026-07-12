// Session service - Business logic for session lifecycle
// Based on: specs/001-dinner-decider-enables/plan.md
//
// createSessionService(deps) builds the service over an injected store and
// restaurant-search fn (tests pass fakes); the named exports below are the
// production instance bound to the real singletons.

import * as store from '../store/sessionStore.js';
import { getExpiresAtISO, type createSessionStore } from '../store/sessionStore.js';
import * as RestaurantSearchService from './RestaurantSearchService.js';
import type { Restaurant } from '@dinder/shared/types';

type SessionStore = ReturnType<typeof createSessionStore>;

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
      console.warn('Session code collision during createSession', {
        sessionCode,
        attempt: attempts + 1,
      });
      sessionCode = generateSessionCode();
      attempts++;
    }

    if (attempts >= MAX_ATTEMPTS) {
      console.error('Failed to generate unique session code', {
        attempts: MAX_ATTEMPTS,
      });
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
        console.warn('No restaurants found during session creation', {
          sessionCode,
          searchRadiusMiles,
        });
        throw new Error('NO_RESTAURANTS_FOUND');
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;

    console.log('Session created', {
      sessionCode,
      hasLocation: Boolean(location),
      searchRadiusMiles,
      participantCount: 1,
      restaurantCount: restaurants.length,
    });

    return {
      sessionCode,
      hostName,
      participantCount: 1,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink,
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
      console.warn('Session lookup returned invalid TTL', {
        sessionCode,
        ttl,
      });
      return null; // Session expired or doesn't exist
    }

    const expireAt = Math.floor(Date.now() / 1000) + ttl;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shareableLink = `${frontendUrl}/join?code=${sessionCode}`;

    return {
      sessionCode,
      hostName: hostName || 'Unknown Host',
      participantCount: session.participantCount,
      state: session.state,
      expiresAt: getExpiresAtISO(expireAt),
      shareableLink,
    };
  }

  /**
   * Join an existing session
   * Enforces 1-4 participant limit
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
  }> {
    // Check session exists
    const session = await store.readSession(sessionCode);
    if (!session) {
      console.warn('Rejected session join', {
        sessionCode,
        participantId,
        reason: 'session_not_found',
      });
      throw new Error('SESSION_NOT_FOUND');
    }

    // Check participant limit (FR-004, FR-005)
    // Use session.participantCount which includes the host who may not have joined yet
    if (session.participantCount >= 4) {
      console.warn('Rejected session join', {
        sessionCode,
        participantId,
        reason: 'session_full',
        participantCount: session.participantCount,
      });
      throw new Error('SESSION_FULL');
    }

    // Add participant (touches TTL and lastActivityAt)
    await store.addParticipant(sessionCode, { participantId, displayName });

    // Increment participant count
    const newCount = await store.incrementParticipantCount(sessionCode);

    console.log('Participant joined session', {
      sessionCode,
      participantId,
      participantCount: newCount,
    });

    return {
      participantId,
      sessionCode,
      participantName: displayName,
      participantCount: newCount,
    };
  }

  /**
   * Expire a session (cleanup)
   */
  async function expireSession(sessionCode: string): Promise<void> {
    await store.updateState(sessionCode, 'expired');
    await store.deleteSession(sessionCode);
    console.log('Expired session cleanup complete', {
      sessionCode,
    });
  }

  return { createSession, getSession, joinSession, expireSession };
}

// Production instance bound to the real store and Google Places caller -
// preserves the module's historical named exports so consumers don't change.
export const { createSession, getSession, joinSession, expireSession } = createSessionService({
  store,
  searchNearbyRestaurants: (...args) => RestaurantSearchService.searchNearbyRestaurants(...args),
});
