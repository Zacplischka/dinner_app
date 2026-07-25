import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { leaveSession } from '../services/socketBindings';
import { useSessionStore } from '../stores/sessionStore';

/**
 * The Leave Session action shared by Selection, Group Order, Results, and the
 * Session Lobby: tell the server, then go home either way.
 *
 * The catch resets the store itself because leaveSession only resets after its
 * ack resolves — a synchronous socket.emit throw skips that, and would strand a
 * user who has already navigated home with a dirty Session and Group Order
 * store. Without a session code there is nothing to tell the server, so it just
 * navigates.
 */
export function useLeaveSession(sessionCode: string | undefined): () => Promise<void> {
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      if (sessionCode) await leaveSession(sessionCode);
    } catch (err) {
      console.error('Failed to leave session:', err);
      useSessionStore.getState().resetSession();
    }
    navigate('/');
  }, [sessionCode, navigate]);
}
