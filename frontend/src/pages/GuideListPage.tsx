import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NavigationHeader from '../components/NavigationHeader';
import { getGuideList, getRestaurantsForList } from '../demo/guideData';

export default function GuideListPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();

  const list = useMemo(() => (listId ? getGuideList(listId) : undefined), [listId]);
  const restaurants = useMemo(() => (listId ? getRestaurantsForList(listId) : []), [listId]);

  return (
    <main className="min-h-screen bg-warm-gradient">
      <NavigationHeader
        title={list?.title || 'List'}
        subtitle={list?.subtitle}
        showBackButton
        onBack={() => navigate('/')}
      />

      <div className="max-w-2xl mx-auto px-4 py-6 animate-fade-in">
        {list?.description && (
          <div className="card mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-cream-400">{list.description}</p>
              </div>
              {list.badge && <span className="badge badge-amber">{list.badge}</span>}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {restaurants.map((r, idx) => (
            <button
              key={r.placeId}
              onClick={() => navigate(`/r/${r.placeId}`)}
              className="w-full text-left card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
              style={{ animationDelay: `${idx * 45}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className="w-20 h-24 rounded-2xl overflow-hidden bg-midnight-200 border border-midnight-50/30 flex-shrink-0">
                  <img src={r.photoUrl} alt={r.name} className="w-full h-full object-cover" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display text-lg font-semibold text-cream truncate">{r.name}</h3>
                    {r.badges?.[0] && <span className="badge badge-amber">{r.badges[0]}</span>}
                  </div>

                  <p className="text-sm text-cream-500 mb-2">{r.suburb} · {r.cuisineType} · {'$'.repeat(r.priceLevel || 0)}</p>

                  <p className="text-sm text-cream-400 line-clamp-2">{r.take}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="inline-flex items-center gap-1 bg-midnight/60 px-3 py-1 rounded-full">
                    <svg className="w-4 h-4 text-amber" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm font-semibold text-cream">{(r.rating ?? 4.4).toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-cream-500 mt-2">Tap for details</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {restaurants.length === 0 && (
          <div className="card text-center">
            <p className="text-cream-400">No restaurants found for this list.</p>
          </div>
        )}
      </div>
    </main>
  );
}
