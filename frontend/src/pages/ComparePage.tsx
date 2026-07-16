import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import { getVenues } from '../services/apiClient';
import { useComparisonStore } from '../stores/comparisonStore';

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

export default function ComparePage() {
  const navigate = useNavigate();
  const {
    location,
    suburb,
    radiusMiles,
    venues,
    scrollY,
    selectedCuisine,
    searchQuery,
    setLocation,
    setSuburb,
    setRadiusMiles,
    setVenues,
    setScrollY,
    setSelectedCuisine,
    setSearchQuery,
  } = useComparisonStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  useEffect(() => {
    if (!location) {
      activeRequestKey.current = undefined;
      return;
    }
    if (venues.length > 0) return;

    const requestKey = `${location.latitude}:${location.longitude}:${radiusMiles}`;
    if (activeRequestKey.current === requestKey) return;
    activeRequestKey.current = requestKey;
    setError('');
    setLoading(true);
    getVenues(location, radiusMiles)
      .then((result) => {
        if (activeRequestKey.current === requestKey) {
          setVenues(result.venues);
          setSuburb(result.suburb);
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
  }, [location, radiusMiles, setSuburb, setVenues, venues.length]);

  useEffect(() => {
    if (venues.length > 0) window.scrollTo(0, scrollY);
    return () => setScrollY(window.scrollY);
  }, [scrollY, setScrollY, venues.length]);

  const requestLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setVenues([]);
        setSuburb(undefined);
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      },
      () => setError('Location permission was denied. Enable it and try again.')
    );
  };

  return (
    <main className="min-h-screen text-text">
      <NavigationHeader
        title="Compare delivery prices"
        showBackButton
        onBack={() => navigate('/')}
      />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {!location ? (
          <section className="card text-center">
            <h2 className="font-display text-2xl font-black">Find nearby Venues</h2>
            <p className="mt-2 text-muted">
              Share your location only when you are ready to browse.
            </p>
            <label htmlFor="comparison-radius" className="label mt-6">
              Radius: {radiusMiles} mi
            </label>
            <input
              id="comparison-radius"
              type="range"
              min="1"
              max="15"
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(Number(event.target.value))}
              className="mt-2 w-full accent-coral"
            />
            <button
              type="button"
              onClick={requestLocation}
              className="btn btn-primary mt-6 min-h-[48px] w-full"
            >
              Use my location
            </button>
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
              onClick={() => {
                setVenues([]);
                setSuburb(undefined);
                setLocation(undefined);
              }}
              className="min-h-[44px] rounded-full border border-cyan/40 bg-surface px-4 py-2 text-sm text-cyan"
            >
              near {suburb || 'your location'} · change
            </button>

            {loading && <p className="py-12 text-center text-muted">Finding nearby Venues…</p>}
            {error && (
              <p role="alert" className="rounded-xl bg-coral/10 p-4 text-coral-soft">
                {error}
              </p>
            )}
            {!loading && !error && venues.length === 0 && (
              <p className="py-12 text-center text-muted">No Venues found in this radius.</p>
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
                    className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold ${
                      !selectedCuisine
                        ? 'border-coral bg-coral text-white'
                        : 'border-line bg-raised text-text'
                    }`}
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
                      className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-semibold ${
                        selectedCuisine === cuisine
                          ? 'border-coral bg-coral text-white'
                          : 'border-line bg-raised text-text'
                      }`}
                    >
                      {cuisineEmoji(cuisine)} {cuisineLabel(cuisine)}
                    </button>
                  ))}
                </div>
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
              {filteredVenues.map((venue) => (
                <button
                  key={venue.placeId}
                  type="button"
                  aria-label={`Compare ${venue.name}`}
                  data-place-id={venue.placeId}
                  onClick={() =>
                    navigate(`/compare/${venue.placeId}`, { state: { fromComparisonList: true } })
                  }
                  className="flex min-h-[96px] w-full items-center gap-4 rounded-market-md border border-line bg-gradient-to-br from-raised to-surface p-4 text-left shadow-card"
                >
                  <span className="relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl bg-ink font-display text-2xl font-black text-coral-soft">
                    <span aria-hidden>{venue.name.charAt(0).toUpperCase()}</span>
                    {venue.photoUrl && (
                      <img
                        src={venue.photoUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">
                      {venue.name}
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {venue.cuisineType || 'Venue'} · {venue.rating?.toFixed(1) || 'No rating'} ·{' '}
                      {venue.distanceMiles.toFixed(1)} mi
                    </span>
                  </span>
                  <span className="font-semibold text-cyan">Compare</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
