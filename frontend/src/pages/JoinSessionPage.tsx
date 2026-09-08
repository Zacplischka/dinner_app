// Join Session page - Join an existing session via code

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { beginSessionIntent, isSessionIntentCurrent } from '../services/sessionIntent';
import NavigationHeader from '../components/NavigationHeader';
import { SESSION_CODE_LENGTH } from '@dinder/shared/types';
import { getSession, ApiClientError } from '../services/apiClient';
import { validateDisplayName } from '../utils/displayName';
import { useSessionSwitch } from '../hooks/useSessionSwitch';
import { useProfileName } from '../hooks/useProfileName';

const cleanSessionCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, SESSION_CODE_LENGTH);

export default function JoinSessionPage() {
  const [params] = useSearchParams();
  return (
    <JoinInvitation
      key={`${cleanSessionCode(params.get('code') ?? '')}:${params.get('resume') ?? ''}`}
    />
  );
}

function JoinInvitation() {
  const navigate = useNavigate();
  const { continueTo, switchDialog } = useSessionSwitch();
  const [searchParams] = useSearchParams();
  const [sessionCode, setSessionCode] = useState('');
  const [participantName, setParticipantName, identity] = useProfileName();
  const [needsName, setNeedsName] = useState(false);
  const autoJoined = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [linkDead, setLinkDead] = useState(false);
  const mounted = useRef(true);
  const admissionIntent = useRef<number>();
  useEffect(() => {
    mounted.current = true;
    admissionIntent.current = beginSessionIntent();
    return () => {
      mounted.current = false;
      if (admissionIntent.current !== undefined && isSessionIntentCurrent(admissionIntent.current))
        beginSessionIntent();
    };
  }, []);

  // Pre-fill session code if provided in URL query params, then probe it.
  useEffect(() => {
    const code = cleanSessionCode(searchParams.get('code') ?? '');
    if (!code) return;

    setSessionCode(code);
    // ponytail: only a definitive 404 kills the link. Network/5xx/CORS fail open —
    // the session:join ack stays the authority on whether a Session can be joined.
    let cancelled = false;
    void getSession(code).catch((err: unknown) => {
      if (!cancelled && err instanceof ApiClientError && err.status === 404) setLinkDead(true);
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const enter = async () => {
    if (!mounted.current) return;
    setError('');

    // Validate inputs
    if (sessionCode.trim().length !== SESSION_CODE_LENGTH) {
      setError(`Session code must be ${SESSION_CODE_LENGTH} characters`);
      return;
    }

    const nameError = validateDisplayName(participantName);
    if (nameError) {
      setError(nameError);
      return;
    }

    setIsLoading(true);
    const intent = beginSessionIntent(sessionCode.trim().toUpperCase(), participantName.trim());
    admissionIntent.current = intent;
    const current = () => mounted.current && isSessionIntentCurrent(intent);

    try {
      const socketBindingsPromise = import('../services/socketBindings');
      const code = sessionCode.trim().toUpperCase();

      const { waitForConnection, joinSession } = await socketBindingsPromise;
      await waitForConnection();
      if (!current()) return;
      const ack = await joinSession(code, participantName.trim(), false, intent);
      if (!current()) return;

      if (ack.success) {
        // Admission is complete. Navigation must not cancel its follow-up recovery.
        admissionIntent.current = undefined;
        // A Session already selecting admits late joiners (#284) — straight to
        // the Deck; the lobby is only for a Session that hasn't started.
        const pending = ack.data.lobby?.participants.find(
          (p) => p.participantId === ack.data.participantId
        )?.waitingForNextRound;
        navigate(
          ack.data.state === 'selecting' && !pending
            ? `/session/${code}/select`
            : ack.data.state === 'complete' && !pending
              ? `/session/${code}/results`
              : `/session/${code}`
        );
      } else {
        // Handle specific error cases by canonical code, falling back to message text.
        const errorMessage = ack.error.message;
        if (ack.error.code === 'DISPLAY_NAME_TAKEN') setNeedsName(true);
        if (ack.error.code === 'SESSION_FULL' || errorMessage.includes('full')) {
          setError('This session is full (maximum 4 participants)');
        } else if (ack.error.code === 'SESSION_NOT_FOUND' || errorMessage.includes('not found')) {
          setError('Session not found or has expired');
        } else {
          setError(errorMessage);
        }
        setIsLoading(false);
      }
    } catch (err: unknown) {
      if (!current()) return;
      setError(err instanceof Error ? err.message : 'Failed to join session');

      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (
      identity.isLoading ||
      !identity.hasProfileName ||
      linkDead ||
      autoJoined.current ||
      !searchParams.get('code') ||
      searchParams.get('resume') === 'failed' ||
      sessionCode.length !== SESSION_CODE_LENGTH
    )
      return;
    autoJoined.current = true;
    continueTo(enter, sessionCode);
  });

  if (linkDead) {
    return (
      <main className="min-h-screen bg-ink">
        {switchDialog}
        <NavigationHeader
          title="Join a session"
          subtitle="Enter the session code shared by your host"
          showBackButton
          onBack={() => navigate('/')}
        />
        <div className="w-full max-w-md mx-auto px-4 py-6 animate-fade-in">
          <div className="card space-y-4 text-center">
            <p className="text-4xl" aria-hidden="true">
              ⏳
            </p>
            <h2 className="text-lg font-display font-semibold text-text">This link has expired</h2>
            <p className="text-sm text-muted">
              A session closes once everyone stops using it. This one is over — or the code was
              mistyped.
            </p>
            <button
              className="btn btn-primary w-full min-h-[48px]"
              onClick={() => navigate('/create')}
            >
              Start a new session
            </button>
            <button
              className="btn btn-secondary w-full min-h-[48px]"
              onClick={() => setLinkDead(false)}
            >
              Enter a code instead
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink">
      {switchDialog}
      <NavigationHeader
        title="Join a session"
        subtitle="Enter the session code shared by your host"
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="w-full max-w-md mx-auto px-4 py-6 animate-fade-in">
        {/* Form */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            continueTo(enter, sessionCode);
          }}
          className="card space-y-6"
        >
          {/* Session Code */}
          <div>
            <label htmlFor="sessionCode" className="label">
              Session code
            </label>
            <input
              id="sessionCode"
              name="sessionCode"
              type="text"
              value={sessionCode}
              onChange={(e) => setSessionCode(cleanSessionCode(e.target.value))}
              placeholder="7K9M2"
              maxLength={SESSION_CODE_LENGTH}
              className="w-full min-h-[56px] rounded-market-md border border-cyan bg-surface px-4 py-4 text-center font-mono text-2xl font-black uppercase tracking-[0.35em] text-cyan shadow-glow-cyan transition-all duration-150 placeholder:text-muted/70"
              autoFocus={!searchParams.get('code')}
              disabled={isLoading}
            />
            <p className="mt-2 text-xs text-muted text-center">
              {SESSION_CODE_LENGTH}-character code (letters and numbers)
            </p>
          </div>

          {/* Participant Name */}
          {identity.isLoading ? (
            <p role="status">Checking your profile…</p>
          ) : identity.hasProfileName && !needsName ? (
            <p>
              Joining as <strong>{participantName}</strong>
            </p>
          ) : (
            <div>
              <label htmlFor="participantName" className="label">
                Your Name
              </label>
              <input
                id="participantName"
                name="displayName"
                type="text"
                autoComplete="name"
                autoCorrect="off"
                spellCheck={false}
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                className="input"
                disabled={isLoading}
              />
              <p className="mt-1.5 text-xs text-muted">{participantName.length}/50 characters</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div role="alert" className="p-3 bg-coral/10 border border-coral/30 rounded-xl">
              <p className="text-sm text-coral-soft">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                identity.isLoading ||
                isLoading ||
                sessionCode.length !== SESSION_CODE_LENGTH ||
                !!validateDisplayName(participantName)
              }
              className="btn btn-primary w-full min-h-[48px] text-lg"
            >
              {isLoading ? 'Joining…' : 'Join session'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
