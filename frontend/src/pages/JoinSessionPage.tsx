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
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Join Session
          </h1>
          <p className="text-gray-600">
            Enter the session code shared by your host
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          {/* Session Code */}
          <div>
            <label htmlFor="sessionCode" className="block text-sm font-medium text-gray-700 mb-2">
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
              className="w-full min-h-[44px] px-4 py-3 text-base text-center font-mono text-xl tracking-widest border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all uppercase"
              autoFocus={!searchParams.get('code')}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              6-character code (letters and numbers)
            </p>
          </div>

          {/* Participant Name */}
          <div>
            <label htmlFor="participantName" className="block text-sm font-medium text-gray-700 mb-2">
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
              className="w-full min-h-[44px] px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              {participantName.length}/50 characters
            </p>
          </div>

          {/* Connection status */}
          {!isConnected && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-700">⚠️ Connecting to server...</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading || !sessionCode.trim() || !participantName.trim() || !isConnected}
              className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg"
            >
              {isLoading ? 'Joining...' : 'Join Session'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              disabled={isLoading}
              className="w-full min-h-[44px] px-6 py-3 text-base font-medium text-gray-700 bg-white rounded-lg hover:bg-gray-50 active:scale-[0.98] transition-all border-2 border-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}