// Watch setup (#369): the one screen behind the fork's Watch card. It captures
// the Mood — genre chips, decade chips — then creates the Session and deals its
// Movie Deck from the committed corpus. One screen, not a wizard, and no
// solo/group question: a Session starts as yours and becomes a group when you
// invite someone. A Mood the corpus cannot answer is refused inline with every
// chip exactly as the Host set it; there is no Nearest Mood to offer, because
// the corpus is small and static enough that removing a chip is the whole fix.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DECADES, GENRES, type Decade, type Genre } from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import InviteFriendsSection from '../components/friends/InviteFriendsSection';
import { useCreateAndJoinSession } from '../hooks/useCreateAndJoinSession';

/** Toggle membership of a chip set, preserving the rest. */
function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export default function WatchSetupPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [decades, setDecades] = useState<Decade[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const { createAndJoin, isCreating: isLoading } = useCreateAndJoinSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (hostName.trim().length < 1 || hostName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }

    const failure = await createAndJoin(
      hostName.trim(),
      { branch: 'watch', mood: { genres, decades } },
      selectedFriendIds
    );
    setError(failure?.message ?? '');
  };

  const chipClass = (selected: boolean) =>
    `min-h-[44px] rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
      selected
        ? 'border-amber bg-amber/15 text-amber'
        : 'border-line bg-surface text-muted hover:border-amber/50'
    }`;

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Watching a movie"
        subtitle="What are you in the mood to watch?"
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="mx-auto w-full max-w-md px-4 py-6 animate-fade-in">
        <form onSubmit={handleSubmit} className="card space-y-6">
          <div>
            <label htmlFor="hostName" className="label">
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
              className="input"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <fieldset>
            <legend className="label">Genres</legend>
            <p className="mb-3 text-xs text-muted">
              Pick any, or none for anything. More chips in a row means more to swipe, not fewer;
              genres and decades combine.
            </p>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => {
                const selected = genres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setGenres(toggle(genres, genre))}
                    disabled={isLoading}
                    className={chipClass(selected)}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Decades</legend>
            <p className="mb-3 text-xs text-muted">Pick any, or none for any era.</p>
            <div className="flex flex-wrap gap-2">
              {DECADES.map((decade) => {
                const selected = decades.includes(decade);
                return (
                  <button
                    key={decade}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDecades(toggle(decades, decade))}
                    disabled={isLoading}
                    className={chipClass(selected)}
                  >
                    {decade}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <InviteFriendsSection
            selectedFriendIds={selectedFriendIds}
            onSelectionChange={setSelectedFriendIds}
            disabled={isLoading}
          />

          {error && (
            <div className="rounded-xl border border-coral/30 bg-coral/10 p-3">
              <p className="text-sm text-coral-soft">{error}</p>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !hostName.trim()}
              className="btn btn-primary min-h-[48px] w-full text-lg"
            >
              {isLoading ? 'Dealing movies...' : 'Start swiping'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
