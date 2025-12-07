// Session Lobby page - Waiting room showing participants before selection starts
// Based on: specs/001-dinner-decider-enables/tasks.md T054

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import { getSession } from '../services/apiClient';

export default function SessionLobbyPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { participants, isConnected } = useSessionStore();
  const [shareableLink, setShareableLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch session details to get shareable link
    const loadSession = async () => {
      if (!sessionCode) return;

      try {
        const session = await getSession(sessionCode);
        setShareableLink(session.shareableLink);
      } catch (err) {
        console.error('Failed to load session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [sessionCode]);

  const handleCopyCode = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (shareableLink) {
      navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartSelecting = () => {
    navigate(`/session/${sessionCode}/select`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-midnight">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-cream-400">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-warm-gradient px-4 py-8">
      <div className="max-w-md mx-auto animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-semibold text-cream mb-2 text-glow">
            Session Lobby
          </h1>
          <p className="text-cream-400">
            Waiting for participants to join
          </p>
        </div>

        {/* Session Code Card */}
        <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 mb-6">
          <h2 className="text-sm font-medium text-cream-400 mb-3 text-center uppercase tracking-wider">
            Session Code
          </h2>
          <div className="flex items-center justify-center space-x-3">
            <div className="text-3xl font-mono font-bold text-amber tracking-[0.3em] text-glow">
              {sessionCode}
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2.5 text-cream-400 hover:text-amber hover:bg-midnight-200 rounded-xl transition-all duration-300"
              title="Copy code"
            >
              {copied ? (
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          </div>

          {shareableLink && (
            <button
              onClick={handleCopyLink}
              className="mt-4 w-full px-4 py-2.5 text-sm text-amber hover:bg-amber/10 rounded-xl transition-all duration-300 border border-amber/20 hover:border-amber/40"
            >
              {copied ? 'Copied to clipboard!' : 'Copy shareable link'}
            </button>
          )}
        </div>

        {/* Participants List */}
        <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 mb-6">
          <h2 className="text-lg font-display font-semibold text-cream mb-4">
            Participants <span className="text-amber">({participants.length}/4)</span>
          </h2>

          <div className="space-y-3">
            {participants.map((participant) => (
              <div
                key={participant.participantId}
                className="flex items-center space-x-3 p-3 bg-midnight-200/50 rounded-xl border border-midnight-50/20"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-amber to-amber-500 rounded-full flex items-center justify-center text-midnight font-semibold shadow-glow">
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-cream">
                    {participant.displayName}
                    {participant.isHost && (
                      <span className="ml-2 text-xs text-amber font-semibold uppercase tracking-wider">
                        Host
                      </span>
                    )}
                  </p>
                </div>
                <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
              </div>
            ))}

            {/* Empty slots */}
            {[...Array(4 - participants.length)].map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center space-x-3 p-3 border border-dashed border-midnight-50/50 rounded-xl"
              >
                <div className="w-10 h-10 bg-midnight-200 rounded-full flex items-center justify-center text-cream-500">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <p className="text-cream-500 italic">Waiting for participant...</p>
              </div>
            ))}
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="mb-6 p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 bg-warning rounded-full animate-pulse" />
            <p className="text-sm text-warning-light">Disconnected from server</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartSelecting}
          disabled={participants.length === 0}
          className="w-full min-h-[48px] px-6 py-3 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none"
        >
          Start Selecting
        </button>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-cream-500 space-y-1">
          <p>Share the code with friends to invite them</p>
          <p className="text-cream-500/60">Sessions expire after 30 minutes of inactivity</p>
        </div>
      </div>
    </main>
  );
}