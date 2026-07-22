// Session Lobby page - Waiting room showing participants before selection starts
// Based on: specs/001-dinner-decider-enables/tasks.md T054

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { getSession } from '../services/apiClient';
import { leaveSession, restartSession } from '../services/socketBindings';
import NavigationHeader from '../components/NavigationHeader';
import { useToast } from '../hooks/useToast';
import { participantRingClass } from '../utils/participantStyles';

export default function SessionLobbyPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { participants, isConnected, sessionStatus } = useSessionStore();
  const [shareableLink, setShareableLink] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    // Fetch session details to get shareable link
    const loadSession = async () => {
      if (!sessionCode) {
        setIsLoading(false);
        return;
      }

      try {
        const session = await getSession(sessionCode);
        setShareableLink(session.shareableLink);
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSession();
  }, [sessionCode]);

  useEffect(() => {
    if (sessionStatus === 'selecting' && sessionCode) {
      navigate(`/session/${sessionCode}/select`);
    }
  }, [navigate, sessionCode, sessionStatus]);

  const handleCopyCode = () => {
    if (sessionCode) {
      navigator.clipboard
        .writeText(sessionCode)
        .then(() => toast.success('Session code copied!'))
        .catch(() => toast.error('Could not copy code'));
    }
  };

  const handleShareLink = async () => {
    if (!shareableLink) return;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Dinder', url: shareableLink });
        return;
      } catch (err) {
        // ponytail: dismissing the sheet is not a failure — no toast, no clipboard write.
        // Any other rejection (NotAllowedError, insecure context, no handler) falls
        // through so the Host still ends up with the link somewhere.
        // navigator.share rejects with a DOMException, which is not `instanceof Error`
        // in every environment (jsdom included) — match on `.name` alone.
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return;
      }
    }

    navigator.clipboard
      .writeText(shareableLink)
      .then(() => toast.success('Link copied to clipboard!'))
      .catch(() => toast.error('Could not copy link'));
  };

  const handleStartSelecting = async () => {
    if (!sessionCode) return;

    try {
      // The existing restart contract moves the shared session into the
      // selecting state and broadcasts that transition to every participant.
      const ack = await restartSession(sessionCode);
      if (!ack.success) {
        toast.error(ack.error.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start selecting');
    }
  };

  const handleLeaveSession = async () => {
    if (!sessionCode) {
      navigate('/');
      return;
    }

    try {
      await leaveSession(sessionCode);
      navigate('/');
    } catch (err) {
      console.error('Failed to leave session:', err);
      useSessionStore.getState().resetSession();
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-muted">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="market-backdrop min-h-screen">
      {/* Navigation Header */}
      <NavigationHeader
        title="Make the Call"
        subtitle="Invite friends, then start swiping"
        sessionCode={sessionCode}
        showBackButton
        onBack={handleLeaveSession}
        confirmOnBack
        confirmContext="lobby"
        showConnectionStatus
      />

      <div className="max-w-md mx-auto px-4 py-6 animate-fade-in">
        {/* Session Code Card */}
        <div className="card mb-6">
          <h2 className="label text-center">Session Code</h2>
          <div className="relative">
            <div className="rounded-market-md border border-cyan bg-[#050d19] p-4 text-center font-mono text-3xl font-black tracking-[0.28em] text-cyan shadow-glow-cyan">
              {sessionCode}
            </div>
            <button
              onClick={handleCopyCode}
              className="absolute right-1 top-1 min-h-[44px] min-w-[44px] rounded-xl p-2.5 text-cyan hover:bg-cyan/10"
              title="Copy code"
              aria-label="Copy session code"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                />
              </svg>
            </button>
          </div>

          {shareableLink && (
            <button
              onClick={() => void handleShareLink()}
              className="btn btn-secondary mt-4 w-full min-h-[48px] text-sm"
            >
              {typeof navigator.share === 'function' ? 'Share invite link' : 'Copy shareable link'}
            </button>
          )}
        </div>

        {/* Participants List */}
        <div className="card mb-6">
          <h2 className="mb-4 text-lg font-display font-semibold text-text">
            Participants <span className="text-cyan">({participants.length}/4)</span>
          </h2>

          <div className="space-y-3" data-testid="participants-list">
            {participants.map((participant, index) => {
              const isOffline = participant.isOnline === false;
              return (
                <div
                  key={participant.participantId}
                  data-testid="participant"
                  className="flex items-center space-x-3 p-3 bg-surface/70 rounded-xl border border-line"
                >
                  <div
                    aria-label={`${participant.displayName}${participant.isHost ? ', host' : ''}, ${isOffline ? 'offline' : 'live'}`}
                    className={`w-11 h-11 bg-raised border-2 rounded-full flex items-center justify-center text-text font-black ${participantRingClass(index)}`}
                  >
                    {participant.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-text">
                      <span data-testid="participant-name">{participant.displayName}</span>
                      {participant.isHost && (
                        <span className="ml-2 text-xs text-cyan font-semibold uppercase tracking-wider">
                          Host
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isOffline ? 'text-muted' : 'text-lime'}`}
                  >
                    {isOffline ? (
                      <span className="h-2 w-2 rounded-full bg-muted" />
                    ) : (
                      <span className="live-dot" />
                    )}
                    {isOffline ? 'Offline' : 'Live'}
                  </span>
                </div>
              );
            })}

            {/* Empty slots */}
            {Array.from({ length: 4 - participants.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center space-x-3 p-3 border border-dashed border-line rounded-xl"
              >
                <div className="w-10 h-10 bg-surface border border-amber rounded-full flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-amber" />
                </div>
                <p className="text-muted italic">Waiting for participant...</p>
              </div>
            ))}
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="mb-6 p-3 bg-amber/10 border border-amber/30 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-amber rounded-full animate-pulse" />
            <p className="text-sm text-amber">Disconnected from server</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartSelecting}
          disabled={participants.length === 0}
          className="btn btn-primary w-full min-h-[48px] text-lg"
        >
          Start Selecting
        </button>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-muted space-y-1">
          <p>Share the code with friends to invite them</p>
          <p className="text-muted/60">Sessions expire after 30 minutes of inactivity</p>
        </div>
      </div>
    </main>
  );
}
