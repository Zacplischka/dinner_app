// Restaurant Detail Page V2 - Full restaurant profile
// Food Network style with photos, reviews, info, and group decision CTA

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// Mock restaurant data
const RESTAURANTS: Record<string, {
  id: string;
  name: string;
  cuisine: string;
  cuisineEmoji: string;
  neighborhood: string;
  address: string;
  rating: number;
  reviewCount: number;
  priceLevel: string;
  distance: string;
  hours: { day: string; hours: string }[];
  phone: string;
  website: string;
  description: string;
  highlights: string[];
  tags: string[];
  photos: string[];
  reviews: { author: string; rating: number; date: string; text: string }[];
  menu: { category: string; items: { name: string; price: string; description: string }[] }[];
}> = {
  '1': {
    id: '1',
    name: 'Osteria Romano',
    cuisine: 'Italian',
    cuisineEmoji: '🍝',
    neighborhood: 'Downtown',
    address: '123 Main Street, Downtown',
    rating: 4.8,
    reviewCount: 342,
    priceLevel: '$$$',
    distance: '0.3 mi',
    hours: [
      { day: 'Monday', hours: '5:00 PM - 10:00 PM' },
      { day: 'Tuesday', hours: '5:00 PM - 10:00 PM' },
      { day: 'Wednesday', hours: '5:00 PM - 10:00 PM' },
      { day: 'Thursday', hours: '5:00 PM - 10:00 PM' },
      { day: 'Friday', hours: '5:00 PM - 11:00 PM' },
      { day: 'Saturday', hours: '4:00 PM - 11:00 PM' },
      { day: 'Sunday', hours: '4:00 PM - 9:00 PM' },
    ],
    phone: '(555) 123-4567',
    website: 'www.osteriaromano.com',
    description: 'A cozy Italian trattoria bringing the authentic flavors of Rome to your neighborhood. Our chef trained in Italy for 10 years before opening this gem. Every pasta is hand-rolled daily, and our wine list features over 100 selections from small Italian producers.',
    highlights: ['Hand-rolled pasta daily', 'Wood-fired oven', 'Imported Italian ingredients', 'Romantic atmosphere'],
    tags: ['Romantic', 'Outdoor Seating', 'Wine Bar', 'Vegetarian Options', 'Gluten-Free Available'],
    photos: ['🍝', '🍷', '🥖', '🧀', '🫒', '🍰'],
    reviews: [
      { author: 'Sarah M.', rating: 5, date: '2 weeks ago', text: 'The cacio e pepe was absolutely divine! Best Italian food I\'ve had outside of Italy. The atmosphere is so romantic with the candlelit tables.' },
      { author: 'Mike T.', rating: 5, date: '1 month ago', text: 'We celebrated our anniversary here and it was perfect. The staff made us feel so special, and the tiramisu is to die for.' },
      { author: 'Lisa K.', rating: 4, date: '1 month ago', text: 'Great food and ambiance. A bit pricey but worth it for a special occasion. The truffle pasta was incredible.' },
    ],
    menu: [
      {
        category: 'Antipasti',
        items: [
          { name: 'Burrata', price: '$18', description: 'Fresh burrata, heirloom tomatoes, basil oil' },
          { name: 'Carpaccio', price: '$21', description: 'Beef carpaccio, arugula, shaved parmesan' },
        ]
      },
      {
        category: 'Pasta',
        items: [
          { name: 'Cacio e Pepe', price: '$24', description: 'House-made tonnarelli, pecorino, black pepper' },
          { name: 'Truffle Tagliatelle', price: '$32', description: 'Fresh tagliatelle, black truffle, cream' },
          { name: 'Amatriciana', price: '$22', description: 'Bucatini, guanciale, tomato, pecorino' },
        ]
      },
      {
        category: 'Secondi',
        items: [
          { name: 'Branzino', price: '$38', description: 'Whole grilled branzino, lemon, capers' },
          { name: 'Osso Buco', price: '$42', description: 'Braised veal shank, saffron risotto' },
        ]
      },
    ],
  },
  // Add more restaurants as needed
};

export default function RestaurantDetailPageV2() {
  const navigate = useNavigate();
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'reviews'>('overview');
  const [isSaved, setIsSaved] = useState(false);

  // Get restaurant data or show not found
  const restaurant = RESTAURANTS[restaurantId || '1'] || RESTAURANTS['1'];

  // Check if currently open (mock - would be real logic)
  const isOpen = true;
  const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className="min-h-screen bg-midnight text-cream">
      {/* ═══════════════════════════════════════════════════════════════════
          NAVIGATION BAR
          ═══════════════════════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-midnight/90 backdrop-blur-md border-b border-midnight-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Back button */}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-cream-400 hover:text-cream transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSaved(!isSaved)}
                className={`p-2.5 rounded-xl transition-all ${
                  isSaved ? 'text-amber bg-amber/20' : 'text-cream-400 hover:text-cream hover:bg-midnight-100'
                }`}
                title={isSaved ? 'Saved' : 'Save'}
              >
                <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button className="p-2.5 text-cream-400 hover:text-cream hover:bg-midnight-100 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════
          HERO / PHOTO GALLERY
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-16">
        {/* Photo grid */}
        <div className="grid grid-cols-4 gap-1 h-64 sm:h-80 lg:h-96">
          {/* Main large photo */}
          <div className="col-span-4 sm:col-span-2 sm:row-span-2 bg-gradient-to-br from-amber-900/40 to-orange-900/40 flex items-center justify-center relative group cursor-pointer">
            <span className="text-9xl opacity-80 group-hover:scale-110 transition-transform">{restaurant.photos[0]}</span>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </div>
          {/* Smaller photos */}
          {restaurant.photos.slice(1, 5).map((photo, index) => (
            <div
              key={index}
              className="hidden sm:flex bg-gradient-to-br from-midnight-200 to-midnight-100 items-center justify-center group cursor-pointer"
            >
              <span className="text-5xl opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">{photo}</span>
            </div>
          ))}
        </div>

        {/* Photo count badge */}
        <button className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-midnight/90 backdrop-blur-sm text-cream text-sm rounded-xl border border-midnight-50/50 hover:bg-midnight transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          See all {restaurant.photos.length} photos
        </button>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column - Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header info */}
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <h1 className="font-display text-3xl sm:text-4xl text-cream font-semibold mb-2">
                    {restaurant.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-cream-400">
                    <span className="flex items-center gap-1">
                      <span className="text-xl">{restaurant.cuisineEmoji}</span>
                      {restaurant.cuisine}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-cream-500" />
                    <span>{restaurant.priceLevel}</span>
                    <span className="w-1 h-1 rounded-full bg-cream-500" />
                    <span>{restaurant.neighborhood}</span>
                  </div>
                </div>

                {/* Rating badge */}
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="flex items-center gap-1 px-4 py-2 bg-amber/20 rounded-xl mb-1">
                      <span className="text-amber text-lg">★</span>
                      <span className="text-2xl font-bold text-cream">{restaurant.rating}</span>
                    </div>
                    <span className="text-cream-500 text-sm">{restaurant.reviewCount} reviews</span>
                  </div>
                </div>
              </div>

              {/* Status badges */}
              <div className="flex flex-wrap items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  isOpen ? 'bg-success/20 text-success-light' : 'bg-error/20 text-error-light'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-success animate-pulse' : 'bg-error'}`} />
                  {isOpen ? 'Open Now' : 'Closed'}
                </span>
                <span className="text-cream-500 text-sm">{restaurant.distance} away</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-midnight-50/30">
              <div className="flex gap-8">
                {(['overview', 'menu', 'reviews'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-4 text-sm font-medium capitalize transition-colors relative ${
                      activeTab === tab ? 'text-amber' : 'text-cream-400 hover:text-cream'
                    }`}
                  >
                    {tab}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Description */}
                <div>
                  <h2 className="font-display text-xl text-cream mb-3">About</h2>
                  <p className="text-cream-300 leading-relaxed">{restaurant.description}</p>
                </div>

                {/* Highlights */}
                <div>
                  <h2 className="font-display text-xl text-cream mb-4">Highlights</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {restaurant.highlights.map((highlight, index) => (
                      <div key={index} className="flex items-center gap-3 p-4 bg-midnight-100 rounded-xl border border-midnight-50/30">
                        <div className="w-10 h-10 rounded-lg bg-amber/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-cream">{highlight}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <h2 className="font-display text-xl text-cream mb-4">Features</h2>
                  <div className="flex flex-wrap gap-2">
                    {restaurant.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 text-sm bg-midnight-100 text-cream-400 rounded-full border border-midnight-50/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'menu' && (
              <div className="space-y-8">
                {restaurant.menu.map(section => (
                  <div key={section.category}>
                    <h2 className="font-display text-xl text-cream mb-4">{section.category}</h2>
                    <div className="space-y-4">
                      {section.items.map(item => (
                        <div key={item.name} className="flex justify-between items-start p-4 bg-midnight-100 rounded-xl border border-midnight-50/30">
                          <div className="flex-1">
                            <h3 className="text-cream font-medium mb-1">{item.name}</h3>
                            <p className="text-cream-400 text-sm">{item.description}</p>
                          </div>
                          <span className="text-amber font-semibold ml-4">{item.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-6">
                {restaurant.reviews.map((review, index) => (
                  <div key={index} className="p-5 bg-midnight-100 rounded-xl border border-midnight-50/30">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber/20 flex items-center justify-center">
                          <span className="text-amber font-semibold">{review.author[0]}</span>
                        </div>
                        <div>
                          <h4 className="text-cream font-medium">{review.author}</h4>
                          <span className="text-cream-500 text-sm">{review.date}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className={i < review.rating ? 'text-amber' : 'text-midnight-50'}>★</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-cream-300">{review.text}</p>
                  </div>
                ))}

                <button className="w-full py-3 text-amber font-medium border border-amber/40 rounded-xl hover:bg-amber/10 transition-colors">
                  See all {restaurant.reviewCount} reviews
                </button>
              </div>
            )}
          </div>

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            {/* Primary CTA - Group decision */}
            <div className="p-6 bg-gradient-to-br from-amber/20 to-amber/5 rounded-2xl border border-amber/30">
              <h3 className="font-display text-xl text-cream mb-2">Can't decide alone?</h3>
              <p className="text-cream-400 text-sm mb-4">Start a session and let your group vote</p>
              <button
                onClick={() => navigate('/create', { state: { restaurantId: restaurant.id, restaurantName: restaurant.name } })}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-xl hover:shadow-glow transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Decide with Friends
              </button>
            </div>

            {/* Contact card */}
            <div className="p-6 bg-midnight-100 rounded-2xl border border-midnight-50/30 space-y-4">
              {/* Address */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-midnight-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-cream-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-cream">{restaurant.address}</p>
                  <button className="text-amber text-sm hover:underline">Get directions</button>
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-midnight-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-cream-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <a href={`tel:${restaurant.phone}`} className="text-cream hover:text-amber transition-colors">
                  {restaurant.phone}
                </a>
              </div>

              {/* Website */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-midnight-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-cream-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <a href={`https://${restaurant.website}`} target="_blank" rel="noopener noreferrer" className="text-amber hover:underline">
                  {restaurant.website}
                </a>
              </div>
            </div>

            {/* Hours */}
            <div className="p-6 bg-midnight-100 rounded-2xl border border-midnight-50/30">
              <h3 className="font-display text-lg text-cream mb-4">Hours</h3>
              <div className="space-y-2">
                {restaurant.hours.map(({ day, hours }) => (
                  <div key={day} className={`flex justify-between text-sm ${day === currentDay ? 'text-cream font-medium' : 'text-cream-400'}`}>
                    <span>{day}</span>
                    <span>{hours}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map placeholder */}
            <div className="h-48 bg-midnight-100 rounded-2xl border border-midnight-50/30 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-8 h-8 text-cream-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-cream-500 text-sm">Map view</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
