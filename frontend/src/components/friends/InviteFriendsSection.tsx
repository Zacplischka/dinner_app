// InviteFriendsSection Component
// Collapsible section for selecting friends to invite to a session

import { useEffect, useState } from 'react';
import { useFriendsStore } from '../../stores/friendsStore';
import { useAuthStore } from '../../stores/authStore';
import FriendsList from './FriendsList';

interface InviteFriendsSectionProps {
  selectedFriendIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  disabled?: boolean;
}

export default function InviteFriendsSection({
  selectedFriendIds,
  onSelectionChange,
  disabled = false,
}: InviteFriendsSectionProps) {
  const { isAuthenticated } = useAuthStore();
  const { friends, isLoadingFriends, fetchFriends } = useFriendsStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch friends when section is expanded
  useEffect(() => {
    if (isAuthenticated && isExpanded && friends.length === 0) {
      fetchFriends();
    }
  }, [isAuthenticated, isExpanded, friends.length, fetchFriends]);

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  const handleToggleSelect = (friendId: string) => {
    const newSelection = new Set(selectedFriendIds);
    if (newSelection.has(friendId)) {
      newSelection.delete(friendId);
    } else {
      newSelection.add(friendId);
    }
    onSelectionChange(newSelection);
  };

  const selectedCount = selectedFriendIds.size;

  return (
    <div className="border border-midnight-50/30 rounded-2xl overflow-hidden bg-midnight-200/30">
      {/* Header (collapsible) */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        disabled={disabled}
        className="w-full flex items-center justify-between p-4 bg-midnight-200/50 hover:bg-midnight-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="font-medium text-cream">
            Invite Friends
            {selectedCount > 0 && (
              <span className="ml-2 text-amber">({selectedCount} selected)</span>
            )}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-cream-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="p-4 bg-midnight-100/50 border-t border-midnight-50/30">
          {isLoadingFriends ? (
            <div className="py-4 text-center">
              <div className="inline-block w-5 h-5 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-2 text-sm text-cream-500">Loading friends...</p>
            </div>
          ) : friends.length === 0 ? (
            <div className="py-4 text-center text-cream-500">
              <p className="text-sm">No friends yet</p>
              <p className="text-xs mt-1 text-cream-500/60">Add friends from the Friends page to invite them here</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-cream-500 mb-3">
                Select friends to invite when the session is created
              </p>
              <div className="max-h-48 overflow-y-auto -mx-2">
                <FriendsList
                  friends={friends}
                  selectable
                  selectedIds={selectedFriendIds}
                  onToggleSelect={handleToggleSelect}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
