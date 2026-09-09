// Creating a Session is the same sequence whatever Branch you picked: create
// it, connect, join as host, invite anyone you selected, then land in the
// lobby. Only the setup differs — a location and radius for Eat Out and
// Takeaway, a Craving and Headcount for Cook, a Mood for Watch — so the pages
// own their forms and share this.

import { beginSessionIntent, isSessionIntentCurrent } from '../services/sessionIntent';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  isApiError,
  type ApiError,
  type Branch,
  type Craving,
  type Mood,
  type SessionLocation,
} from '@dinder/shared/types';
import { createSession } from '../services/apiClient';
import { useSessionStore } from '../stores/sessionStore';
import { useFriendsStore } from '../stores/friendsStore';
import { toast } from './useToast';

interface SessionSetup {
  collaborative?: boolean;
  location?: SessionLocation;
  searchRadiusMiles?: number;
  branch?: Branch;
  craving?: Craving;
  headcount?: number;
  mood?: Mood;
  /** How many cards the Host asked to swipe (#415); the Branch's default when absent. */
  deckSize?: number;
}

export function useCreateAndJoinSession() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const { setLocation: setStoreLocation, setSearchRadiusMiles: setStoreRadius } = useSessionStore();
  const { inviteFriendsToSession } = useFriendsStore();

  /**
   * Resolves to the failure when the Session could not be created or joined, or
   * null once the host has landed in the lobby. Callers render its message; the
   * code is there for the few failures a screen can do something about — the
   * zero-Recipe refusal Cook setup answers with a Nearest Craving (#334).
   */
  async function createAndJoin(
    hostName: string,
    setup: SessionSetup,
    friendIds: Set<string>
  ): Promise<ApiError | null> {
    const intent = beginSessionIntent();
    setIsCreating(true);
    try {
      const [response, { waitForConnection, joinSession }] = await Promise.all([
        createSession(hostName, setup),
        import('../services/socketBindings'),
      ]);

      // Connect WebSocket and wait for connection, then join as host
      await waitForConnection();
      if (!isSessionIntentCurrent(intent)) return null;
      const ack = await joinSession(response.sessionCode, hostName, false, intent);
      if (!isSessionIntentCurrent(intent)) return null;

      if (!ack.success) {
        setIsCreating(false);
        return ack.error;
      }

      if (setup.location) setStoreLocation(setup.location);
      if (setup.searchRadiusMiles !== undefined) setStoreRadius(setup.searchRadiusMiles);

      // The Session is already the Host's; failing invites only cost them the
      // shortcut, so say so and point at the Session Code rather than blocking.
      if (
        friendIds.size > 0 &&
        !(await inviteFriendsToSession(response.sessionCode, [...friendIds]))
      ) {
        if (!isSessionIntentCurrent(intent)) return null;
        toast.error(
          `Couldn't invite your friends. Share the code ${response.sessionCode} so they can join.`
        );
      }

      if (!isSessionIntentCurrent(intent)) return null;

      // Reset before navigating too: today navigate() unmounts the setup page
      // immediately, but a caller that stays mounted (a modal, say) would
      // otherwise be left with its submit button disabled forever.
      setIsCreating(false);
      navigate(`/session/${response.sessionCode}`);
      return null;
    } catch (err: unknown) {
      if (!isSessionIntentCurrent(intent)) return null;
      setIsCreating(false);
      // An ApiClientError carries the public code the backend sent (#104); a
      // transport failure carries none, and `isApiError` is what tells them
      // apart rather than a second `instanceof` here.
      const message = err instanceof Error ? err.message : 'Failed to create session';
      const failure = { code: (err as { code?: unknown } | null)?.code, message };
      return isApiError(failure) ? failure : { code: 'UNKNOWN', message };
    } finally {
      setIsCreating(false);
    }
  }

  return { createAndJoin, isCreating };
}
