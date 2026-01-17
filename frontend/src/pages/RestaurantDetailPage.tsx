import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import { getGuideRestaurant, GUIDE_LISTS } from '../demo/guideData';

export default function RestaurantDetailPage() {
  const navigate = useNavigate();
  const { placeId } = useParams<{ placeId: string }>();

  const restaurant = useMemo(() => (placeId ? getGuideRestaurant(placeId) : undefined), [placeId]);

  const inLists = useMemo(() => {
    if (!restaurant) return [];
    return GUIDE_LISTS.filter((l) => l.restaurantIds.includes(restaurant.placeId));
  }, [restaurant]);

  if (!restaurant) {
    return (
      <main className="min-h-screen bg-warm-gradient">
        <NavigationHeader title="Restaurant" showBackButton onBack={() => navigate(-1)} />
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="card">
            <p className="text-cream-400">Restaurant not found.</p>
          </div>
        </div>
      </main>
    );
  }

  const price = '$'.repeat(restaurant.priceLevel || 0);

  return (
    <main className="min-h-screen bg-warm-gradient">
      <NavigationHeader
        title={restaurant.name}
        subtitle={`${restaurant.suburb} · ${restaurant.cuisineType ?? 'Restaurant'} · ${price}`}
        showBackButton
        onBack={() => navigate(-1)}
        rightAction={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 bg-midnight/60 px-3 py-1 rounded-full">
              <svg className="w-4 h-4 text-amber" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-sm font-semibold text-cream">{(restaurant.rating ?? 4.4).toFixed(1)}</span>
            </div>
          </div>
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-6 animate-fade-in space-y-4">
        <div className="relative rounded-3xl overflow-hidden border border-midnight-50/30 shadow-card">
          <div className="aspect-[3/2] sm:aspect-[16/9]">
            <img
              src={restaurant.photoUrl}
              alt={restaurant.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex flex-wrap gap-2 mb-3">
              {restaurant.badges.map((b) => (
                <span key={b} className="badge badge-amber">{b}</span>
              ))}
            </div>
            <p className="text-cream-300 max-w-xl">{restaurant.take}</p>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap gap-2 mb-4">
            {restaurant.badges.map((b) => (
              <span key={b} className="badge badge-amber">{b}</span>
            ))}
            {restaurant.bestFor.slice(0, 3).map((b) => (
              <span key={b} className="badge bg-midnight-200 text-cream-300 border border-midnight-50/30">{b}</span>
            ))}
          </div>

          <h2 className="font-display text-xl font-semibold text-cream mb-2">The take</h2>
          <p className="text-cream-400">{restaurant.take}</p>

          <div className="divider my-5" />

          <h3 className="font-display text-lg font-semibold text-cream mb-2">What to order</h3>
          <ul className="text-cream-400 space-y-1">
            {restaurant.whatToOrder.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <span className="text-amber mt-0.5">•</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>

          <div className="divider my-5" />

          <h3 className="font-display text-lg font-semibold text-cream mb-2">Good to know</h3>
          <ul className="text-cream-400 space-y-1">
            {restaurant.goodToKnow.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <span className="text-amber mt-0.5">•</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            className="btn btn-primary"
            onClick={() => navigate('/create')}
          >
            Make the Call
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/lists/tonight`)}
          >
            Back to Shortlists
          </button>
        </div>

        {inLists.length > 0 && (
          <div className="card">
            <h3 className="font-display text-lg font-semibold text-cream mb-3">Appears in</h3>
            <div className="flex flex-col gap-2">
              {inLists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/lists/${l.id}`)}
                  className="text-left p-3 rounded-xl bg-midnight-200/50 border border-midnight-50/20 hover:border-amber/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-cream font-medium">{l.title}</p>
                      <p className="text-xs text-cream-500">{l.subtitle}</p>
                    </div>
                    {l.badge && <span className="badge badge-amber">{l.badge}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
