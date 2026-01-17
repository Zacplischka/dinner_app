// User Menu component
// Shows user avatar and sign out option when authenticated

import { useAuthStore } from '../stores/authStore';

export default function UserMenu() {
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
        <img
          src={avatarUrl}
          alt={displayName}
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-full ring-2 ring-amber/30"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center text-midnight font-medium shadow-glow">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-cream font-medium truncate max-w-[120px]">
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
