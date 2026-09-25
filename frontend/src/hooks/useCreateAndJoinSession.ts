// Creating a Session is the same sequence whatever Branch you picked: create
// it, connect, join as host, then land in the lobby, where everyone settles
// the choices together.

import { beginSessionIntent, isSessionIntentCurrent } from '../services/sessionIntent';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { isApiError, type ApiError, type CreateSessionRequest } from '@dinder/shared/types';
import { createSession } from '../services/apiClient';

export function useCreateAndJoinSession() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  /**
   * Resolves to the failure when the Session could not be created or joined, or
   * null once the host has landed in the lobby. Callers render its message; the
   * code is there for the few failures a screen can do something about
   * (DISPLAY_NAME_TAKEN asks for a different name).
   */
  async function createAndJoin(
    hostName: string,
    setup: Omit<CreateSessionRequest, 'hostName'>
  ): Promise<ApiError | null> {
    const intent = beginSessionIntent();
    setIsCreating(true);
    try {
      // The socket handshake overlaps POST /sessions rather than following it (#518).
      const [response, { joinSession }] = await Promise.all([
        createSession(hostName, setup),
        import('../services/socketBindings').then(async (socket) => {
          await socket.waitForConnection();
          return socket;
        }),
      ]);

      if (!isSessionIntentCurrent(intent)) return null;
      const ack = await joinSession(response.sessionCode, hostName, false, intent);
      if (!isSessionIntentCurrent(intent)) return null;

      if (!ack.success) {
        setIsCreating(false);
        return ack.error;
      }

      // Reset before navigating too: today navigate() unmounts the setup page
      // immediately, but a caller that stays mounted (a modal, say) would
      // otherwise be left with its submit button disabled forever.
      setIsCreating(false);
      // Replace, so browser Back skips the setup page instead of re-running create (#510).
      navigate(`/session/${response.sessionCode}`, { replace: true });
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
