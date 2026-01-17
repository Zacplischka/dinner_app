// Home page - Welcome screen with Create/Join options
// Based on: specs/001-dinner-decider-enables/tasks.md T051

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import GoogleSignInButton from '../components/GoogleSignInButton';
import UserMenu from '../components/UserMenu';

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { friendRequests, sessionInvites, fetchFriendRequests, fetchSessionInvites } = useFriendsStore();

  // Fetch friend requests and session invites when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchFriendRequests();
      fetchSessionInvites();
    }
  }, [isAuthenticated, fetchFriendRequests, fetchSessionInvites]);

  const notificationCount = friendRequests.length + sessionInvites.length;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-warm-gradient px-4 relative overflow-hidden">
      {/* Decorative ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber/5 rounded-full blur-3xl pointer-events-none" />

      {/* User menu and friends link in top right when authenticated */}
      {isAuthenticated && (
        <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
          {/* Friends link with notification badge */}
          <button
            onClick={() => navigate('/friends')}
            className="relative p-2.5 text-cream-400 hover:text-amber hover:bg-midnight-100 rounded-xl transition-all duration-300"
            title="Friends"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-midnight bg-amber rounded-full animate-pulse">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          <UserMenu />
        </div>
      )}

      <div className="w-full max-w-md space-y-10 text-center relative z-10 animate-fade-in">
        {/* Header with elegant typography */}
        <div className="space-y-4">
          {/* Decorative line */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-amber/50" />
            <span className="text-amber/60 text-sm tracking-[0.3em] uppercase font-medium">Est. 2024</span>
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-amber/50" />
          </div>

          <h1 className="text-5xl font-display font-semibold text-cream tracking-tight text-glow">
            Dinder
          </h1>
          <p className="text-lg text-cream-400 font-light tracking-wide">
            Find restaurants everyone agrees on
          </p>
        </div>

        {/* Auth section - show sign in or session buttons */}
        {!isLoading && !isAuthenticated ? (
          <div className="space-y-4">
            <GoogleSignInButton />
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-midnight-50/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-midnight text-cream-500 italic">
                  or continue as guest
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="space-y-4">
          <button
            onClick={() => navigate('/create')}
            className="w-full min-h-[52px] px-6 py-4 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg"
          >
            Create Session
          </button>

          <button
            onClick={() => navigate('/join')}
            className="w-full min-h-[52px] px-6 py-4 text-lg font-semibold text-amber bg-transparent rounded-xl hover:bg-amber/10 active:scale-[0.98] transition-all duration-300 border border-amber/40 hover:border-amber"
          >
            Join Session
          </button>
        </div>

        {/* Info text with elegant styling */}
        <div className="text-sm text-cream-500 space-y-3 pt-4">
          {isAuthenticated ? (
            <>
              <p className="flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 bg-success rounded-full" />
                Sessions linked to your account
              </p>
              <p>Invite friends directly when creating</p>
            </>
          ) : (
            <p className="italic">Sign in to save history & invite friends</p>
          )}
          <div className="flex items-center justify-center gap-6 pt-2 text-cream-500/80">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Up to 4
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Private votes
            </span>
          </div>
        </div>
      </div>

      {/* Bottom decorative element */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-cream-500/40 text-xs tracking-widest uppercase">
        <div className="w-8 h-px bg-cream-500/20" />
        <span>Gather & Decide</span>
        <div className="w-8 h-px bg-cream-500/20" />
      </div>
    </main>
  );
}