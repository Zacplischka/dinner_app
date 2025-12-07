// FriendsList Component
// Displays the user's friends with remove action

import type { Friend } from '@dinner-app/shared/types';
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
      <div className="text-center py-8 text-cream-500">
        <p className="text-lg">No friends yet</p>
        <p className="text-sm mt-1 text-cream-500/60">Search for users by email to add friends</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-midnight-50/30">
      {friends.map((friend) => (
        <li
          key={friend.id}
          className={`flex items-center justify-between py-3 px-3 rounded-xl transition-all ${
            selectable ? 'cursor-pointer hover:bg-midnight-200/50' : ''
          } ${selectedIds.has(friend.id) ? 'bg-amber/10 border border-amber/30' : ''}`}
          onClick={() => selectable && onToggleSelect?.(friend.id)}
        >
          <div className="flex items-center gap-3">
            {/* Selection checkbox */}
            {selectable && (
              <div
                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selectedIds.has(friend.id)
                    ? 'border-amber bg-amber'
                    : 'border-cream-500/30'
                }`}
              >
                {selectedIds.has(friend.id) && (
                  <svg
                    className="w-3 h-3 text-midnight"
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
                className="w-10 h-10 rounded-full ring-2 ring-amber/20"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center shadow-glow">
                <span className="text-midnight font-medium text-lg">
                  {friend.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {/* Name and email */}
            <div>
              <p className="font-medium text-cream">{friend.displayName}</p>
              {friend.email && (
                <p className="text-sm text-cream-500">{friend.email}</p>
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
                  className="px-3 py-1.5 text-sm font-medium text-amber hover:text-amber-200 hover:bg-amber/10 rounded-lg transition-colors"
                >
                  Invite
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFriend(friend.id, friend.displayName);
                }}
                className="px-3 py-1.5 text-sm font-medium text-error-light hover:text-error hover:bg-error/10 rounded-lg transition-colors"
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
