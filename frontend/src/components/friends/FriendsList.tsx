// FriendsList Component
// Displays the user's friends with remove action

import type { Friend } from '@dinder/shared/types';
import { useFriendsStore } from '../../stores/friendsStore';

interface FriendsListProps {
  friends: Friend[];
  onInvite?: (friendId: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (friendId: string) => void;
}

export default function FriendsList({
  friends,
  onInvite,
  selectable = false,
  selectedIds = new Set(),
  onToggleSelect,
}: FriendsListProps) {
  const { removeFriend } = useFriendsStore();

  const handleRemoveFriend = async (friendId: string, displayName: string) => {
    if (window.confirm(`Remove ${displayName} from your friends?`)) {
      await removeFriend(friendId);
    }
  };

  if (friends.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        <p className="text-lg">No friends yet</p>
        <p className="text-sm mt-1 text-muted/60">Search for users by email to add friends</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line/30">
      {friends.map((friend) => (
        <li
          key={friend.id}
          className={`flex items-center justify-between py-3 px-3 rounded-xl transition-all ${
            selectable ? 'cursor-pointer hover:bg-surface/50' : ''
          } ${selectedIds.has(friend.id) ? 'bg-cyan/10 border border-cyan/30' : ''}`}
          onClick={() => selectable && onToggleSelect?.(friend.id)}
        >
          <div className="flex items-center gap-3">
            {/* Selection checkbox */}
            {selectable && (
              <div
                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selectedIds.has(friend.id)
                    ? 'border-cyan bg-cyan'
                    : 'border-muted/30'
                }`}
              >
                {selectedIds.has(friend.id) && (
                  <svg
                    className="w-3 h-3 text-ink"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                )}
              </div>
            )}

            {/* Avatar */}
            {friend.avatarUrl ? (
              <img
                src={friend.avatarUrl}
                alt={friend.displayName}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full ring-2 ring-cyan/20"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center shadow-glow-cyan">
                <span className="text-ink font-medium text-lg">
                  {friend.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Name and email */}
            <div>
              <p className="font-medium text-text">{friend.displayName}</p>
              {friend.email && (
                <p className="text-sm text-muted">{friend.email}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          {!selectable && (
            <div className="flex gap-2">
              {onInvite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInvite(friend.id);
                  }}
                  className="min-h-[44px] px-3 py-1.5 text-sm font-medium text-cyan hover:text-white hover:bg-cyan/10 rounded-lg transition-colors"
                >
                  Invite
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFriend(friend.id, friend.displayName);
                }}
                className="min-h-[44px] px-3 py-1.5 text-sm font-medium text-coral-soft hover:text-white hover:bg-coral/10 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
