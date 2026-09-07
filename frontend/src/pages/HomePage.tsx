import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import GoogleSignInButton from '../components/GoogleSignInButton';
import ConfirmLeaveModal from '../components/ConfirmLeaveModal';
import { getSession, ApiClientError } from '../services/apiClient';
import { useLeaveSession } from '../hooks/useLeaveSession';
import { useSessionStore } from '../stores/sessionStore';
import UserMenu from '../components/UserMenu';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';

const BRANCH_CARDS = [
  {
    title: 'Eat out',
    description: 'Find somewhere you’re into.',
    image: 'eatout',
    to: '/create?branch=eatout',
  },
  {
    title: 'Order in',
    description: 'Pick takeaway together.',
    image: 'takeaway',
    to: '/create?branch=takeaway',
  },
  {
    title: 'Cook together',
    description: 'Choose a recipe. Share the shop.',
    image: 'cook',
    to: '/cook',
  },
  {
    title: 'Watch something',
    description: 'Movies & series for your kind of night.',
    image: 'watch',
    to: '/watch',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  function startSession(path: string) {
    // New rounds move to YupCrew; existing participants keep their old-origin state.
    if (['dinder.it.com', 'www.dinder.it.com'].includes(window.location.hostname)) {
      window.location.assign(`https://yupcrew.com${path}`);
    } else {
      navigate(path);
    }
  }
  const { sessionCode, sessionStatus } = useSessionStore();
  const [returnError, setReturnError] = useState('');
  const [returning, setReturning] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leaveSession = useLeaveSession(sessionCode ?? undefined);
  const activeSession = sessionCode && sessionStatus !== 'expired';

  async function refreshSession(code: string) {
    const priorStatus = useSessionStore.getState().sessionStatus;
    try {
      const session = await getSession(code);
      const store = useSessionStore.getState();
      if (store.sessionCode !== code) return false;
      if (session.state === 'expired') {
        store.resetSession();
        setReturnError('Your previous session has expired. Start a new one below.');
        return false;
      }
      store.setExpiresAt(session.expiresAt);
      if (session.lobby) store.setLobby(session.lobby);
      else if (
        store.sessionStatus === priorStatus &&
        (session.state === 'waiting' ||
          session.state === 'selecting' ||
          session.state === 'complete')
      ) {
        store.setSessionStatus(session.state);
      }
      return true;
    } catch (error) {
      if (useSessionStore.getState().sessionCode !== code) return false;
      if (error instanceof ApiClientError && (error.status === 404 || error.status === 410)) {
        useSessionStore.getState().resetSession();
        setReturnError('Your previous session has expired. Start a new one below.');
      } else {
        setReturnError('Could not check your session. Try returning again when connected.');
      }
      return false;
    }
  }

  useEffect(() => {
    if (sessionCode && sessionStatus !== 'expired') void refreshSession(sessionCode);
    // Refresh when arriving home. Socket events keep subsequent changes current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  async function returnToSession() {
    if (!sessionCode || returning) return;
    setReturning(true);
    setReturnError('');
    if (await refreshSession(sessionCode)) navigate(`/session/${sessionCode}`);
    setReturning(false);
  }
  const { isAuthenticated, isLoading } = useAuthStore();
  const { friendRequests, sessionInvites, fetchFriendRequests, fetchSessionInvites } =
    useFriendsStore();

  useEffect(() => {
    if (isAuthenticated) {
      void fetchFriendRequests();
      void fetchSessionInvites();
    }
  }, [isAuthenticated, fetchFriendRequests, fetchSessionInvites]);

  const notificationCount = friendRequests.length + sessionInvites.length;

  return (
    <main className="home-backdrop min-h-screen px-4 pb-6">
      <header className="mx-auto flex min-h-16 w-full max-w-5xl items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="YupCrew home"
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 text-2xl font-black tracking-[-0.055em] text-text"
        >
          <span className="logo-mark" aria-hidden="true" />
          yupcrew
        </Link>

        {isAuthenticated && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/friends')}
              className="relative min-h-[44px] min-w-[44px] rounded-full border border-line bg-surface p-2.5 text-text"
              aria-label="Friends"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {notificationCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs font-bold text-text">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <UserMenu />
          </div>
        )}
      </header>

      <section className="mx-auto w-full max-w-5xl pb-6 pt-3 md:pt-12">
        {activeSession && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-cyan/50 bg-raised p-3">
            <button
              onClick={() => void returnToSession()}
              disabled={returning}
              className="btn btn-secondary flex-1"
            >
              {returning ? 'Checking your session…' : 'Return to session'}
              {!returning && <span className="ml-2 font-mono text-sm">{sessionCode}</span>}
            </button>
            <button
              onClick={() => setConfirmLeave(true)}
              className="min-h-[44px] px-3 text-sm text-muted underline underline-offset-4"
            >
              Leave session
            </button>
          </div>
        )}
        {returnError && (
          <p role="status" className="mb-4 rounded-xl bg-raised p-3 text-sm text-amber">
            {returnError}
          </p>
        )}

        <div className="grid items-center gap-6 md:grid-cols-[1fr_1fr] md:gap-16">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-wide text-muted">
              A good night starts together
            </p>
            <h1 className="max-w-xl text-[clamp(2.25rem,7vw,4.5rem)] font-black leading-[1.04] tracking-[-0.055em] text-text">
              What are we doing tonight?
            </h1>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-muted">
              Pick somewhere to eat, something to cook, or something to watch—with your people.
            </p>
            <p className="mt-4 hidden text-sm text-muted md:block">Everyone gets a say.</p>
          </div>

          <div>
            <div className="grid gap-3" aria-label="Choose your night">
              {BRANCH_CARDS.map((card) => (
                <button
                  key={card.title}
                  onClick={() => startSession(card.to)}
                  className="group flex min-h-[88px] w-full items-center overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card transition-all hover:border-coral motion-safe:hover:-translate-y-0.5"
                >
                  <span
                    className="block h-24 w-24 shrink-0 overflow-hidden bg-raised sm:w-32"
                    aria-hidden="true"
                  >
                    <img
                      src={`/images/tonight-${card.image}.webp`}
                      alt=""
                      width="1536"
                      height="1024"
                      className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                  </span>
                  <span className="flex-1 px-3 py-2 sm:px-4">
                    <span className="block text-base font-bold leading-tight text-text sm:text-lg">
                      {card.title}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">
                      {card.description}
                    </span>
                  </span>
                  <span className="pr-3 text-xl text-text" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => navigate('/join')} className="btn btn-secondary mt-4 w-full">
              Join with a code
            </button>
            <button
              onClick={() => navigate('/compare')}
              className="mt-1 min-h-[44px] w-full text-sm font-medium text-muted underline underline-offset-4 hover:text-text"
            >
              Compare delivery prices
            </button>
            <p className="text-center text-xs text-muted">No download. No account needed.</p>
          </div>
        </div>

        {!isLoading && !isAuthenticated && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <div className="w-full max-w-[260px]">
              <GoogleSignInButton />
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-muted">
              Sign in to keep your friends close, or carry on as a guest.
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted">
          Dinder is now YupCrew. Same app. A new look.
        </p>
      </section>
      <ConfirmLeaveModal
        isOpen={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          void leaveSession();
        }}
        context="lobby"
      />
    </main>
  );
}
