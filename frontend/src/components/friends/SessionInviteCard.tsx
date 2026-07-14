// SessionInviteCard Component
// Displays a session invite with accept/decline actions

import type { SessionInvite } from '@dinder/shared/types';
import { useFriendsStore } from '../../stores/friendsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { joinSession } from '../../services/socketBindings';
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
    <div className="relative flex items-center justify-between p-4 bg-gradient-to-r from-raised to-surface rounded-2xl border border-cyan/20 shadow-card mb-2">
      <div className="flex items-center gap-3">
        {/* Session icon */}
        <div className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center shadow-glow-cyan">
          <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
        </div>

        {/* Invite info */}
        <div>
          <p className="font-medium text-text">
            <span className="text-cyan">{inviter.displayName}</span> invited you
          </p>
          <p className="text-sm text-muted">
            Session: <span className="font-mono font-semibold text-cyan">{invite.sessionCode}</span>
          </p>
          <p className="text-xs text-muted/60">
            {new Date(invite.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute -bottom-8 left-0 right-0">
          <p className="text-xs text-coral-soft">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isLoading}
          className="min-h-[44px] px-4 py-2 text-sm font-semibold text-ink bg-lime rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-lime"
        >
          {isLoading ? 'Joining...' : 'Join'}
        </button>
        <button
          onClick={handleDecline}
          disabled={isLoading}
          className="px-4 py-2 text-sm font-medium text-muted bg-surface rounded-xl border border-line/30 hover:bg-line hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
