import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GoogleSignInButton from '../components/GoogleSignInButton';
import UserMenu from '../components/UserMenu';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';

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

      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 py-8 md:min-h-[calc(100vh-5rem)] md:grid-cols-[1.1fr_0.9fr] md:py-14">
        <div className="animate-fade-in">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-surface/80 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.06em] text-cyan">
            <span className="live-dot" aria-hidden="true" />
            Tonight · Melbourne
          </div>

          <h1 className="mb-6 max-w-3xl text-[clamp(3.5rem,15vw,7.6rem)] font-black leading-[0.84] tracking-[-0.075em] text-text">
            Find a place <span className="neon-outline block italic">everyone likes.</span>
          </h1>

          <p className="mb-7 max-w-xl text-base leading-relaxed text-text/80 sm:text-lg">
            Start a dinner session, invite your people, then swipe the same nearby restaurants until
            the whole group agrees.
          </p>

          <div className="mb-8 flex items-center gap-3">
            <div className="flex pl-2" aria-label="Four friends active tonight">
              {[
                ['YO', 'border-coral'],
                ['MA', 'border-violet'],
                ['JO', 'border-cyan'],
                ['SA', 'border-lime'],
              ].map(([initials, border], index) => (
                <span
                  key={initials}
                  className={`grid h-11 w-11 place-items-center rounded-full border-2 ${border} bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-black text-white shadow-card ${index ? '-ml-2' : ''}`}
                >
                  {initials}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted">
              <strong className="block text-text">4 friends are hungry</strong>
              Start the hunt together.
            </p>
          </div>

          <div className="grid gap-3 sm:flex">
            <button
              onClick={() => navigate('/create')}
              className="btn btn-primary min-h-[58px] px-6 text-base"
            >
              <span aria-hidden="true">＋</span> Create Session
            </button>
            <button
              onClick={() => navigate('/join')}
              className="btn btn-secondary min-h-[58px] px-6 text-base"
            >
              <span aria-hidden="true">⌁</span> Join with code
            </button>
            <button
              onClick={() => navigate('/compare')}
              aria-label="Compare delivery prices"
              className="btn btn-ghost min-h-[58px] px-6 text-base"
            >
              Compare prices
            </button>
          </div>

          {!isLoading && !isAuthenticated && (
            <div className="mt-6 max-w-xs space-y-3">
              <GoogleSignInButton />
              <p className="text-xs text-muted">
                Sign in to save history & invite friends, or continue as a guest.
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-6 text-xs text-muted">
            <span>Up to 4</span>
            <span>Private votes</span>
          </div>
        </div>

        <div
          className="relative hidden min-h-[570px] place-items-center md:grid"
          aria-label="Restaurant recommendation preview"
        >
          <div className="absolute inset-8 rotate-2 rounded-[48%_52%_42%_58%] border border-coral-soft/40 bg-gradient-to-br from-coral/20 via-surface to-cyan/10 shadow-glow-coral" />
          <article className="relative z-10 mt-20 w-[min(88%,390px)] -rotate-2 overflow-hidden rounded-market-lg border border-line bg-surface/95 shadow-card">
            <img
              src="/images/ramen-ichiban.jpg"
              alt="Ramen Ichiban"
              className="h-64 w-full object-cover"
            />
            <div className="p-5">
              <h2 className="text-2xl font-black text-text">Ramen Ichiban</h2>
              <p className="mb-3 text-sm font-bold text-coral-soft">Japanese ramen</p>
              <p className="flex gap-4 text-sm text-text/80">
                <span className="text-amber">★ 4.6</span>
                <span>$$</span>
                <span>Open until 11</span>
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
