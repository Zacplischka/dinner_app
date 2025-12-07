// Join Session page - Join an existing session via code
// Based on: specs/001-dinner-decider-enables/tasks.md T053

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { joinSession } from '../services/socketService';
import { useSessionStore } from '../stores/sessionStore';

export default function JoinSessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionCode, setSessionCode] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSessionCode: storeSessionCode, isConnected } = useSessionStore();

  // Pre-fill session code if provided in URL query params
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setSessionCode(codeParam.toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (sessionCode.trim().length !== 6) {
      setError('Session code must be 6 characters');
      return;
    }

    if (participantName.trim().length < 1 || participantName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }

    if (!isConnected) {
      setError('Not connected to server. Please refresh the page.');
      return;
    }

    setIsLoading(true);

    try {
      const code = sessionCode.trim().toUpperCase();
      await joinSession(code, participantName.trim());

      // Store session code
      storeSessionCode(code);

      // Navigate to session lobby
      navigate(`/session/${code}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join session';

      // Handle specific error cases
      if (errorMessage.includes('full')) {
        setError('This session is full (maximum 4 participants)');
      } else if (errorMessage.includes('not found')) {
        setError('Session not found or has expired');
      } else {
        setError(errorMessage);
      }

      setIsLoading(false);
    }
  };

  const handleSessionCodeChange = (value: string) => {
    // Only allow alphanumeric uppercase, max 6 chars
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setSessionCode(cleaned);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-warm-gradient px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-semibold text-cream mb-2 text-glow">
            Join Session
          </h1>
          <p className="text-cream-400">
            Enter the session code shared by your host
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 p-6 space-y-6">
          {/* Session Code */}
          <div>
            <label htmlFor="sessionCode" className="block text-sm font-medium text-cream-300 mb-2">
              Session Code
            </label>
            <input
              id="sessionCode"
              name="sessionCode"
              type="text"
              value={sessionCode}
              onChange={(e) => handleSessionCodeChange(e.target.value)}
              placeholder="ABC123"
              maxLength={6}
              className="w-full min-h-[56px] px-4 py-4 text-center font-mono text-2xl tracking-[0.4em] text-amber bg-midnight-200 border border-midnight-50/50 rounded-xl placeholder:text-cream-500/50 focus:border-amber/60 focus:ring-1 focus:ring-amber/30 outline-none transition-all duration-300 uppercase"
              autoFocus={!searchParams.get('code')}
              disabled={isLoading}
            />
            <p className="mt-2 text-xs text-cream-500 text-center">
              6-character code (letters and numbers)
            </p>
          </div>

          {/* Participant Name */}
          <div>
            <label htmlFor="participantName" className="block text-sm font-medium text-cream-300 mb-2">
              Your Name
            </label>
            <input
              id="participantName"
              name="displayName"
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              className="w-full min-h-[44px] px-4 py-3 text-base text-cream bg-midnight-200 border border-midnight-50/50 rounded-xl placeholder:text-cream-500 focus:border-amber/60 focus:ring-1 focus:ring-amber/30 outline-none transition-all duration-300"
              disabled={isLoading}
            />
            <p className="mt-1.5 text-xs text-cream-500">
              {participantName.length}/50 characters
            </p>
          </div>

          {/* Connection status */}
          {!isConnected && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl flex items-center gap-2">
              <div className="w-2 h-2 bg-warning rounded-full animate-pulse" />
              <p className="text-sm text-warning-light">Connecting to server...</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-error/10 border border-error/30 rounded-xl">
              <p className="text-sm text-error-light">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={isLoading || !sessionCode.trim() || !participantName.trim() || !isConnected}
              className="w-full min-h-[48px] px-6 py-3 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed active:scale-[0.98] transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none"
            >
              {isLoading ? 'Joining...' : 'Join Session'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              disabled={isLoading}
              className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-cream-400 bg-transparent rounded-xl hover:bg-midnight-100 hover:text-cream active:scale-[0.98] transition-all duration-300 border border-midnight-50/50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}