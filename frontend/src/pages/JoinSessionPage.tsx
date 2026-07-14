// Join Session page - Join an existing session via code
// Based on: specs/001-dinner-decider-enables/tasks.md T053

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '../stores/sessionStore';
import NavigationHeader from '../components/NavigationHeader';
import { waitForConnection, joinSession } from '../services/socketBindings';
import { SESSION_CODE_LENGTH } from '@dinder/shared/types';

const cleanSessionCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, SESSION_CODE_LENGTH);

export default function JoinSessionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionCode, setSessionCode] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { setSessionCode: storeSessionCode, setCurrentUserId, setConnectionStatus, setSessionStatus, resetSelections } = useSessionStore();

  // Pre-fill session code if provided in URL query params
  useEffect(() => {
    const codeParam = searchParams.get('code');
    if (codeParam) {
      setSessionCode(cleanSessionCode(codeParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate inputs
    if (sessionCode.trim().length !== SESSION_CODE_LENGTH) {
      setError(`Session code must be ${SESSION_CODE_LENGTH} characters`);
      return;
    }

    if (participantName.trim().length < 1 || participantName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }


    setIsLoading(true);

    try {
      const code = sessionCode.trim().toUpperCase();

      storeSessionCode(code);
      resetSelections();
      setSessionStatus('waiting');

      await waitForConnection();
      const joinResponse = await joinSession(code, participantName.trim());

      if (joinResponse.success && joinResponse.participantId) {
        setCurrentUserId(joinResponse.participantId);
        setConnectionStatus(true);
        navigate(`/session/${code}`);
      }
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

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Join Session"
        subtitle="Enter the session code shared by your host"
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="w-full max-w-md mx-auto px-4 py-6 animate-fade-in">

        {/* Form */}
        <form onSubmit={handleSubmit} className="card space-y-6">
          {/* Session Code */}
          <div>
            <label htmlFor="sessionCode" className="label">
              Session Code
            </label>
            <input
              id="sessionCode"
              name="sessionCode"
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(cleanSessionCode(e.target.value))}
              placeholder="7K9M2"
              maxLength={SESSION_CODE_LENGTH}
              className="w-full min-h-[56px] rounded-market-md border border-cyan bg-[#050d19] px-4 py-4 text-center font-mono text-2xl font-black uppercase tracking-[0.35em] text-cyan shadow-glow-cyan outline-none transition-all duration-150 placeholder:text-muted/50"
              autoFocus={!searchParams.get('code')}
              disabled={isLoading}
            />
            <p className="mt-2 text-xs text-muted text-center">
              {SESSION_CODE_LENGTH}-character code (letters and numbers)
            </p>
          </div>

          {/* Participant Name */}
          <div>
            <label htmlFor="participantName" className="label">
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
              className="input"
              disabled={isLoading}
            />
            <p className="mt-1.5 text-xs text-muted">
              {participantName.length}/50 characters
            </p>
          </div>


          {/* Error message */}
          {error && (
            <div className="p-3 bg-coral/10 border border-coral/30 rounded-xl">
              <p className="text-sm text-coral-soft">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !sessionCode.trim() || !participantName.trim()}
              className="btn btn-primary w-full min-h-[48px] text-lg"
            >
              {isLoading ? 'Joining...' : 'Join Session'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
