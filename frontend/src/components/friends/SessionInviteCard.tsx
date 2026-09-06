// SessionInviteCard Component
// Displays a session invite with accept/decline actions

import type { SessionInvite } from '@dinder/shared/types';
import { useFriendsStore } from '../../stores/friendsStore';
import { joinSession, waitForConnection } from '../../services/socketBindings';
import { toast } from '../../hooks/useToast';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SessionInviteCardProps {
  invite: SessionInvite;
}

export default function SessionInviteCard({ invite }: SessionInviteCardProps) {
  const navigate = useNavigate();
  const { acceptSessionInvite, declineSessionInvite, currentUserProfile } = useFriendsStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Join first, accept second. The server accept is one-shot — it flips the
      // row to 'accepted', which drops it out of the pending list — so spending
      // it before the join loses the invite for good on the next refetch when
      // the join is refused. The row already carries the Session Code, so the
      // accept buys nothing the join needs.
      // Wait for the socket first: on a fresh page load there isn't one yet and
      // the join acks "Socket not connected". No store write belongs here —
      // socketBindings.joinSession owns those, and only once the ack succeeds.
      await waitForConnection();
      const displayName = currentUserProfile?.displayName || 'Guest';
      const ack = await joinSession(invite.sessionCode, displayName);
      if (!ack.success) {
        setError(ack.error.message);
        return;
      }

      // The join acked, so the Session is joined either way. A failed accept
      // only leaves the row pending — say so and go, rather than stranding a
      // joined user on /friends or dropping a card the server still lists.
      if (!(await acceptSessionInvite(invite.id))) {
        toast.error('Joined — but the invite still shows on your Friends list.');
      }
      navigate(`/session/${invite.sessionCode}`);
    } catch (err) {
      console.error('Error joining session:', err);
      setError(err instanceof Error ? err.message : 'Failed to join session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!(await declineSessionInvite(invite.id))) {
        setError(useFriendsStore.getState().error ?? 'Failed to decline invite');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const { inviter } = invite;

  return (
    <div className="p-4 bg-gradient-to-r from-raised to-surface rounded-2xl border border-cyan/20 shadow-card mb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Session icon */}
          <div className="w-10 h-10 rounded-full bg-cyan flex items-center justify-center shadow-glow-cyan">
            <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
          </div>

          {/* Invite info */}
          <div>
            <p className="font-medium text-text">
              <span className="text-cyan">{inviter.displayName}</span> invited you
            </p>
            <p className="text-sm text-muted">
              Session:{' '}
              <span className="font-mono font-semibold text-cyan">{invite.sessionCode}</span>
            </p>
            <p className="text-xs text-muted">{new Date(invite.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={isLoading}
            className="min-h-[44px] px-4 py-2 text-sm font-semibold text-ink bg-lime rounded-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-lime"
          >
            {isLoading ? 'Joining…' : 'Join'}
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

      {/* The failure stays with the card that caused it, in flow under the row */}
      {error && (
        <p role="alert" className="mt-2 text-xs text-coral-soft">
          {error}
        </p>
      )}
    </div>
  );
}
