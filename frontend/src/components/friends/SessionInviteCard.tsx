// SessionInviteCard Component
// Displays a session invite with accept/decline actions

import type { SessionInvite } from '@dinder/shared/types';
import { useFriendsStore } from '../../stores/friendsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { joinSession } from '../../services/socketService';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SessionInviteCardProps {
  invite: SessionInvite;
}

export default function SessionInviteCard({ invite }: SessionInviteCardProps) {
  const navigate = useNavigate();
  const { acceptSessionInvite, declineSessionInvite, currentUserProfile } = useFriendsStore();
  const { setSessionCode } = useSessionStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await acceptSessionInvite(invite.id);
      if (result.success && result.sessionCode) {
        // Get display name from profile or fallback
        const displayName = currentUserProfile?.displayName || 'Guest';

        // Join the session via WebSocket (this adds us to the Socket.IO room)
        await joinSession(result.sessionCode, displayName);

        // Store session code
        setSessionCode(result.sessionCode);

        // Navigate to the session lobby
        navigate(`/session/${result.sessionCode}`);
      }
    } catch (err) {
      console.error('Error joining session:', err);
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    try {
      await declineSessionInvite(invite.id);
    } finally {
      setIsLoading(false);
    }
  };

  const { inviter } = invite;

  return (
    <div className="relative flex items-center justify-between p-4 bg-gradient-to-r from-midnight-100 to-midnight-100/80 rounded-2xl border border-amber/20 shadow-card mb-2">
      <div className="flex items-center gap-3">
        {/* Session icon */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center shadow-glow">
          <svg className="w-5 h-5 text-midnight" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>

        {/* Invite info */}
        <div>
          <p className="font-medium text-cream">
            <span className="text-amber">{inviter.displayName}</span> invited you
          </p>
          <p className="text-sm text-cream-400">
            Session: <span className="font-mono font-semibold text-amber">{invite.sessionCode}</span>
          </p>
          <p className="text-xs text-cream-500/60">
            {new Date(invite.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute -bottom-8 left-0 right-0">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow"
        >
          {isLoading ? 'Joining...' : 'Join'}
        </button>
        <button
          onClick={handleDecline}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-cream-400 bg-midnight-200 rounded-xl border border-midnight-50/30 hover:bg-midnight-50 hover:text-cream disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
