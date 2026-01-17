// Explore/Search Page - Filter-driven restaurant discovery
// Food Network style browse experience with curated collections

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CuisineCard, CollectionCard, AnimatedSection } from '../components/EnhancedCards';
import TopNav from '../components/TopNav';
import FloatingNav from '../components/FloatingNav';

// Cuisine categories
const CUISINES = [
  { id: 'italian', name: 'Italian', emoji: '🍝', count: 24 },
  { id: 'mexican', name: 'Mexican', emoji: '🌮', count: 18 },
  { id: 'asian', name: 'Asian', emoji: '🍜', count: 32 },
  { id: 'american', name: 'American', emoji: '🍔', count: 45 },
  { id: 'indian', name: 'Indian', emoji: '🍛', count: 12 },
  { id: 'mediterranean', name: 'Mediterranean', emoji: '🥙', count: 15 },
  { id: 'japanese', name: 'Japanese', emoji: '🍣', count: 21 },
  { id: 'thai', name: 'Thai', emoji: '🍲', count: 9 },
  { id: 'french', name: 'French', emoji: '🥐', count: 8 },
  { id: 'chinese', name: 'Chinese', emoji: '🥡', count: 28 },
];

// Curated collections
const COLLECTIONS = [
  { id: 'date-night', title: 'Date Night', subtitle: 'Romantic spots', emoji: '💕', gradient: 'from-rose-900 to-pink-900', count: 12 },
  { id: 'best-italian', title: 'Best Italian', subtitle: 'Pasta & more', emoji: '🍝', gradient: 'from-red-900 to-orange-900', count: 24 },
  { id: 'late-night', title: 'Late Night', subtitle: 'Open after 10pm', emoji: '🌙', gradient: 'from-indigo-900 to-purple-900', count: 18 },
  { id: 'outdoor-dining', title: 'Outdoor Dining', subtitle: 'Al fresco', emoji: '☀️', gradient: 'from-amber-900 to-yellow-900', count: 15 },
  { id: 'hidden-gems', title: 'Hidden Gems', subtitle: 'Local favorites', emoji: '💎', gradient: 'from-cyan-900 to-blue-900', count: 20 },
  { id: 'brunch', title: 'Best Brunch', subtitle: 'Weekend vibes', emoji: '🥞', gradient: 'from-orange-900 to-amber-900', count: 16 },
];

// Neighborhoods
const NEIGHBORHOODS = [
  'All Areas', 'Downtown', 'Midtown', 'Uptown', 'West End', 'East Side', 'Old Town', 'Arts District', 'Harbor', 'Little Italy'
];

// Price levels
const PRICE_LEVELS = ['$', '$$', '$$$', '$$$$'];

// Mock search results
const MOCK_RESULTS = [
  { id: '1', name: 'Osteria Romano', cuisine: 'Italian', neighborhood: 'Downtown', rating: 4.8, priceLevel: '$$$', distance: '0.3 mi', image: '🍝', isOpen: true },
  { id: '2', name: 'Taqueria El Sol', cuisine: 'Mexican', neighborhood: 'Downtown', rating: 4.7, priceLevel: '$', distance: '0.4 mi', image: '🌮', isOpen: true },
  { id: '3', name: 'Sakura Ramen', cuisine: 'Japanese', neighborhood: 'Midtown', rating: 4.6, priceLevel: '$$', distance: '0.8 mi', image: '🍜', isOpen: true },
  { id: '4', name: 'The Velvet Room', cuisine: 'French', neighborhood: 'Downtown', rating: 4.9, priceLevel: '$$$$', distance: '0.6 mi', image: '🥂', isOpen: false },
  { id: '5', name: 'Pizza Napoli', cuisine: 'Italian', neighborhood: 'Little Italy', rating: 4.5, priceLevel: '$$', distance: '1.2 mi', image: '🍕', isOpen: true },
  { id: '6', name: 'Curry House', cuisine: 'Indian', neighborhood: 'East Side', rating: 4.4, priceLevel: '$$', distance: '1.5 mi', image: '🍛', isOpen: true },
];

export default function ExplorePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialCuisine = (location.state as { cuisine?: string })?.cuisine;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(
    initialCuisine ? [initialCuisine] : []
  );
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('All Areas');
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'discover' | 'search'>(
    initialCuisine ? 'search' : 'discover'
  );

  // Update filters if navigated with a new cuisine
  useEffect(() => {
    if (initialCuisine) {
      setSelectedCuisines([initialCuisine]);
      setViewMode('search');
    }
  }, [initialCuisine]);

  // Filter results based on selections
  const filteredResults = MOCK_RESULTS.filter(r => {
    if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase()) && !r.cuisine.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedCuisines.length > 0 && !selectedCuisines.includes(r.cuisine.toLowerCase())) {
      return false;
    }
    if (selectedNeighborhood !== 'All Areas' && r.neighborhood !== selectedNeighborhood) {
      return false;
    }
    if (selectedPrices.length > 0 && !selectedPrices.includes(r.priceLevel)) {
      return false;
    }
    return true;
  });

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines(prev =>
      prev.includes(cuisine) ? prev.filter(c => c !== cuisine) : [...prev, cuisine]
    );
    setViewMode('search');
  };

  const togglePrice = (price: string) => {
    setSelectedPrices(prev =>
      prev.includes(price) ? prev.filter(p => p !== price) : [...prev, price]
    );
    setViewMode('search');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCuisines([]);
    setSelectedNeighborhood('All Areas');
    setSelectedPrices([]);
    setViewMode('discover');
  };

  const hasActiveFilters = searchQuery || selectedCuisines.length > 0 || selectedNeighborhood !== 'All Areas' || selectedPrices.length > 0;

  // Desktop search bar for nav
  const DesktopSearchBar = (
    <div className="hidden sm:flex items-center gap-3">
      <div className="relative w-64 lg:w-80">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search restaurants..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value) setViewMode('search');
          }}
          className="w-full pl-10 pr-4 py-2 bg-midnight-100 border border-midnight-50/50 rounded-xl text-cream text-sm placeholder:text-cream-500 focus:border-amber/50 focus:outline-none transition-colors"
        />
      </div>
      <button
        onClick={() => navigate('/create')}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-midnight bg-amber rounded-xl hover:bg-amber-300 transition-all"
      >
        Start Session
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-midnight text-cream">
      {/* Navigation Bar */}
      <TopNav rightAction={DesktopSearchBar} />

      {/* Mobile search bar */}
      <div className="sm:hidden fixed top-16 left-0 right-0 z-40 bg-midnight/95 backdrop-blur-md border-b border-midnight-50/30 p-4">
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-cream-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search restaurants..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) setViewMode('search');
            }}
            className="w-full pl-12 pr-4 py-3 bg-midnight-100 border border-midnight-50/50 rounded-xl text-cream placeholder:text-cream-500 focus:border-amber/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Main content */}
      <main className="pt-16 sm:pt-16">
        {/* Filters bar */}
        <section className="sticky top-16 sm:top-16 z-30 bg-midnight/95 backdrop-blur-md border-b border-midnight-50/30 mt-[72px] sm:mt-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
              {/* Filter button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all ${
                  hasActiveFilters
                    ? 'bg-amber/20 text-amber border-amber/40'
                    : 'bg-midnight-100 text-cream border-midnight-50/50 hover:border-cream-500/30'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-amber rounded-full" />
                )}
              </button>

              {/* Quick cuisine filters */}
              {CUISINES.slice(0, 6).map(cuisine => (
                <button
                  key={cuisine.id}
                  onClick={() => toggleCuisine(cuisine.id)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm rounded-xl border transition-all ${
                    selectedCuisines.includes(cuisine.id)
                      ? 'bg-amber text-midnight border-amber font-medium'
                      : 'bg-midnight-100 text-cream-400 border-midnight-50/50 hover:border-cream-500/30 hover:text-cream'
                  }`}
                >
                  <span>{cuisine.emoji}</span>
                  {cuisine.name}
                </button>
              ))}

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex-shrink-0 text-amber text-sm hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Expanded filters panel */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-midnight-50/30 space-y-4">
                {/* Price filter */}
                <div>
                  <span className="text-sm text-cream-400 block mb-2">Price</span>
                  <div className="flex gap-2">
                    {PRICE_LEVELS.map(price => (
                      <button
                        key={price}
                        onClick={() => togglePrice(price)}
                        className={`px-4 py-2 text-sm rounded-lg transition-all ${
                          selectedPrices.includes(price)
                            ? 'bg-amber text-midnight font-medium'
                            : 'bg-midnight-100 text-cream-400 border border-midnight-50/50'
                        }`}
                      >
                        {price}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Neighborhood filter */}
                <div>
                  <span className="text-sm text-cream-400 block mb-2">Neighborhood</span>
                  <select
                    value={selectedNeighborhood}
                    onChange={(e) => {
                      setSelectedNeighborhood(e.target.value);
                      if (e.target.value !== 'All Areas') setViewMode('search');
                    }}
                    className="px-4 py-2 bg-midnight-100 text-cream rounded-xl border border-midnight-50/50 focus:border-amber/50 focus:outline-none"
                  >
                    {NEIGHBORHOODS.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Discovery view (no active search/filters) */}
        {viewMode === 'discover' && !hasActiveFilters && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
            {/* Hero section */}
            <section className="text-center py-8">
              <h1 className="font-display text-4xl sm:text-5xl text-cream font-semibold mb-4">
                Explore Restaurants
              </h1>
              <p className="text-cream-400 text-lg max-w-2xl mx-auto">
                Discover the best spots in your area. Browse by cuisine, explore curated collections, or search for something specific.
              </p>
            </section>

            {/* Curated Collections */}
            <AnimatedSection animation="fade-up" delay={100}>
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-2xl text-cream">Curated Collections</h2>
                  <button className="text-amber text-sm hover:underline">See all</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {COLLECTIONS.map((collection, index) => (
                    <AnimatedSection key={collection.id} animation="scale-up" delay={150 + index * 50}>
                      <CollectionCard
                        id={collection.id}
                        title={collection.title}
                        subtitle={collection.subtitle}
                        emoji={collection.emoji}
                        gradient={collection.gradient}
                        count={collection.count}
                      />
                    </AnimatedSection>
                  ))}
                </div>
              </section>
            </AnimatedSection>

            {/* Browse by Cuisine */}
            <AnimatedSection animation="fade-up" delay={200}>
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-2xl text-cream">Browse by Cuisine</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {CUISINES.map((cuisine, index) => (
                    <AnimatedSection key={cuisine.id} animation="scale-up" delay={250 + index * 30}>
                      <CuisineCard
                        id={cuisine.id}
                        name={cuisine.name}
                        emoji={cuisine.emoji}
                        count={cuisine.count}
                        gradient="from-midnight-100 to-midnight-200"
                        onClick={() => toggleCuisine(cuisine.id)}
                      />
                    </AnimatedSection>
                  ))}
                </div>
              </section>
            </AnimatedSection>

            {/* Popular Near You */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-2xl text-cream">Popular Near You</h2>
                <button className="text-amber text-sm hover:underline">See all</button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {MOCK_RESULTS.slice(0, 3).map(restaurant => (
                  <button
                    key={restaurant.id}
                    onClick={() => navigate(`/restaurant/${restaurant.id}`)}
                    className="group text-left p-4 bg-midnight-100 rounded-xl border border-midnight-50/30 hover:border-amber/30 transition-all hover:shadow-card-hover"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-xl bg-midnight-200 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                        <span className="text-3xl">{restaurant.image}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-cream font-medium truncate group-hover:text-amber transition-colors">{restaurant.name}</h3>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${restaurant.isOpen ? 'bg-success' : 'bg-cream-500'}`} />
                        </div>
                        <p className="text-cream-400 text-sm mb-2">{restaurant.cuisine} • {restaurant.priceLevel} • {restaurant.distance}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-amber">★</span>
                          <span className="text-cream text-sm">{restaurant.rating}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Search results view */}
        {(viewMode === 'search' || hasActiveFilters) && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Results header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display text-2xl text-cream">
                  {searchQuery ? `Results for "${searchQuery}"` : 'Restaurants'}
                </h2>
                <p className="text-cream-400 text-sm">{filteredResults.length} places found</p>
              </div>
              <button
                onClick={() => navigate('/create', { state: { restaurants: filteredResults } })}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber border border-amber/40 rounded-xl hover:bg-amber/10 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Vote on These
              </button>
            </div>

            {/* Results grid */}
            {filteredResults.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredResults.map(restaurant => (
                  <button
                    key={restaurant.id}
                    onClick={() => navigate(`/restaurant/${restaurant.id}`)}
                    className="group text-left bg-midnight-100 rounded-xl border border-midnight-50/30 hover:border-amber/30 transition-all hover:shadow-card-hover overflow-hidden"
                  >
                    {/* Image area */}
                    <div className="h-32 bg-gradient-to-br from-midnight-200 to-midnight-100 flex items-center justify-center relative">
                      <span className="text-6xl opacity-70 group-hover:scale-110 transition-transform">{restaurant.image}</span>
                      {/* Status badge */}
                      <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${
                        restaurant.isOpen ? 'bg-success/20 text-success-light' : 'bg-midnight/80 text-cream-400'
                      }`}>
                        {restaurant.isOpen ? 'Open' : 'Closed'}
                      </div>
                    </div>
                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-cream font-medium group-hover:text-amber transition-colors">{restaurant.name}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-amber text-sm">★</span>
                          <span className="text-cream text-sm">{restaurant.rating}</span>
                        </div>
                      </div>
                      <p className="text-cream-400 text-sm">{restaurant.cuisine} • {restaurant.priceLevel} • {restaurant.neighborhood}</p>
                      <p className="text-cream-500 text-sm mt-1">{restaurant.distance}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Empty state */
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="font-display text-2xl text-cream mb-2">No restaurants found</h3>
                <p className="text-cream-400 mb-6">Try adjusting your search or filters</p>
                <button
                  onClick={clearFilters}
                  className="px-6 py-3 text-sm font-medium text-amber border border-amber/40 rounded-xl hover:bg-amber/10 transition-all"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating mobile navigation */}
      <FloatingNav />

      {/* Bottom padding for floating nav on mobile */}
      <div className="h-24 sm:hidden" />
    </div>
  );
}
