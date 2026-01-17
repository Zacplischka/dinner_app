// Home page redesign - Food Network "Best Food in America" inspired layout
// Editorial magazine aesthetic with cuisine exploration focus

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import TopNav from '../components/TopNav';
import FloatingNav from '../components/FloatingNav';
import { BackToTop } from '../components/ScrollProgress';

// Cuisine category data with gradient colors for visual cards
const CUISINE_CATEGORIES = [
  { id: 'italian', name: 'Italian', emoji: '🍝', gradient: 'from-red-900/80 to-orange-900/60', description: 'Pasta, Pizza & More' },
  { id: 'mexican', name: 'Mexican', emoji: '🌮', gradient: 'from-amber-900/80 to-yellow-900/60', description: 'Tacos, Burritos & Más' },
  { id: 'asian', name: 'Asian', emoji: '🍜', gradient: 'from-rose-900/80 to-pink-900/60', description: 'Ramen, Sushi & Beyond' },
  { id: 'american', name: 'American', emoji: '🍔', gradient: 'from-blue-900/80 to-indigo-900/60', description: 'Burgers, BBQ & Classics' },
  { id: 'indian', name: 'Indian', emoji: '🍛', gradient: 'from-orange-900/80 to-amber-900/60', description: 'Curry, Tandoori & Spice' },
  { id: 'mediterranean', name: 'Mediterranean', emoji: '🥙', gradient: 'from-cyan-900/80 to-teal-900/60', description: 'Fresh, Healthy & Vibrant' },
];

// How it works steps
const HOW_IT_WORKS = [
  { step: 1, title: 'Create a Session', description: 'Set your location and invite friends to join your dinner decision.', icon: 'create' },
  { step: 2, title: 'Swipe & Vote', description: 'Everyone swipes through restaurants. Right for yes, left for no.', icon: 'swipe' },
  { step: 3, title: 'Find Your Match', description: 'See which restaurants everyone agreed on. Decision made!', icon: 'match' },
];

export default function HomePageRedesign() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { friendRequests, sessionInvites, fetchFriendRequests, fetchSessionInvites } = useFriendsStore();
  const [, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFriendRequests();
      fetchSessionInvites();
    }
  }, [isAuthenticated, fetchFriendRequests, fetchSessionInvites]);

  // notificationCount now handled by TopNav
  void (friendRequests.length + sessionInvites.length);

  return (
    <div className="min-h-screen bg-midnight text-cream overflow-x-hidden">
      {/* Navigation Bar */}
      <TopNav />

      {/* ═══════════════════════════════════════════════════════════════════
          HERO SECTION - Editorial magazine style
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative pt-16 min-h-[85vh] flex items-center overflow-hidden">
        {/* Atmospheric background layers */}
        <div className="absolute inset-0">
          {/* Base gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-midnight via-midnight-200 to-midnight" />

          {/* Warm ambient glow - top */}
          <div className="absolute top-0 left-1/4 w-[800px] h-[600px] bg-amber/8 rounded-full blur-[120px] -translate-y-1/2" />

          {/* Cool accent - bottom right */}
          <div className="absolute bottom-0 right-0 w-[600px] h-[500px] bg-rose-900/10 rounded-full blur-[100px] translate-y-1/3" />

          {/* Decorative food silhouettes - abstract shapes */}
          <div className="absolute top-32 right-[10%] w-48 h-48 opacity-5">
            <div className="w-full h-full rounded-full border-[3px] border-cream rotate-12" />
            <div className="absolute top-4 left-4 w-40 h-40 rounded-full border-[2px] border-cream" />
          </div>
          <div className="absolute bottom-32 left-[5%] w-32 h-32 opacity-5">
            <div className="w-full h-full rounded-2xl border-[3px] border-amber -rotate-12" />
          </div>

          {/* Grid texture overlay */}
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `linear-gradient(rgba(245, 240, 232, 0.1) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(245, 240, 232, 0.1) 1px, transparent 1px)`,
              backgroundSize: '60px 60px'
            }}
          />
        </div>

        {/* Hero content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left column - Text content */}
            <div className="text-center lg:text-left space-y-8 animate-fade-in">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-amber/10 border border-amber/20 rounded-full">
                <span className="w-2 h-2 bg-amber rounded-full animate-pulse" />
                <span className="text-sm text-amber font-medium tracking-wide uppercase">Group Dining Simplified</span>
              </div>

              {/* Main headline - Editorial typography */}
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-semibold text-cream leading-[1.1] tracking-tight">
                Find the
                <span className="block text-amber-gradient">Perfect Spot</span>
                <span className="block text-cream-300">Together</span>
              </h1>

              {/* Subheadline */}
              <p className="text-xl sm:text-2xl text-cream-400 font-light leading-relaxed max-w-xl mx-auto lg:mx-0">
                Stop the endless "where should we eat?" debate. Swipe, match, and discover restaurants everyone will love.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
                <button
                  onClick={() => navigate('/create')}
                  className="group relative px-8 py-4 text-lg font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-2xl overflow-hidden transition-all duration-300 shadow-glow hover:shadow-glow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Start a Session
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </button>

                <button
                  onClick={() => navigate('/join')}
                  className="px-8 py-4 text-lg font-semibold text-amber bg-transparent border-2 border-amber/40 rounded-2xl hover:bg-amber/10 hover:border-amber transition-all duration-300 active:scale-[0.98]"
                >
                  Join with Code
                </button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-6 justify-center lg:justify-start pt-4 text-cream-500">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {['😊', '🤩', '😋', '🥳'].map((emoji, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-midnight-100 border-2 border-midnight flex items-center justify-center text-sm">
                        {emoji}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm">Join 1000+ groups</span>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-amber">★★★★★</span>
                  <span className="text-sm">4.9 rating</span>
                </div>
              </div>
            </div>

            {/* Right column - Visual element (card preview) */}
            <div className="hidden lg:flex justify-center items-center relative">
              {/* Floating food cards - preview of swipe interface */}
              <div className="relative w-80 h-[450px]">
                {/* Background card */}
                <div className="absolute top-8 left-8 w-full h-full rounded-3xl bg-midnight-100 border border-midnight-50/30 rotate-6 opacity-40" />

                {/* Middle card */}
                <div className="absolute top-4 left-4 w-full h-full rounded-3xl bg-midnight-100 border border-midnight-50/30 rotate-3 opacity-70" />

                {/* Front card */}
                <div className="relative w-full h-full rounded-3xl bg-gradient-to-b from-midnight-100 to-midnight-200 border border-amber/20 shadow-card-hover overflow-hidden">
                  {/* Card image area */}
                  <div className="h-64 bg-gradient-to-br from-amber-900/30 via-orange-900/20 to-rose-900/30 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-8xl opacity-80">🍜</span>
                    </div>
                    {/* Rating badge */}
                    <div className="absolute top-4 right-4 px-3 py-1.5 bg-midnight/80 backdrop-blur-sm rounded-full flex items-center gap-1.5">
                      <span className="text-amber text-sm">★</span>
                      <span className="text-cream text-sm font-medium">4.7</span>
                    </div>
                  </div>

                  {/* Card content */}
                  <div className="p-6 space-y-3">
                    <h3 className="font-display text-2xl text-cream">Sakura Ramen House</h3>
                    <p className="text-cream-400 text-sm">Japanese • $$$ • 0.8 mi</p>
                    <div className="flex items-center gap-2 pt-2">
                      <span className="px-2 py-1 text-xs bg-amber/20 text-amber rounded-full">Popular</span>
                      <span className="px-2 py-1 text-xs bg-success/20 text-success-light rounded-full">Open Now</span>
                    </div>
                  </div>

                  {/* Swipe hint */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-cream-500 text-sm">
                    <span className="flex items-center gap-1">👈 Nope</span>
                    <span className="flex items-center gap-1">Like 👉</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="text-cream-500 text-xs uppercase tracking-widest">Explore</span>
          <svg className="w-5 h-5 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          CUISINE CATEGORIES - Food Network style grid
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 bg-midnight-200">
        {/* Section background accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-midnight via-transparent to-midnight pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16 space-y-4">
            <span className="text-amber text-sm font-medium tracking-[0.2em] uppercase">Discover By Cuisine</span>
            <h2 className="font-display text-4xl sm:text-5xl text-cream font-semibold">
              What Are You Craving?
            </h2>
            <p className="text-cream-400 text-lg max-w-2xl mx-auto">
              Explore restaurants by your favorite cuisines. Perfect for when the group can't decide on a type.
            </p>
          </div>

          {/* Category grid - Magazine style cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {CUISINE_CATEGORIES.map((category, index) => (
              <button
                key={category.id}
                onClick={() => {
                  setActiveCategory(category.id);
                  navigate('/explore', { state: { cuisine: category.id } });
                }}
                className={`group relative aspect-[4/3] rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] ${
                  index === 0 ? 'md:col-span-2 md:row-span-2 md:aspect-square' : ''
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Background gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} transition-opacity duration-300`} />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-midnight/80 via-midnight/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300" />

                {/* Pattern texture */}
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)`,
                    backgroundSize: '24px 24px'
                  }}
                />

                {/* Emoji background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[120px] sm:text-[150px] opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-500">
                  {category.emoji}
                </div>

                {/* Content */}
                <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end">
                  <div className="space-y-1">
                    <h3 className={`font-display text-cream font-semibold ${index === 0 ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'}`}>
                      {category.name}
                    </h3>
                    <p className={`text-cream-300 ${index === 0 ? 'text-base' : 'text-sm'}`}>
                      {category.description}
                    </p>
                  </div>

                  {/* Arrow indicator */}
                  <div className="mt-4 flex items-center gap-2 text-amber opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                    <span className="text-sm font-medium">Explore</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          HOW IT WORKS - Clean 3-step flow
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 bg-midnight overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16 space-y-4">
            <span className="text-amber text-sm font-medium tracking-[0.2em] uppercase">Simple & Fast</span>
            <h2 className="font-display text-4xl sm:text-5xl text-cream font-semibold">
              How Dinder Works
            </h2>
            <p className="text-cream-400 text-lg max-w-2xl mx-auto">
              Three easy steps to restaurant consensus. No more "I don't know, where do you want to eat?"
            </p>
          </div>

          {/* Steps grid */}
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {HOW_IT_WORKS.map((item, index) => (
              <div
                key={item.step}
                className="relative group"
              >
                {/* Connector line (not on last item) */}
                {index < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden md:block absolute top-16 left-[60%] w-[80%] h-px bg-gradient-to-r from-amber/30 to-transparent" />
                )}

                <div className="text-center space-y-6">
                  {/* Step number with icon */}
                  <div className="relative inline-flex">
                    <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-midnight-100 to-midnight-200 border border-amber/20 flex items-center justify-center shadow-card group-hover:shadow-card-hover group-hover:border-amber/40 transition-all duration-300">
                      {item.icon === 'create' && (
                        <svg className="w-14 h-14 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                      )}
                      {item.icon === 'swipe' && (
                        <svg className="w-14 h-14 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      )}
                      {item.icon === 'match' && (
                        <svg className="w-14 h-14 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      )}
                    </div>
                    {/* Step number badge */}
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber text-midnight font-bold flex items-center justify-center text-sm shadow-glow">
                      {item.step}
                    </div>
                  </div>

                  {/* Text content */}
                  <div className="space-y-3">
                    <h3 className="font-display text-2xl text-cream font-semibold">
                      {item.title}
                    </h3>
                    <p className="text-cream-400 leading-relaxed max-w-xs mx-auto">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FEATURED SCENARIOS - When to use Dinder
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 bg-midnight-200">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-16 space-y-4">
            <span className="text-amber text-sm font-medium tracking-[0.2em] uppercase">Perfect For</span>
            <h2 className="font-display text-4xl sm:text-5xl text-cream font-semibold">
              Every Occasion
            </h2>
          </div>

          {/* Scenario cards - horizontal scroll on mobile */}
          <div className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
            {[
              { emoji: '👫', title: 'Date Night', description: 'Find a spot you\'ll both love' },
              { emoji: '👨‍👩‍👧‍👦', title: 'Family Dinner', description: 'Something for everyone' },
              { emoji: '🎉', title: 'Friend Groups', description: 'End the group chat debate' },
              { emoji: '💼', title: 'Team Lunch', description: 'Quick office decisions' },
            ].map((scenario) => (
              <div
                key={scenario.title}
                className="flex-shrink-0 w-64 sm:w-auto snap-center group"
              >
                <div className="h-full p-6 rounded-2xl bg-midnight-100 border border-midnight-50/30 hover:border-amber/30 transition-all duration-300 hover:shadow-card-hover">
                  <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">
                    {scenario.emoji}
                  </div>
                  <h3 className="font-display text-xl text-cream font-semibold mb-2">
                    {scenario.title}
                  </h3>
                  <p className="text-cream-400 text-sm">
                    {scenario.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          FINAL CTA - Strong closer
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 bg-midnight overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-amber/10 rounded-full blur-[150px]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="space-y-8">
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl text-cream font-semibold leading-tight">
              Ready to End the
              <span className="text-amber-gradient block">"Where Should We Eat?"</span>
              Debate?
            </h2>

            <p className="text-xl text-cream-400 max-w-2xl mx-auto">
              Create a session in seconds. Invite your friends. Find restaurants everyone agrees on.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <button
                onClick={() => navigate('/create')}
                className="group px-10 py-5 text-xl font-semibold text-midnight bg-gradient-to-r from-amber to-amber-300 rounded-2xl overflow-hidden transition-all duration-300 shadow-glow hover:shadow-glow-lg hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center justify-center gap-2">
                  Get Started Free
                  <svg className="w-6 h-6 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-8 pt-8 text-cream-500 text-sm">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                No signup required
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Free forever
              </span>
              <span className="hidden sm:flex items-center gap-2">
                <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Privacy first
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Floating mobile navigation */}
      <FloatingNav />

      {/* Back to top button */}
      <BackToTop threshold={600} />

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="bg-midnight-300 border-t border-midnight-50/30 py-12 pb-28 sm:pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber to-amber-600 flex items-center justify-center">
                <span className="text-sm">🍽️</span>
              </div>
              <span className="font-display text-xl text-cream">Dinder</span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-8 text-sm text-cream-400">
              <a href="#" className="hover:text-amber transition-colors">About</a>
              <a href="#" className="hover:text-amber transition-colors">Privacy</a>
              <a href="#" className="hover:text-amber transition-colors">Terms</a>
              <a href="#" className="hover:text-amber transition-colors">Contact</a>
            </div>

            {/* Copyright */}
            <p className="text-sm text-cream-500">
              © 2024 Dinder. Made with 🍜 for hungry friends.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
