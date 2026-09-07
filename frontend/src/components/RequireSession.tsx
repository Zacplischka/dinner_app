// The guard on every /session/:sessionCode route (#403).
//
// A Session URL only means something to a phone that is actually in that
// Session: the Session Code lives in the store, and the store is per-tab
// sessionStorage. A Session URL copied out of the address bar and forwarded,
// cleared storage or a new browser therefore lands on a Session route with
// nothing behind it — an empty waiting room with a dead Start button, or an
// empty Deck. (The Invite Link itself is /join?code=…, so it never reaches
// this guard.) Join already handles the prefilled code, the name entry and
// an expired link, so send them there instead.
//
// The comparison is against the URL's code, not just "is there any Session":
// that also covers a link for a different Session opened in a tab already in
// one, and it makes a rejected rejoin redirect for free — socketBindings
// resets the store and toasts the server's reason, and this re-renders.

import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';

export default function RequireSession() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { pathname } = useLocation();
  const {
    sessionCode: storedSessionCode,
    sessionStatus,
    lobby,
    participants,
    currentUserId,
  } = useSessionStore();

  if (storedSessionCode !== sessionCode) {
    return <Navigate to={`/join?code=${encodeURIComponent(sessionCode ?? '')}`} replace />;
  }

  const lobbyPath = `/session/${sessionCode}`;
  const waitingParticipant = participants.find(
    (participant) => participant.participantId === currentUserId
  )?.waitingForNextRound;
  if (pathname !== lobbyPath && (waitingParticipant || (lobby && sessionStatus === 'waiting'))) {
    return <Navigate to={lobbyPath} replace />;
  }

  return <Outlet />;
}
