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
    <div className="flex items-center gap-3 rounded-xl border border-line bg-raised p-2 shadow-card">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${displayName} profile`}
          referrerPolicy="no-referrer"
          className="w-8 h-8 rounded-full ring-2 ring-cyan shadow-glow-cyan"
        />
      ) : (
        <div aria-label={`${displayName} profile`} className="w-8 h-8 rounded-full ring-2 ring-cyan bg-raised flex items-center justify-center text-cyan font-bold shadow-glow-cyan">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-text font-medium truncate max-w-[120px]">
        {displayName}
      </span>
      <button
        onClick={handleSignOut}
        disabled={isLoading}
        className="text-sm text-muted hover:text-coral-soft transition-colors disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
