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
    title: 'Eating out',
    description: 'Find a table everyone’s into.',
    image: 'eatout',
    accent: 'border-[#c97052] bg-[#532b20]',
    to: '/create?branch=eatout',
  },
  {
    title: 'Getting takeaway',
    description: 'Pick dinner. Compare delivery.',
    image: 'takeaway',
    accent: 'border-[#c99b43] bg-[#463418]',
    to: '/create?branch=takeaway',
  },
  {
    title: 'Cooking',
    description: 'Choose a recipe. Share the shop.',
    image: 'cook',
    accent: 'border-[#84934d] bg-[#303c22]',
    to: '/cook',
  },
  {
    title: 'Watching a movie',
    description: 'Movies & series for your kind of night.',
    image: 'watch',
    accent: 'border-[#b66880] bg-[#482535]',
    to: '/watch',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
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
      <header className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4">
        <Link
          to="/"
          aria-label="Dinder home"
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-3 text-2xl font-black italic tracking-[-0.055em] text-coral-soft drop-shadow-[0_0_12px_rgb(255_56_88_/_0.7)]"
        >
          <span className="logo-mark" aria-hidden="true" />
          Dinder
        </Link>

        {isAuthenticated && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/friends')}
              className="relative min-h-[44px] min-w-[44px] rounded-full border border-cyan/40 bg-raised p-2.5 text-cyan shadow-[0_0_18px_rgb(53_231_255_/_0.12)]"
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
                <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs font-bold text-ink">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <UserMenu />
          </div>
        )}
      </header>

      <section className="mx-auto w-full max-w-6xl pb-6 pt-3 md:pt-12">
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

        <div className="grid items-center gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-12">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#ffc2a7]">
              A good night starts together
            </p>
            <h1 className="max-w-xl text-[clamp(2.4rem,7vw,4.5rem)] font-black leading-[1.02] tracking-[-0.055em] text-[#fff4e8]">
              Find something <span className="text-[#ffa586]">everyone’s into.</span>
            </h1>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-[#d8c9bf]">
              Get together. Swipe your favourites. Decide tonight.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
              <button
                onClick={() => navigate('/join')}
                className="min-h-[48px] rounded-xl bg-[#ffad8e] px-4 py-3 text-sm font-bold text-[#281814] transition-colors hover:bg-[#ffc6ae]"
              >
                Join with a code <span aria-hidden="true">↗</span>
              </button>
              <button
                onClick={() => navigate('/compare')}
                className="min-h-[48px] rounded-xl border border-[#ac8872] bg-[#2d211c] px-4 py-3 text-sm font-bold text-[#fff4e8] transition-colors hover:bg-[#443027]"
              >
                Compare delivery prices
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" aria-label="Choose your night">
            {BRANCH_CARDS.map((card) => (
              <button
                key={card.title}
                onClick={() => navigate(card.to)}
                className={`group overflow-hidden rounded-2xl border text-left transition-transform motion-safe:hover:-translate-y-1 ${card.accent}`}
              >
                <span className="block h-24 overflow-hidden sm:h-36 md:h-40" aria-hidden="true">
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
                <span className="block min-h-[92px] p-3 sm:p-4">
                  <span className="block text-base font-bold leading-tight text-[#fff8f0] sm:text-xl">
                    {card.title}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-[#f1e5da] sm:text-sm">
                    {card.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {!isLoading && !isAuthenticated && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#614c3c]/50 pt-5">
            <div className="w-full max-w-[260px]">
              <GoogleSignInButton />
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-[#d8c9bf]">
              Join as a guest, or sign in to invite your friends. No account needed to decide
              together.
            </p>
          </div>
        )}
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
