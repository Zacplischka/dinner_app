// Create Session page - Host creates a new dinner decision session
// Based on: specs/001-dinner-decider-enables/tasks.md T052

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../services/apiClient';
import { joinSession } from '../services/socketService';
import { useSessionStore } from '../stores/sessionStore';

export default function CreateSessionPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSessionCode } = useSessionStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate host name
    if (hostName.trim().length < 1 || hostName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await createSession(hostName.trim());

      // Store session code in Zustand
      setSessionCode(response.sessionCode);

      // Join the session via WebSocket
      await joinSession(response.sessionCode, hostName.trim());

      // Navigate to session lobby
      navigate(`/session/${response.sessionCode}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setIsLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Create Session
          </h1>
          <p className="text-gray-600">
            Start a new dinner decision session
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div>
            <label htmlFor="hostName" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              id="hostName"
              name="hostName"
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter your name"
              maxLength={50}
              className="w-full min-h-[44px] px-4 py-3 text-base border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
              autoFocus
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              {hostName.length}/50 characters
            </p>
          </div>

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
              disabled={isLoading || !hostName.trim()}
              className="w-full min-h-[44px] px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg"
            >
              {isLoading ? 'Creating...' : 'Create Session'}
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

        {/* Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>You&apos;ll be able to share a session code with friends</p>
        </div>
      </div>
    </main>
  );
}