// TopNav Component
// Unified navigation bar for discovery pages (Home, Explore, Guides, etc.)

import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';

// Google Sign In Button (compact version for nav)
function GoogleSignInButton() {
  const { signInWithGoogle, isLoading } = useAuthStore();

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Failed to sign in:', error);
    }
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-midnight bg-cream rounded-xl hover:bg-cream-100 active:scale-[0.98] transition-all shadow-sm border border-cream-200/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {isLoading ? '...' : 'Sign In'}
    </button>
  );
}

// User Profile Button (shows when authenticated)
function UserProfileButton() {
  const { user, signOut, isLoading } = useAuthStore();

  if (!user) return null;

  const avatarUrl = user.user_metadata?.avatar_url;
  const displayName = user.user_metadata?.full_name || user.email || 'User';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
  };

  return (
    <div className="flex items-center gap-3 p-2 bg-midnight-100 rounded-xl shadow-card border border-midnight-50/30">
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-amber/30" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center text-midnight font-medium shadow-glow">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-cream font-medium truncate max-w-[120px] hidden sm:block">
        {displayName}
      </span>
      <button
        onClick={handleSignOut}
        disabled={isLoading}
        className="text-sm text-cream-500 hover:text-amber transition-colors disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}

export interface TopNavProps {
  /** Show back button */
  showBackButton?: boolean;
  /** Custom back handler (defaults to navigate(-1)) */
  onBack?: () => void;
  /** Show the Dinder logo/home link */
  showLogo?: boolean;
  /** Show friends button with notification badge */
  showFriendsButton?: boolean;
  /** Show auth buttons (sign in / profile) */
  showAuth?: boolean;
  /** Optional right-side action element */
  rightAction?: ReactNode;
  /** Make the nav transparent (for hero sections) */
  transparent?: boolean;
}

export default function TopNav({
  showBackButton = false,
  onBack,
  showLogo = true,
  showFriendsButton = true,
  showAuth = true,
  rightAction,
  transparent = false,
}: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { friendRequests, sessionInvites } = useFriendsStore();

  const notificationCount = friendRequests.length + sessionInvites.length;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300 ${
        transparent
          ? 'bg-transparent border-transparent'
          : 'bg-midnight/90 backdrop-blur-md border-midnight-50/30'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left section */}
          <div className="flex items-center gap-4">
            {/* Back button */}
            {showBackButton && (
              <button
                onClick={handleBack}
                className="p-2 text-cream-400 hover:text-cream hover:bg-midnight-100 rounded-xl transition-all"
                aria-label="Go back"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Logo */}
            {showLogo && (
              <button
                onClick={() => navigate('/home-v2')}
                className="flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber to-amber-600 flex items-center justify-center shadow-glow">
                  <span className="text-xl">🍽️</span>
                </div>
                <span className="font-display text-2xl font-semibold text-cream tracking-tight hidden sm:block">
                  Dinder
                </span>
              </button>
            )}

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1 ml-6">
              <button
                onClick={() => navigate('/home-v2')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive('/home-v2')
                    ? 'text-amber bg-amber/10'
                    : 'text-cream-400 hover:text-cream hover:bg-midnight-100'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => navigate('/explore')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive('/explore')
                    ? 'text-amber bg-amber/10'
                    : 'text-cream-400 hover:text-cream hover:bg-midnight-100'
                }`}
              >
                Explore
              </button>
            </div>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-3">
            {/* Custom right action */}
            {rightAction}

            {/* Friends button */}
            {showFriendsButton && isAuthenticated && (
              <button
                onClick={() => navigate('/friends')}
                className="relative p-2.5 text-cream-400 hover:text-amber hover:bg-midnight-100 rounded-xl transition-all duration-300"
                title="Friends"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {notificationCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-midnight bg-amber rounded-full flex items-center justify-center">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>
            )}

            {/* Auth section */}
            {showAuth && (
              isAuthenticated ? <UserProfileButton /> : <GoogleSignInButton />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
