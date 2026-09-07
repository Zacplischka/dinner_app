import { useState } from 'react';
import {
  CUISINES,
  DECADES,
  DIETS,
  GENRES,
  MAX_DECK_SIZE,
  MAX_HEADCOUNT,
  MAX_RESTAURANT_DECK_SIZE,
  MEAL_TYPES,
  MEDIA_TYPES,
  type Diet,
  type SessionChoicesPayload,
  type SessionLobbyState,
} from '@dinder/shared/types';
import DeckSizeStepper from './DeckSizeStepper';
import LocationModeToggle, { type LocationMode } from './LocationModeToggle';
import { reverseGeocode } from '../services/apiClient';
import { resolveArea } from '../services/resolveArea';
import {
  KM_PER_MILE,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  toBackendRadiusMiles,
} from '../services/radius';

type Choices = Omit<SessionChoicesPayload, 'sessionCode' | 'revision'>;
const toggle = <T,>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
const emptyMood = { genres: [], decades: [], mediaTypes: [] };

function Chips<T extends string>({
  label,
  values,
  selected,
  onChange,
  disabled,
  warm = false,
  labels,
}: {
  label: string;
  values: readonly T[];
  selected: T[];
  onChange: (value: T[]) => void;
  disabled: boolean;
  warm?: boolean;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value, index) => (
          <button
            key={value}
            type="button"
            aria-pressed={selected.includes(value)}
            disabled={disabled}
            onClick={() => onChange(toggle(selected, value))}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-bold capitalize transition-colors ${selected.includes(value) ? 'border-amber bg-amber/20 text-amber' : warm ? ['border-coral/30 bg-coral/10 text-text', 'border-amber/30 bg-amber/10 text-text', 'border-lime/30 bg-lime/10 text-text'][index % 3] : 'border-line bg-surface text-muted hover:border-amber/50'}`}
          >
            {labels?.[value] ?? value}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function LobbyChoices({
  lobby,
  participantId,
  isHost,
  disabled,
  onChange,
}: {
  lobby: SessionLobbyState;
  participantId: string | null;
  isHost: boolean;
  disabled: boolean;
  onChange: (choices: Choices) => Promise<void>;
}) {
  const me = lobby.participants.find((p) => p.participantId === participantId);
  const mood = me?.mood ?? emptyMood;
  const [mode, setMode] = useState<LocationMode>('current');
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [pendingDiets, setPendingDiets] = useState<Diet[]>(me?.diets ?? []);
  const busy = disabled || finding;
  const restaurant = lobby.branch === 'eatout' || lobby.branch === 'takeaway';
  const radiusKm = Math.max(
    MIN_RADIUS_KM,
    Math.min(MAX_RADIUS_KM, Math.round(lobby.searchRadiusMiles * KM_PER_MILE))
  );

  async function findArea() {
    setFinding(true);
    setLocationError('');
    try {
      const area = await resolveArea(query);
      await onChange({
        location: { latitude: area.latitude, longitude: area.longitude, address: area.area },
      });
    } catch (error) {
      setLocationError(
        error instanceof Error
          ? error.message
          : 'Could not find that area. Try another suburb or postcode.'
      );
    } finally {
      setFinding(false);
    }
  }
  function currentLocation() {
    setLocationError('');
    if (!navigator.geolocation) {
      setMode('manual');
      setLocationError('Location is unavailable. Enter your suburb or postcode instead.');
      return;
    }
    setFinding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const { latitude, longitude } = position.coords;
          const address = await reverseGeocode(latitude, longitude)
            .then((area) => area.area)
            .catch(() => undefined);
          await onChange({ location: { latitude, longitude, address } });
          setFinding(false);
        })();
      },
      () => {
        setFinding(false);
        setMode('manual');
        setLocationError(
          'Could not access your location. Enter your suburb or postcode instead, or allow location access and retry.'
        );
      },
      { timeout: 10000 }
    );
  }

  if (!me) return null;
  if (me.waitingForNextRound && lobby.state !== 'waiting')
    return (
      <section className="card space-y-4" aria-labelledby="diet-check-title">
        <h2 id="diet-check-title" className="text-xl font-display font-bold">
          Before you join the swiping
        </h2>
        <p className="text-sm text-muted">
          The group already has a recipe deck. Select all your dietary requirements so we can check
          whether every recipe fits. You are waiting outside this round until that check succeeds.
        </p>
        <Chips
          label="Your dietary requirements"
          values={DIETS}
          selected={pendingDiets}
          onChange={setPendingDiets}
          disabled={disabled}
        />
        <p className="text-xs text-muted">
          No selections means no dietary requirements. Recipe labels are not an allergy-safety
          guarantee; always check ingredients.
        </p>
        <button
          className="btn btn-primary w-full min-h-[48px]"
          disabled={disabled}
          onClick={() => void onChange({ diets: pendingDiets })}
        >
          Check requirements
        </button>
        <p className="text-sm text-muted">
          If the deck cannot satisfy your requirements, the host can return everyone to choices for
          a fresh round.
        </p>
      </section>
    );

  if (lobby.state !== 'waiting') return null;
  return (
    <section className="card space-y-6" aria-labelledby="choices-title">
      <div>
        <h2 id="choices-title" className="text-xl font-display font-bold">
          Make it your kind of night
        </h2>
        <p className="mt-2 text-sm text-muted">
          Choices are optional. Everyone’s interests contribute; choosing nothing means you’re happy
          with anything. Changes ask you to confirm Ready again.
        </p>
      </div>
      {lobby.branch === 'watch' && (
        <>
          <Chips
            label="Movies or series"
            values={MEDIA_TYPES}
            selected={mood.mediaTypes ?? []}
            onChange={(mediaTypes) => void onChange({ mood: { ...mood, mediaTypes } })}
            disabled={busy}
            labels={{ movie: 'Movies', tv: 'Series' }}
          />
          <Chips
            label="Your genres"
            values={GENRES}
            selected={mood.genres}
            onChange={(genres) => void onChange({ mood: { ...mood, genres } })}
            disabled={busy}
          />
          <Chips
            label="Your decades"
            values={DECADES}
            selected={mood.decades}
            onChange={(decades) => void onChange({ mood: { ...mood, decades } })}
            disabled={busy}
          />
        </>
      )}
      {lobby.branch === 'cook' && (
        <>
          <div className="rounded-xl bg-amber/10 p-4">
            <p className="font-bold capitalize">{lobby.mealType}</p>
            <details className="mt-2">
              <summary className="cursor-pointer min-h-[44px] py-2 text-amber">
                Change meal type
              </summary>
              <label htmlFor="mealType" className="label">
                Shared meal type
              </label>
              <select
                id="mealType"
                className="input capitalize"
                value={lobby.mealType}
                disabled={busy}
                onChange={(event) =>
                  void onChange({ mealType: event.target.value as typeof lobby.mealType })
                }
              >
                {MEAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted">
                Anyone can change this. Everyone will confirm Ready again.
              </p>
            </details>
          </div>
          <Chips
            label="Your cuisine interests"
            values={CUISINES}
            selected={me.cuisines ?? []}
            onChange={(cuisines) => void onChange({ cuisines })}
            disabled={busy}
            warm
          />
          <Chips
            label="Your dietary requirements"
            values={DIETS}
            selected={me.diets ?? []}
            onChange={(diets) => void onChange({ diets })}
            disabled={busy}
          />
          <p className="text-xs text-muted">
            Every recipe must meet everyone’s requirements. Recipe labels are not an allergy-safety
            guarantee; always check ingredients.
          </p>
          {isHost ? (
            <div>
              <label htmlFor="headcount" className="label">
                Cooking for
              </label>
              <input
                id="headcount"
                className="input"
                type="number"
                min={1}
                max={MAX_HEADCOUNT}
                value={lobby.headcount}
                disabled={busy}
                onChange={(event) => {
                  const headcount = event.target.valueAsNumber;
                  if (Number.isInteger(headcount) && headcount >= 1 && headcount <= MAX_HEADCOUNT)
                    void onChange({ headcount });
                }}
              />
              <p className="mt-2 text-xs text-muted">
                People eating, not people swiping. Changing this asks everyone to confirm Ready.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Cooking for {lobby.headcount} people · the host can change this.
            </p>
          )}
        </>
      )}
      {restaurant && (
        <section className="space-y-3" aria-label="Shared search area">
          <h3 className="font-bold">Where are we eating?</h3>
          <p className="text-xs text-muted">
            Only used to find restaurants near your group. Agree on one location together; any
            update asks everyone to confirm Ready again.
          </p>
          {lobby.location && (
            <p className="rounded-xl border border-lime/30 bg-lime/10 p-3 text-lime">
              {lobby.location.address ??
                `${lobby.location.latitude.toFixed(4)}, ${lobby.location.longitude.toFixed(4)}`}
            </p>
          )}
          <LocationModeToggle
            mode={mode}
            onSelect={setMode}
            disabled={busy}
            ariaLabel="How to set your location"
          />
          {mode === 'current' ? (
            <button className="btn btn-secondary w-full" disabled={busy} onClick={currentLocation}>
              {finding ? 'Getting location…' : 'Use my current location'}
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                aria-label="Suburb or postcode"
                className="input min-w-0 flex-1"
                maxLength={100}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && query.trim().length >= 2 && !busy) {
                    event.preventDefault();
                    void findArea();
                  }
                }}
                placeholder="e.g. Richmond or 3121"
                disabled={busy}
              />
              <button
                className="btn btn-secondary"
                disabled={busy || query.trim().length < 2}
                onClick={() => void findArea()}
              >
                {finding ? 'Finding…' : 'Find area'}
              </button>
            </div>
          )}
          {locationError && (
            <p role="alert" className="text-sm text-coral-soft">
              {locationError}
            </p>
          )}
          <label htmlFor="radius" className="label">
            Search Radius: {radiusKm} km
          </label>
          <input
            id="radius"
            type="range"
            className="w-full accent-coral"
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            value={radiusKm}
            onChange={(event) =>
              void onChange({ searchRadiusMiles: toBackendRadiusMiles(Number(event.target.value)) })
            }
            disabled={busy}
          />
        </section>
      )}
      {isHost ? (
        <DeckSizeStepper
          value={lobby.deckSize}
          onChange={(deckSize) => void onChange({ deckSize })}
          max={restaurant ? MAX_RESTAURANT_DECK_SIZE : MAX_DECK_SIZE}
          unit={restaurant ? 'restaurants' : lobby.branch === 'cook' ? 'recipes' : 'movies'}
          disabled={busy}
        />
      ) : (
        <p className="text-sm text-muted">
          {lobby.deckSize} to swipe · the host can change the deck size.
        </p>
      )}
      {isHost && (
        <p className="text-xs text-muted">
          Changing the deck size asks everyone to confirm Ready again.
        </p>
      )}
    </section>
  );
}
