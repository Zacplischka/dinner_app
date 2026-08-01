// Creating a Session is the same sequence whatever Branch you picked: create
// it, connect, join as host, invite anyone you selected, then land in the
// lobby. Only the setup differs — a location and radius for Eat Out and
// Takeaway, a Craving and Headcount for Cook — so the pages own their forms
// and share this.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Branch, Craving, SessionLocation } from '@dinder/shared/types';
import { createSession } from '../services/apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { useFriendsStore } from '../stores/friendsStore';

export interface SessionSetup {
  location?: SessionLocation;
  searchRadiusMiles?: number;
  branch?: Branch;
  craving?: Craving;
  headcount?: number;
}

export function useCreateAndJoinSession() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const {
    setSessionCode,
    setLocation: setStoreLocation,
    setSearchRadiusMiles: setStoreRadius,
    setCurrentUserId,
    setConnectionStatus,
    setSessionStatus,
    resetSelections,
  } = useSessionStore();
  const { inviteFriendsToSession } = useFriendsStore();

  /**
   * Resolves to an error message when the Session could not be created or
   * joined, or null once the host has landed in the lobby. Callers render the
   * message; the hook owns the sequence.
   */
  async function createAndJoin(
    hostName: string,
    setup: SessionSetup,
    friendIds: Set<string>
  ): Promise<string | null> {
    setIsCreating(true);
    try {
      const [response, { waitForConnection, joinSession }] = await Promise.all([
        createSession(hostName, setup),
        import('../services/socketBindings'),
      ]);

      setSessionCode(response.sessionCode);
      if (setup.location) setStoreLocation(setup.location);
      if (setup.searchRadiusMiles !== undefined) setStoreRadius(setup.searchRadiusMiles);
      resetSelections();
      setSessionStatus('waiting');

      // Connect WebSocket and wait for connection, then join as host
      await waitForConnection();
      const ack = await joinSession(response.sessionCode, hostName);

      if (!ack.success) {
        setIsCreating(false);
        return ack.error.message;
      }

      setCurrentUserId(ack.data.participantId);
      setConnectionStatus(true);

      if (friendIds.size > 0) {
        await inviteFriendsToSession(response.sessionCode, Array.from(friendIds));
      }

      navigate(`/session/${response.sessionCode}`);
      return null;
    } catch (err: unknown) {
      setIsCreating(false);
      return err instanceof Error ? err.message : 'Failed to create session';
    }
  }

  return { createAndJoin, isCreating };
}
