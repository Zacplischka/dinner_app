// Cook setup (#259): the one screen behind the fork's Cook card. It captures
// the Craving — meal type, cuisine chips, diet chips — and the Headcount, then
// creates the Session and deals its Recipe Deck. One screen, not a wizard, and
// no solo/group question: a Session starts as yours and becomes a group when
// you invite someone.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CUISINES,
  DIETS,
  MAX_HEADCOUNT,
  MEAL_TYPES,
  type Craving,
  type Cuisine,
  type Diet,
  type MealType,
  type NearestCraving,
} from '@dinder/shared/types';
import NavigationHeader from '../components/NavigationHeader';
import InviteFriendsSection from '../components/friends/InviteFriendsSection';
import { useCreateAndJoinSession } from '../hooks/useCreateAndJoinSession';
import { fetchNearestCraving } from '../services/apiClient';

/** Toggle membership of a chip set, preserving the rest. */
function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export default function CookSetupPage() {
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [mealType, setMealType] = useState<MealType>('main course');
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [diets, setDiets] = useState<Diet[]>([]);
  const [headcount, setHeadcount] = useState(2);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [offer, setOffer] = useState<NearestCraving | null>(null);
  const { createAndJoin, isCreating: isLoading } = useCreateAndJoinSession();

  /**
   * Deal this Craving — and, when it deals nothing, ask what would. The
   * refusal lands inline at setup with every chip exactly as the Host set it
   * (#260), and the Nearest Craving arrives beside it as an offer: tapping it
   * comes back through here with the Craving it named, and ignoring it changes
   * nothing (#334).
   */
  const deal = async (craving: Craving) => {
    setError('');
    setOffer(null);

    const failure = await createAndJoin(
      hostName.trim(),
      { branch: 'cook', craving, headcount },
      selectedFriendIds
    );
    setError(failure?.message ?? '');

    // Only the zero-Recipe refusal has a neighbour worth offering: a source
    // that did not answer says nothing about the Craving (#250).
    if (failure?.code === 'NO_RECIPES_FOUND') {
      setOffer(await fetchNearestCraving(craving).catch(() => null));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (hostName.trim().length < 1 || hostName.trim().length > 50) {
      setError('Name must be between 1 and 50 characters');
      return;
    }

    await deal({ mealType, cuisines, diets });
  };

  const chipClass = (selected: boolean) =>
    `min-h-[44px] rounded-full border px-4 py-2 text-sm font-bold capitalize transition-colors ${
      selected
        ? 'border-lime bg-lime/15 text-lime'
        : 'border-line bg-surface text-muted hover:border-lime/50'
    }`;

  return (
    <main className="min-h-screen bg-ink">
      <NavigationHeader
        title="Cooking"
        subtitle="What are you in the mood to cook?"
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

          <div>
            <label htmlFor="mealType" className="label">
              Meal
            </label>
            <select
              id="mealType"
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              disabled={isLoading}
              className="input capitalize"
            >
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type} className="capitalize">
                  {type}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="label">Cuisines</legend>
            <p className="mb-3 text-xs text-muted">
              Pick any, or none for anything. More chips means more to swipe, not fewer.
            </p>
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((cuisine) => {
                const selected = cuisines.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCuisines(toggle(cuisines, cuisine))}
                    disabled={isLoading}
                    className={chipClass(selected)}
                  >
                    {cuisine}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label">Diets</legend>
            {/* Story 9: say plainly what this filter is, and what it is not. */}
            <p className="mb-3 text-xs text-muted">
              A preference filter on the recipes we deal — not an allergy-safety guarantee. Always
              check the ingredients yourself.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIETS.map((diet) => {
                const selected = diets.includes(diet);
                return (
                  <button
                    key={diet}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDiets(toggle(diets, diet))}
                    disabled={isLoading}
                    className={chipClass(selected)}
                  >
                    {diet}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label className="label" id="headcountLabel">
              Cooking for
            </label>
            <p className="mb-3 text-xs text-muted">
              How many people are eating — not how many are swiping.
            </p>
            <div className="flex items-center gap-4" role="group" aria-labelledby="headcountLabel">
              <button
                type="button"
                aria-label="Fewer people"
                onClick={() => setHeadcount((n) => Math.max(1, n - 1))}
                disabled={isLoading || headcount <= 1}
                className="btn btn-secondary min-h-[44px] min-w-[44px] text-xl"
              >
                −
              </button>
              <span aria-live="polite" className="min-w-[7rem] text-center text-lg font-black">
                {headcount} {headcount === 1 ? 'person' : 'people'}
              </span>
              <button
                type="button"
                aria-label="More people"
                onClick={() => setHeadcount((n) => Math.min(MAX_HEADCOUNT, n + 1))}
                disabled={isLoading || headcount >= MAX_HEADCOUNT}
                className="btn btn-secondary min-h-[44px] min-w-[44px] text-xl"
              >
                +
              </button>
            </div>
          </div>

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

          {offer && (
            <button
              type="button"
              onClick={() => deal(offer.craving)}
              disabled={isLoading}
              className="btn btn-secondary min-h-[48px] w-full"
            >
              <span className="capitalize">Deal {[...diets, offer.label].join(' + ')} instead</span>
              {' — '}
              {offer.recipeCount} {offer.recipeCount === 1 ? 'recipe' : 'recipes'}
            </button>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || !hostName.trim()}
              className="btn btn-primary min-h-[48px] w-full text-lg"
            >
              {isLoading ? 'Dealing recipes...' : 'Start swiping'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
