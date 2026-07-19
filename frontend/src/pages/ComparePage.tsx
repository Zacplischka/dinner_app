// Venue discovery (#80): choose an area (current location or suburb/postcode),
// browse nearby Venues with explicit sort and km language, tap a row to compare.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import LocationModeToggle from '../components/LocationModeToggle';
import { getVenues } from '../services/apiClient';
import { resolveArea } from '../services/resolveArea';
import { useComparisonStore, VENUE_PAGE_SIZE } from '../stores/comparisonStore';

const KM_PER_MILE = 1.609344;
const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 24;

function cuisineLabel(cuisine: string) {
  return cuisine.replace(/\s+restaurant$/i, '');
}

function cuisineEmoji(cuisine: string) {
  const value = cuisine.toLowerCase();
  if (value.includes('pizza') || value.includes('italian')) return '🍕';
  if (value.includes('sushi') || value.includes('japanese')) return '🍣';
  if (value.includes('chinese') || value.includes('asian fusion')) return '🥡';
  if (value.includes('noodle') || value.includes('ramen') || value.includes('thai')) return '🍜';
  if (value.includes('indian') || value.includes('curry')) return '🍛';
  if (value.includes('mexican') || value.includes('taco')) return '🌮';
  if (value.includes('burger') || value.includes('american')) return '🍔';
  if (value.includes('cafe') || value.includes('coffee')) return '☕';
  return '🍽️';
}

const PHOTO_RETRY_DELAY_MS = 2000;

// A failed photo load is usually a transient proxy/rate-limit error, so retry
// once after a short delay — a fresh node per attempt, so the browser
// re-requests the URL — before settling for the letter tile behind the image.
function VenuePhoto({ url }: { url: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  if (failed) return null;

  return (
    <img
      key={attempt}
      src={url}
      alt=""
      loading="lazy"
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => {
        if (attempt > 0) {
          setFailed(true);
        } else if (retryTimer.current === undefined) {
          retryTimer.current = setTimeout(() => setAttempt(1), PHOTO_RETRY_DELAY_MS);
        }
      }}
    />
  );
}

const sortChipClass = (active: boolean) =>
  `min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold ${
    active ? 'border-coral bg-coral text-white' : 'border-line bg-raised text-text'
  }`;

export default function ComparePage() {
  const navigate = useNavigate();
  const {
    location,
    suburb,
    radiusKm,
    venues,
    scrollY,
    visibleCount,
    sortBy,
    selectedCuisine,
    searchQuery,
    setLocation,
    setSuburb,
    setRadiusKm,
    setVenues,
    setScrollY,
    setVisibleCount,
    setSortBy,
    setSelectedCuisine,
    setSearchQuery,
  } = useComparisonStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationMode, setLocationMode] = useState<'current' | 'manual'>('current');
  const [manualQuery, setManualQuery] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingArea, setIsResolvingArea] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const activeRequestKey = useRef<string>();
  const cuisineCounts = new Map<string, number>();
  for (const venue of venues) {
    if (venue.cuisineType) {
      cuisineCounts.set(venue.cuisineType, (cuisineCounts.get(venue.cuisineType) || 0) + 1);
    }
  }
  const cuisines = [...cuisineCounts].sort(
    ([first, firstCount], [second, secondCount]) =>
      secondCount - firstCount || cuisineLabel(first).localeCompare(cuisineLabel(second))
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredVenues = venues.filter(
    (venue) =>
      (!selectedCuisine || venue.cuisineType === selectedCuisine) &&
      (!normalizedQuery ||
        venue.name.toLowerCase().includes(normalizedQuery) ||
        venue.cuisineType?.toLowerCase().includes(normalizedQuery))
  );
  const hasRatings = venues.some((venue) => venue.rating !== undefined);
  const sortedVenues = [...filteredVenues].sort((first, second) =>
    sortBy === 'rating'
      ? (second.rating ?? 0) - (first.rating ?? 0) || first.distanceMiles - second.distanceMiles
      : first.distanceMiles - second.distanceMiles
  );
  const visibleVenues = sortedVenues.slice(0, visibleCount);

  useEffect(() => {
    if (!location) {
      activeRequestKey.current = undefined;
      return;
    }
    if (venues.length > 0) return;

    const requestKey = `${location.latitude}:${location.longitude}:${radiusKm}:${retryNonce}`;
    if (activeRequestKey.current === requestKey) return;
    activeRequestKey.current = requestKey;
    // Backend contract is miles (1-15); the UI speaks kilometres.
    const radiusMiles = Math.min(15, Math.max(1, Math.round((radiusKm / KM_PER_MILE) * 10) / 10));
    setError('');
    setLoading(true);
    getVenues(location, radiusMiles)
      .then((result) => {
        if (activeRequestKey.current === requestKey) {
          setVenues(result.venues);
          setVisibleCount(VENUE_PAGE_SIZE);
          // Keep a manually entered area name when reverse geocoding finds nothing.
          if (result.suburb) setSuburb(result.suburb);
        }
      })
      .catch((cause: unknown) => {
        if (activeRequestKey.current === requestKey) {
          setError(cause instanceof Error ? cause.message : 'Could not load Venues');
        }
      })
      .finally(() => {
        if (activeRequestKey.current === requestKey) {
          activeRequestKey.current = undefined;
          setLoading(false);
        }
      });
  }, [location, radiusKm, retryNonce, setSuburb, setVenues, setVisibleCount, venues.length]);

  useEffect(() => {
    if (venues.length > 0) window.scrollTo(0, scrollY);
    return () => setScrollY(window.scrollY);
  }, [scrollY, setScrollY, venues.length]);

  const requestLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('This browser doesn’t support location. Enter your suburb or postcode instead.');
      setLocationMode('manual');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setVenues([]);
        setSuburb(undefined);
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setIsLocating(false);
      },
      (geoError) => {
        if (geoError.code === 1) {
          setError(
            'Location access is blocked for this site. Enter your suburb or postcode instead, or allow location access and try again.'
          );
          setLocationMode('manual');
        } else {
          setError(
            'We couldn’t determine your location. Try again, or enter your suburb or postcode instead.'
          );
        }
        setIsLocating(false);
      }
    );
  };

  const handleResolveArea = async () => {
    setError('');
    setIsResolvingArea(true);
    try {
      const resolved = await resolveArea(manualQuery);
      setVenues([]);
      setSuburb(resolved.area);
      setLocation({ latitude: resolved.latitude, longitude: resolved.longitude });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t look up that area.');
    } finally {
      setIsResolvingArea(false);
    }
  };

  const changeArea = () => {
    setVenues([]);
    setSuburb(undefined);
    setLocation(undefined);
    setError('');
  };

  const busy = isLocating || isResolvingArea;

  return (
    <main className="min-h-screen text-text">
      <NavigationHeader title="Compare menu prices" showBackButton onBack={() => navigate('/')} />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {!location ? (
          <section className="card text-center">
            <h2 className="font-display text-2xl font-black">Find nearby Venues</h2>
            <p className="mt-2 text-muted">
              Pick an area to browse Venues near you, then tap one to compare its listed menu prices
              and current Deals on Uber Eats and DoorDash. We only show what each app lists.
            </p>

            <LocationModeToggle
              mode={locationMode}
              onSelect={(mode) => {
                setLocationMode(mode);
                setError('');
              }}
              disabled={busy}
              ariaLabel="How to set your area"
              className="mt-6"
            />

            <label htmlFor="comparison-radius" className="label mt-6">
              Search radius: {radiusKm} km
            </label>
            <input
              id="comparison-radius"
              type="range"
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
              className="mt-2 w-full accent-coral"
            />

            {locationMode === 'current' ? (
              <button
                type="button"
                onClick={requestLocation}
                disabled={busy}
                className="btn btn-primary mt-6 min-h-[48px] w-full"
              >
                {isLocating ? 'Getting location…' : 'Use my location'}
              </button>
            ) : (
              <div className="mt-6 flex gap-2">
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(event) => setManualQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleResolveArea();
                    }
                  }}
                  placeholder="e.g. Richmond or 3121"
                  maxLength={100}
                  aria-label="Suburb or postcode"
                  disabled={busy}
                  className="input min-h-[48px] flex-1"
                />
                <button
                  type="button"
                  onClick={() => void handleResolveArea()}
                  disabled={busy || manualQuery.trim().length < 2}
                  className="btn whitespace-nowrap border border-cyan/60 bg-cyan/10 text-cyan"
                >
                  {isResolvingArea ? 'Finding…' : 'Find area'}
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-coral-soft">
                {error}
              </p>
            )}
          </section>
        ) : (
          <>
            <button
              type="button"
              onClick={changeArea}
              className="min-h-[44px] rounded-full border border-cyan/40 bg-surface px-4 py-2 text-sm text-cyan"
            >
              near {suburb || 'your location'} · change
            </button>

            {loading && <p className="py-12 text-center text-muted">Finding nearby Venues…</p>}
            {error && (
              <div role="alert" className="rounded-xl bg-coral/10 p-4 text-coral-soft">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setRetryNonce(retryNonce + 1);
                  }}
                  className="btn btn-secondary mt-3 min-h-[44px]"
                >
                  Try again
                </button>
              </div>
            )}
            {!loading && !error && venues.length === 0 && (
              <section className="rounded-market-md border border-line bg-raised p-6 text-center">
                <p className="font-display text-lg font-semibold">No Venues within {radiusKm} km</p>
                <p className="mt-2 text-sm text-muted">Try a wider radius or a different area.</p>
                <button
                  type="button"
                  onClick={changeArea}
                  className="btn btn-secondary mt-4 min-h-[44px]"
                >
                  Change area
                </button>
              </section>
            )}

            {venues.length > 0 && (
              <input
                type="search"
                aria-label="Search Venues"
                placeholder="Search Venues"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="input min-h-[48px] w-full"
              />
            )}

            {venues.length > 0 && (
              <div
                role="group"
                aria-label="Filter by Cuisine"
                className="-mx-4 overflow-x-auto px-4 pb-1"
              >
                <div className="flex w-max gap-2">
                  <button
                    type="button"
                    aria-pressed={!selectedCuisine}
                    onClick={() => setSelectedCuisine(undefined)}
                    className={sortChipClass(!selectedCuisine)}
                  >
                    🍽️ All
                  </button>
                  {cuisines.map(([cuisine]) => (
                    <button
                      key={cuisine}
                      type="button"
                      aria-pressed={selectedCuisine === cuisine}
                      onClick={() =>
                        setSelectedCuisine(selectedCuisine === cuisine ? undefined : cuisine)
                      }
                      className={sortChipClass(selectedCuisine === cuisine)}
                    >
                      {cuisineEmoji(cuisine)} {cuisineLabel(cuisine)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {venues.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="group" aria-label="Sort order" className="flex gap-2">
                  <button
                    type="button"
                    aria-pressed={sortBy === 'nearest'}
                    onClick={() => setSortBy('nearest')}
                    className={sortChipClass(sortBy === 'nearest')}
                  >
                    Nearest
                  </button>
                  {hasRatings && (
                    <button
                      type="button"
                      aria-pressed={sortBy === 'rating'}
                      onClick={() => setSortBy('rating')}
                      className={sortChipClass(sortBy === 'rating')}
                    >
                      Top rated
                    </button>
                  )}
                </div>
                <p className="text-sm text-muted">
                  {filteredVenues.length === venues.length
                    ? `${venues.length} Venues`
                    : `${filteredVenues.length} of ${venues.length} Venues`}{' '}
                  · {radiusKm} km radius
                </p>
              </div>
            )}

            {venues.length > 0 && filteredVenues.length === 0 && (
              <section className="rounded-market-md border border-line bg-raised p-6 text-center">
                <p className="font-display text-lg font-semibold">No Venues match</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCuisine(undefined);
                    setSearchQuery('');
                  }}
                  className="btn btn-secondary mt-4 min-h-[44px]"
                >
                  Clear filters
                </button>
              </section>
            )}

            <div className="space-y-3">
              {visibleVenues.map((venue) => (
                <button
                  key={venue.placeId}
                  type="button"
                  data-place-id={venue.placeId}
                  onClick={() =>
                    navigate(`/compare/${venue.placeId}`, { state: { fromComparisonList: true } })
                  }
                  className="flex min-h-[96px] w-full items-center gap-4 rounded-market-md border border-line bg-gradient-to-br from-raised to-surface p-4 text-left shadow-card"
                >
                  <span className="relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl bg-ink font-display text-2xl font-black text-coral-soft">
                    <span aria-hidden>{venue.name.charAt(0).toUpperCase()}</span>
                    {venue.photoUrl && <VenuePhoto url={venue.photoUrl} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words font-display text-lg font-semibold">
                      {venue.name}
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {venue.cuisineType ? cuisineLabel(venue.cuisineType) : 'Venue'} ·{' '}
                      {venue.rating !== undefined ? `★ ${venue.rating.toFixed(1)}` : 'No rating'} ·{' '}
                      {(venue.distanceMiles * KM_PER_MILE).toFixed(1)} km
                    </span>
                  </span>
                  <span aria-hidden className="text-2xl text-muted">
                    ›
                  </span>
                </button>
              ))}
            </div>

            {sortedVenues.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount(visibleCount + VENUE_PAGE_SIZE)}
                className="btn btn-secondary min-h-[48px] w-full"
              >
                Show {Math.min(VENUE_PAGE_SIZE, sortedVenues.length - visibleCount)} more Venues
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
