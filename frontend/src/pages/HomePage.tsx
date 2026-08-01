// The entry fork (#255): `/` asks the only question that matters — "Tonight
// you're…" — with a Branch card per kind of night. Eat Out and Takeaway route
// into the existing create flow with their Branch; Cook routes to the
// not-yet-available screen until Cook setup lands. Join-with-code and Compare
// are demoted to a text row. There is no solo/group question: a Session starts
// as yours and becomes a group when you invite someone.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GoogleSignInButton from '../components/GoogleSignInButton';
import UserMenu from '../components/UserMenu';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';

const BRANCH_CARDS = [
  {
    title: 'Eating out',
    description: 'Swipe nearby restaurants until the group agrees.',
    icon: '🍽️',
    accent: 'border-coral/40 hover:border-coral shadow-[0_0_18px_rgb(255_56_88_/_0.12)]',
    to: '/create?branch=eatout',
  },
  {
    title: 'Getting takeaway',
    description: 'Pick a place together, then compare delivery prices.',
    icon: '🥡',
    accent: 'border-cyan/40 hover:border-cyan shadow-[0_0_18px_rgb(53_231_255_/_0.12)]',
    to: '/create?branch=takeaway',
  },
  {
    title: 'Cooking',
    description: 'Swipe recipes, then split the shopping list.',
    icon: '🍳',
    accent: 'border-lime/40 hover:border-lime shadow-[0_0_18px_rgb(163_230_53_/_0.12)]',
    to: '/cook',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
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
    <main className="market-backdrop min-h-screen px-4 pb-16">
      <header className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-4">
        <a
          href="/"
          aria-label="Dinder home"
          className="inline-flex items-center gap-3 text-2xl font-black italic tracking-[-0.055em] text-coral-soft drop-shadow-[0_0_12px_rgb(255_56_88_/_0.7)]"
        >
          <span className="logo-mark" aria-hidden="true" />
          Dinder
        </a>

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
                <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </button>
            <UserMenu />
          </div>
        )}
      </header>

      <section className="mx-auto w-full max-w-2xl py-10 md:py-16 animate-fade-in">
        <h1 className="mb-10 text-[clamp(2.8rem,10vw,5rem)] font-black leading-[0.9] tracking-[-0.06em] text-text">
          Tonight <span className="neon-outline italic">you&rsquo;re&hellip;</span>
        </h1>

        <div className="grid gap-4">
          {BRANCH_CARDS.map((card) => (
            <button
              key={card.title}
              onClick={() => navigate(card.to)}
              className={`flex items-center gap-5 rounded-market-lg border bg-surface/95 p-5 text-left transition-colors ${card.accent}`}
            >
              <span className="text-4xl" aria-hidden="true">
                {card.icon}
              </span>
              <span>
                <span className="block text-2xl font-black text-text">{card.title}</span>
                <span className="block text-sm text-muted">{card.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <button
            onClick={() => navigate('/join')}
            className="inline-flex min-h-[44px] items-center text-cyan underline-offset-4 hover:underline"
          >
            Join with a code
          </button>
          <button
            onClick={() => navigate('/compare')}
            aria-label="Compare delivery prices"
            className="inline-flex min-h-[44px] items-center text-muted underline-offset-4 hover:underline"
          >
            Compare delivery prices
          </button>
        </div>

        {!isLoading && !isAuthenticated && (
          <div className="mt-10 max-w-xs space-y-3">
            <GoogleSignInButton />
            <p className="text-xs text-muted">
              Sign in to save history & invite friends, or continue as a guest.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
