import ProfileAvatar from '../ProfileAvatar';
// FriendRequestCard Component
// Displays a friend request with accept/decline actions

import type { FriendRequest } from '@dinder/shared/types';
import { useFriendsStore } from '../../stores/friendsStore';
import { useState } from 'react';

interface FriendRequestCardProps {
  request: FriendRequest;
}

export default function FriendRequestCard({ request }: FriendRequestCardProps) {
  const { acceptFriendRequest, declineFriendRequest } = useFriendsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refused answer used to show as nothing but the button re-enabling; the
  // store keeps the message, so the card reads it back and shows it here.
  const answer = async (act: () => Promise<boolean>, fallback: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!(await act())) setError(useFriendsStore.getState().error ?? fallback);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () =>
    answer(() => acceptFriendRequest(request.id), 'Failed to accept request');

  const handleDecline = () =>
    answer(() => declineFriendRequest(request.id), 'Failed to decline request');

  const { fromUser } = request;

  return (
    <div className="p-4 bg-raised rounded-2xl border border-line/30 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <ProfileAvatar
            name={fromUser.displayName}
            url={fromUser.avatarUrl}
            className="w-10 h-10 ring-2 ring-cyan/20"
          />

          {/* Name and email */}
          <div>
            <p className="font-medium text-text">{fromUser.displayName}</p>
            {fromUser.email && <p className="text-sm text-muted">{fromUser.email}</p>}
            <p className="text-xs text-muted">{new Date(request.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => void handleAccept()}
            disabled={isLoading}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-lime rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-lime"
          >
            Accept
          </button>
          <button
            onClick={() => void handleDecline()}
            disabled={isLoading}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted bg-surface rounded-xl hover:bg-line hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-line/30"
          >
            Decline
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-coral-soft">
          {error}
        </p>
      )}
    </div>
  );
}
