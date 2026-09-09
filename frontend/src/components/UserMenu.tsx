import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import ProfileAvatar from './ProfileAvatar';

export default function UserMenu() {
  const { user, signOut, isLoading } = useAuthStore();
  const { currentUserProfile: profile, fetchCurrentProfile } = useFriendsStore();
  const userId = user?.id;
  useEffect(() => {
    if (userId) void fetchCurrentProfile();
  }, [userId, fetchCurrentProfile]);
  if (!user) return null;
  const current = profile?.id === user.id ? profile : null;
  const name = current?.displayName ?? 'Your profile';
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-raised p-2 shadow-card">
      <Link
        to="/profile"
        aria-label="Profile settings"
        className="flex min-h-[48px] min-w-0 items-center gap-2 rounded-lg px-1 text-sm font-medium"
      >
        <ProfileAvatar name={name} url={current?.avatarUrl} className="h-8 w-8 ring-2 ring-cyan" />
        <span className="max-w-[120px] truncate">{name}</span>
      </Link>
      <button
        onClick={() => void signOut().catch((error) => console.error('Failed to sign out:', error))}
        disabled={isLoading}
        className="min-h-[48px] px-2 text-sm text-muted hover:text-coral-soft transition-colors disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
