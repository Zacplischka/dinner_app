// FriendRequestCard Component
// Displays a friend request with accept/decline actions

import type { FriendRequest } from '@dinner-app/shared/types';
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
    <div className="flex items-center justify-between p-4 bg-midnight-100 rounded-2xl border border-midnight-50/30 shadow-card">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {fromUser.avatarUrl ? (
          <img
            src={fromUser.avatarUrl}
            alt={fromUser.displayName}
            className="w-10 h-10 rounded-full ring-2 ring-amber/20"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center shadow-glow">
            <span className="text-midnight font-medium text-lg">
              {fromUser.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Name and email */}
        <div>
          <p className="font-medium text-cream">{fromUser.displayName}</p>
          {fromUser.email && (
            <p className="text-sm text-cream-500">{fromUser.email}</p>
          )}
          <p className="text-xs text-cream-500/60">
            {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow"
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-cream-400 bg-midnight-200 rounded-xl hover:bg-midnight-50 hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-midnight-50/30"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
