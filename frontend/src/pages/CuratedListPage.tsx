// Curated List Page - Food Network "Best of" style editorial list
// Shows a collection of restaurants for a specific cuisine or theme

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TopNav from '../components/TopNav';
import ScrollProgress, { BackToTop } from '../components/ScrollProgress';

// Mock data for curated lists
const CURATED_LISTS: Record<string, {
  title: string;
  subtitle: string;
  description: string;
  heroEmoji: string;
  heroGradient: string;
  restaurants: Array<{
    id: string;
    name: string;
    cuisine: string;
    neighborhood: string;
    rating: number;
    reviewCount: number;
    priceLevel: string;
    distance: string;
    image: string;
    tags: string[];
    highlight: string;
  }>;
}> = {
  'best-italian': {
    title: 'Best Italian',
    subtitle: 'In Your Area',
    description: 'From authentic Neapolitan pizza to handmade pasta, these are the Italian restaurants that transport you straight to Rome. Curated by local food experts.',
    heroEmoji: '🍝',
    heroGradient: 'from-red-900 via-orange-900 to-amber-900',
    restaurants: [
      { id: '1', name: 'Osteria Romano', cuisine: 'Italian', neighborhood: 'Downtown', rating: 4.8, reviewCount: 342, priceLevel: '$$$', distance: '0.3 mi', image: '🍝', tags: ['Romantic', 'Outdoor Seating'], highlight: 'Hand-rolled pasta daily' },
      { id: '2', name: 'Pizzeria Napoli', cuisine: 'Italian', neighborhood: 'Little Italy', rating: 4.7, reviewCount: 528, priceLevel: '$$', distance: '0.8 mi', image: '🍕', tags: ['Casual', 'Family-Friendly'], highlight: 'Wood-fired oven imported from Naples' },
      { id: '3', name: 'Trattoria Bella', cuisine: 'Italian', neighborhood: 'Midtown', rating: 4.6, reviewCount: 215, priceLevel: '$$', distance: '1.2 mi', image: '🥖', tags: ['Cozy', 'Wine Bar'], highlight: 'Nonna\'s secret recipes' },
      { id: '4', name: 'Il Giardino', cuisine: 'Italian', neighborhood: 'Uptown', rating: 4.9, reviewCount: 189, priceLevel: '$$$$', distance: '2.1 mi', image: '🍷', tags: ['Fine Dining', 'Special Occasion'], highlight: 'Michelin-starred chef' },
      { id: '5', name: 'Pasta Fresca', cuisine: 'Italian', neighborhood: 'Arts District', rating: 4.5, reviewCount: 412, priceLevel: '$$', distance: '0.5 mi', image: '🧀', tags: ['Quick Bite', 'Takeout'], highlight: 'Fresh pasta made hourly' },
      { id: '6', name: 'Cucina Rustica', cuisine: 'Italian', neighborhood: 'West End', rating: 4.4, reviewCount: 287, priceLevel: '$$', distance: '1.8 mi', image: '🫒', tags: ['Farm-to-Table', 'Brunch'], highlight: 'Seasonal Italian menu' },
    ],
  },
  'best-mexican': {
    title: 'Best Mexican',
    subtitle: 'In Your Area',
    description: 'Authentic tacos, sizzling fajitas, and margaritas that hit just right. These Mexican spots bring the heat and the flavor.',
    heroEmoji: '🌮',
    heroGradient: 'from-amber-900 via-yellow-900 to-lime-900',
    restaurants: [
      { id: '7', name: 'Taqueria El Sol', cuisine: 'Mexican', neighborhood: 'Downtown', rating: 4.7, reviewCount: 623, priceLevel: '$', distance: '0.4 mi', image: '🌮', tags: ['Authentic', 'Late Night'], highlight: 'Street-style tacos' },
      { id: '8', name: 'Casa Oaxaca', cuisine: 'Mexican', neighborhood: 'Mission', rating: 4.8, reviewCount: 341, priceLevel: '$$$', distance: '1.1 mi', image: '🫔', tags: ['Regional', 'Mole Specialist'], highlight: '7 types of mole' },
      { id: '9', name: 'Mariscos Playa', cuisine: 'Mexican', neighborhood: 'Harbor', rating: 4.6, reviewCount: 287, priceLevel: '$$', distance: '2.3 mi', image: '🦐', tags: ['Seafood', 'Waterfront'], highlight: 'Fresh ceviche daily' },
    ],
  },
  'date-night': {
    title: 'Date Night',
    subtitle: 'Romantic Spots',
    description: 'Impress your special someone at these atmospheric restaurants perfect for romance. Dim lighting, great wine, and unforgettable food.',
    heroEmoji: '💕',
    heroGradient: 'from-rose-900 via-pink-900 to-purple-900',
    restaurants: [
      { id: '10', name: 'The Velvet Room', cuisine: 'French', neighborhood: 'Downtown', rating: 4.9, reviewCount: 156, priceLevel: '$$$$', distance: '0.6 mi', image: '🥂', tags: ['Intimate', 'Tasting Menu'], highlight: 'Candlelit tables for two' },
      { id: '11', name: 'Moonlight Terrace', cuisine: 'Mediterranean', neighborhood: 'Rooftop', rating: 4.7, reviewCount: 289, priceLevel: '$$$', distance: '0.9 mi', image: '🌙', tags: ['Rooftop', 'City Views'], highlight: 'Skyline views at sunset' },
      { id: '12', name: 'Whisper Wine Bar', cuisine: 'Small Plates', neighborhood: 'Old Town', rating: 4.8, reviewCount: 198, priceLevel: '$$$', distance: '1.4 mi', image: '🍷', tags: ['Wine', 'Speakeasy'], highlight: 'Hidden entrance, 200+ wines' },
    ],
  },
};

// Filter options
const SORT_OPTIONS = ['Recommended', 'Rating', 'Distance', 'Price: Low to High', 'Price: High to Low'];
const PRICE_FILTERS = ['$', '$$', '$$$', '$$$$'];

export default function CuratedListPage() {
  const navigate = useNavigate();
  const { listId } = useParams<{ listId: string }>();
  const [sortBy, setSortBy] = useState('Recommended');
  const [selectedPrices, setSelectedPrices] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Get list data or default to italian
  const list = CURATED_LISTS[listId || 'best-italian'] || CURATED_LISTS['best-italian'];

  // Filter and sort restaurants
  let filteredRestaurants = [...list.restaurants];

  if (selectedPrices.length > 0) {
    filteredRestaurants = filteredRestaurants.filter(r => selectedPrices.includes(r.priceLevel));
  }

  if (sortBy === 'Rating') {
    filteredRestaurants.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'Distance') {
    filteredRestaurants.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
  } else if (sortBy === 'Price: Low to High') {
    filteredRestaurants.sort((a, b) => a.priceLevel.length - b.priceLevel.length);
  } else if (sortBy === 'Price: High to Low') {
    filteredRestaurants.sort((a, b) => b.priceLevel.length - a.priceLevel.length);
  }

  const togglePrice = (price: string) => {
    setSelectedPrices(prev =>
      prev.includes(price)
        ? prev.filter(p => p !== price)
        : [...prev, price]
    );
  };

  // Custom actions for nav
  const NavActions = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => navigate('/create', { state: { listId } })}
        className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-midnight bg-amber rounded-xl hover:bg-amber-300 transition-all"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Decide Together
      </button>
      <button className="p-2.5 text-cream-400 hover:text-amber hover:bg-midnight-100 rounded-xl transition-all">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-midnight text-cream">
      {/* Navigation Bar */}
      <TopNav showBackButton rightAction={NavActions} />

      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - Editorial style header
          ═══════════════════════════════════════════════════════════════════ */}
      <section className={`relative pt-16 bg-gradient-to-br ${list.heroGradient}`}>
        {/* Texture overlay */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)`,
            backgroundSize: '32px 32px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-cream/60 text-sm mb-6">
              <button onClick={() => navigate('/home-v2')} className="hover:text-cream transition-colors">Home</button>
              <span>/</span>
              <button onClick={() => navigate('/explore')} className="hover:text-cream transition-colors">Explore</button>
              <span>/</span>
              <span className="text-cream">{list.title}</span>
            </div>

            {/* Title with emoji */}
            <div className="flex items-start gap-4 sm:gap-6 mb-6">
              <div className="text-6xl sm:text-8xl">{list.heroEmoji}</div>
              <div>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-cream leading-tight">
                  {list.title}
                  <span className="block text-cream/70 text-2xl sm:text-3xl lg:text-4xl font-normal mt-1">
                    {list.subtitle}
                  </span>
                </h1>
              </div>
            </div>

            {/* Description */}
            <p className="text-lg sm:text-xl text-cream/80 leading-relaxed max-w-2xl">
              {list.description}
            </p>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-8 text-sm text-cream/60">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {list.restaurants.length} Restaurants
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Updated weekly
              </span>
            </div>
          </div>
        </div>

        {/* Fade to content */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-midnight to-transparent" />
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FILTERS & SORT BAR
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="sticky top-16 z-40 bg-midnight/95 backdrop-blur-md border-b border-midnight-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Filter toggle (mobile) */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden flex items-center gap-2 px-4 py-2 text-sm font-medium text-cream bg-midnight-100 rounded-xl border border-midnight-50/50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {selectedPrices.length > 0 && (
                <span className="w-5 h-5 text-xs bg-amber text-midnight rounded-full flex items-center justify-center">
                  {selectedPrices.length}
                </span>
              )}
            </button>

            {/* Price filters (desktop) */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm text-cream-400 mr-2">Price:</span>
              {PRICE_FILTERS.map(price => (
                <button
                  key={price}
                  onClick={() => togglePrice(price)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                    selectedPrices.includes(price)
                      ? 'bg-amber text-midnight font-medium'
                      : 'bg-midnight-100 text-cream-400 hover:text-cream border border-midnight-50/50'
                  }`}
                >
                  {price}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-cream-400 hidden sm:block">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 text-sm bg-midnight-100 text-cream rounded-xl border border-midnight-50/50 focus:border-amber/50 focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Mobile filter panel */}
          {showFilters && (
            <div className="sm:hidden mt-4 pt-4 border-t border-midnight-50/30">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-cream-400 w-full mb-2">Price:</span>
                {PRICE_FILTERS.map(price => (
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
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          RESTAURANT LIST
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4">
          {filteredRestaurants.map((restaurant, index) => (
            <article
              key={restaurant.id}
              onClick={() => navigate(`/restaurant/${restaurant.id}`)}
              className="group relative bg-midnight-100 rounded-2xl border border-midnight-50/30 hover:border-amber/30 transition-all duration-300 hover:shadow-card-hover cursor-pointer overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row">
                {/* Rank number */}
                <div className="absolute top-4 left-4 sm:relative sm:top-0 sm:left-0 sm:w-20 sm:flex-shrink-0 sm:flex sm:items-center sm:justify-center sm:bg-midnight-200 sm:border-r sm:border-midnight-50/30">
                  <span className="text-3xl sm:text-4xl font-display font-bold text-amber/60 group-hover:text-amber transition-colors">
                    {index + 1}
                  </span>
                </div>

                {/* Image/Emoji area */}
                <div className="h-48 sm:h-auto sm:w-48 sm:flex-shrink-0 bg-gradient-to-br from-midnight-200 to-midnight-100 flex items-center justify-center relative">
                  <span className="text-7xl sm:text-6xl opacity-80 group-hover:scale-110 transition-transform duration-300">
                    {restaurant.image}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    {/* Main info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-display text-xl sm:text-2xl text-cream font-semibold group-hover:text-amber transition-colors">
                          {restaurant.name}
                        </h3>
                        <span className="text-cream-500 text-sm">{restaurant.priceLevel}</span>
                      </div>

                      <div className="flex items-center gap-3 text-sm text-cream-400 mb-3">
                        <span>{restaurant.cuisine}</span>
                        <span className="w-1 h-1 rounded-full bg-cream-500" />
                        <span>{restaurant.neighborhood}</span>
                        <span className="w-1 h-1 rounded-full bg-cream-500" />
                        <span>{restaurant.distance}</span>
                      </div>

                      {/* Highlight quote */}
                      <p className="text-cream-300 italic text-sm sm:text-base mb-4">
                        "{restaurant.highlight}"
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        {restaurant.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 text-xs bg-midnight-200 text-cream-400 rounded-full border border-midnight-50/50"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Rating & actions */}
                    <div className="flex sm:flex-col items-center sm:items-end gap-4 sm:gap-3">
                      {/* Rating */}
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 px-3 py-1.5 bg-amber/20 rounded-lg">
                          <span className="text-amber">★</span>
                          <span className="text-cream font-semibold">{restaurant.rating}</span>
                        </div>
                        <span className="text-cream-500 text-sm">({restaurant.reviewCount})</span>
                      </div>

                      {/* Quick actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Save functionality
                          }}
                          className="p-2 text-cream-400 hover:text-amber hover:bg-midnight-200 rounded-lg transition-all"
                          title="Save"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/create', { state: { restaurantId: restaurant.id } });
                          }}
                          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber border border-amber/40 rounded-lg hover:bg-amber/10 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Vote
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hover arrow indicator */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </article>
          ))}
        </div>

        {/* Empty state */}
        {filteredRestaurants.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🍽️</div>
            <h3 className="font-display text-2xl text-cream mb-2">No restaurants match</h3>
            <p className="text-cream-400 mb-6">Try adjusting your filters</p>
            <button
              onClick={() => setSelectedPrices([])}
              className="px-6 py-3 text-sm font-medium text-amber border border-amber/40 rounded-xl hover:bg-amber/10 transition-all"
            >
              Clear Filters
            </button>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BOTTOM CTA - Start a session with this list
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="bg-midnight-200 border-t border-midnight-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div>
              <h3 className="font-display text-2xl text-cream mb-2">Can't decide alone?</h3>
              <p className="text-cream-400">Start a session and let your group vote on these restaurants</p>
            </div>
            <button
              onClick={() => navigate('/create', { state: { listId, restaurants: list.restaurants } })}
              className="flex items-center gap-2 px-8 py-4 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:shadow-glow transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Decide with Friends
            </button>
          </div>
        </div>
      </section>

      {/* Scroll progress indicator */}
      <ScrollProgress />

      {/* Back to top button */}
      <BackToTop threshold={500} />
    </div>
  );
}
