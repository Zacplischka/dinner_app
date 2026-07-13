import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import { getVenues } from '../services/apiClient';
import { useComparisonStore } from '../stores/comparisonStore';

export default function ComparePage() {
  const navigate = useNavigate();
  const {
    location,
    suburb,
    radiusMiles,
    venues,
    scrollY,
    setLocation,
    setSuburb,
    setRadiusMiles,
    setVenues,
    setScrollY,
  } = useComparisonStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeRequestKey = useRef<string>();

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
    <main className="min-h-screen bg-warm-gradient text-cream">
      <NavigationHeader title="Compare delivery prices" showBackButton onBack={() => navigate('/')} />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {!location ? (
          <section className="rounded-2xl border border-midnight-50/30 bg-midnight-100 p-6 text-center shadow-card">
            <h2 className="font-display text-2xl">Find nearby Venues</h2>
            <p className="mt-2 text-cream-400">Share your location only when you are ready to browse.</p>
            <label htmlFor="comparison-radius" className="mt-6 block text-sm text-cream-300">
              Radius: {radiusMiles} mi
            </label>
            <input
              id="comparison-radius"
              type="range"
              min="1"
              max="15"
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(Number(event.target.value))}
              className="mt-2 w-full accent-amber"
            />
            <button
              type="button"
              onClick={requestLocation}
              className="mt-6 min-h-[48px] w-full rounded-xl bg-amber px-5 py-3 font-semibold text-midnight"
            >
              Use my location
            </button>
            {error && <p role="alert" className="mt-4 text-sm text-warning">{error}</p>}
          </section>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setVenues([]); setSuburb(undefined); setLocation(undefined); }}
              className="rounded-full border border-amber/30 px-4 py-2 text-sm text-amber"
            >
              near {suburb || 'your location'} · change
            </button>

            {loading && <p className="py-12 text-center text-cream-400">Finding nearby Venues…</p>}
            {error && <p role="alert" className="rounded-xl bg-warning/10 p-4 text-warning">{error}</p>}
            {!loading && !error && venues.length === 0 && (
              <p className="py-12 text-center text-cream-400">No Venues found in this radius.</p>
            )}

            <div className="space-y-3">
              {venues.map((venue) => (
                <button
                  key={venue.placeId}
                  type="button"
                  aria-label={`Compare ${venue.name}`}
                  data-place-id={venue.placeId}
                  onClick={() => navigate(`/compare/${venue.placeId}`, { state: { fromComparisonList: true } })}
                  className="flex min-h-[96px] w-full items-center gap-4 rounded-2xl border border-midnight-50/30 bg-midnight-100 p-4 text-left shadow-card"
                >
                  {venue.photoUrl && <img src={venue.photoUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-semibold">{venue.name}</span>
                    <span className="mt-1 block text-sm text-cream-400">
                      {venue.cuisineType || 'Venue'} · {venue.rating?.toFixed(1) || 'No rating'} · {venue.distanceMiles.toFixed(1)} mi
                    </span>
                  </span>
                  <span className="font-semibold text-amber">Compare</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
