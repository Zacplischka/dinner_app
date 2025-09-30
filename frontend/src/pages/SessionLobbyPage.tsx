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
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Session Lobby
          </h1>
          <p className="text-gray-600">
            Waiting for participants to join
          </p>
        </div>

        {/* Session Code Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2 text-center">
            Session Code
          </h2>
          <div className="flex items-center justify-center space-x-2">
            <div className="text-3xl font-mono font-bold text-blue-600 tracking-widest">
              {sessionCode}
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Copy code"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>

          {shareableLink && (
            <button
              onClick={handleCopyLink}
              className="mt-4 w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              {copied ? 'Copied!' : 'Copy shareable link'}
            </button>
          )}
        </div>

        {/* Participants List */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Participants ({participants.length}/4)
          </h2>

          <div className="space-y-3">
            {participants.map((participant) => (
              <div
                key={participant.participantId}
                className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {participant.displayName}
                    {participant.isHost && (
                      <span className="ml-2 text-xs text-blue-600 font-semibold">
                        HOST
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-green-500">●</div>
              </div>
            ))}

            {/* Empty slots */}
            {[...Array(4 - participants.length)].map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center space-x-3 p-3 border-2 border-dashed border-gray-300 rounded-lg"
              >
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-400">
                  ?
                </div>
                <p className="text-gray-400">Waiting for participant...</p>
              </div>
            ))}
          </div>
        </div>

        {/* Connection Status */}
        {!isConnected && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-700">⚠️ Disconnected from server</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStartSelecting}
          disabled={participants.length === 0}
          className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg"
        >
          Start Selecting
        </button>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Share the code with friends to invite them</p>
          <p className="mt-1">Sessions expire after 30 minutes of inactivity</p>
        </div>
      </div>
    </main>
  );
}