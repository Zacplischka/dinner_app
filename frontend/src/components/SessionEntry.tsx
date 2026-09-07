import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Branch } from '@dinder/shared/types';
import NavigationHeader from './NavigationHeader';
import TmdbCredit from './TmdbCredit';
import Spinner from './Spinner';
import { useProfileName } from '../hooks/useProfileName';
import { useCreateAndJoinSession } from '../hooks/useCreateAndJoinSession';
import { useSessionSwitch } from '../hooks/useSessionSwitch';
import { validateDisplayName } from '../utils/displayName';

const titles: Record<Branch, string> = {
  eatout: 'Eat out',
  takeaway: 'Order in',
  cook: 'Cook together',
  watch: 'Watch something',
};

// Branch entry collects identity only. Everyone settles choices after gathering.
export default function SessionEntry({ branch }: { branch: Branch }) {
  const navigate = useNavigate();
  const { continueTo, switchDialog } = useSessionSwitch();
  const [name, setName, identity] = useProfileName();
  const [error, setError] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const started = useRef(false);
  const { createAndJoin, isCreating } = useCreateAndJoinSession();

  const enter = async () => {
    const invalid = validateDisplayName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    const failure = await createAndJoin(name.trim(), { branch, collaborative: true }, new Set());
    if (failure) {
      setError(failure.message);
      if (failure.code === 'DISPLAY_NAME_TAKEN') setNeedsName(true);
    }
  };

  useEffect(() => {
    if (identity.isLoading || !identity.hasProfileName || started.current) return;
    started.current = true;
    continueTo(enter);
  });

  return (
    <main className="min-h-screen bg-ink">
      {switchDialog}
      <NavigationHeader
        title={titles[branch]}
        subtitle="Gather first. Choose together."
        showBackButton
        onBack={() => navigate('/')}
      />
      <div className="mx-auto max-w-md px-4 py-6">
        <form
          className="card space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            continueTo(enter);
          }}
        >
          <p className="text-muted">
            Invite your friends in the lobby, then everyone can choose what they’re into.
          </p>
          {identity.isLoading ? (
            <Spinner label="Checking your profile…" />
          ) : !identity.hasProfileName || needsName ? (
            <div>
              <label className="label" htmlFor="hostName">
                Your Name
              </label>
              <input
                id="hostName"
                name="hostName"
                className="input"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                autoFocus
                disabled={isCreating}
                placeholder="Enter your name"
              />
              <p className="mt-1.5 text-xs text-muted">{name.length}/50 characters</p>
            </div>
          ) : (
            <p className="text-text">
              Joining as <strong>{name}</strong>
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral-soft"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary min-h-[48px] w-full"
            disabled={identity.isLoading || isCreating || !!validateDisplayName(name)}
          >
            {isCreating ? 'Creating session…' : error ? 'Try again' : 'Create session'}
          </button>
        </form>
        {branch === 'watch' && <TmdbCredit />}
      </div>
    </main>
  );
}
