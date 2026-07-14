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

  const handleAccept = async () => {
    setIsLoading(true);
    try {
      await acceptFriendRequest(request.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    try {
      await declineFriendRequest(request.id);
    } finally {
      setIsLoading(false);
    }
  };

  const { fromUser } = request;

  return (
    <div className="flex items-center justify-between p-4 bg-raised rounded-2xl border border-line/30 shadow-card">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {fromUser.avatarUrl ? (
          <img
            src={fromUser.avatarUrl}
            alt={fromUser.displayName}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full ring-2 ring-cyan/20"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center shadow-glow-cyan">
            <span className="text-ink font-medium text-lg">
              {fromUser.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Name and email */}
        <div>
          <p className="font-medium text-text">{fromUser.displayName}</p>
          {fromUser.email && (
            <p className="text-sm text-muted">{fromUser.email}</p>
          )}
          <p className="text-xs text-muted/60">
            {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="min-h-[44px] px-4 py-2 text-sm font-semibold text-ink bg-lime rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-lime"
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-muted bg-surface rounded-xl hover:bg-line hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-line/30"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
