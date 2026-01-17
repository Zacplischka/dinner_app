// Enhanced card components with rich micro-interactions
// Designed for the Food Network-inspired discovery experience

import { useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

// Placeholder image URLs by cuisine type
const CUISINE_IMAGES: Record<string, string> = {
  italian: 'https://images.unsplash.com/photo-1498579150354-977475b7ea0b?w=600&q=80',
  mexican: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80',
  asian: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&q=80',
  american: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80',
  indian: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&q=80',
  mediterranean: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
  japanese: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=600&q=80',
  thai: 'https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=600&q=80',
  french: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&q=80',
  chinese: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=600&q=80',
  default: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80',
};

// ═══════════════════════════════════════════════════════════════════
// CUISINE CARD - For cuisine category browsing
// ═══════════════════════════════════════════════════════════════════
interface CuisineCardProps {
  id: string;
  name: string;
  emoji: string;
  count: number;
  gradient?: string;
  size?: 'default' | 'large';
  imageUrl?: string;
  onClick?: () => void;
}

export function CuisineCard({ id, name, emoji, count, gradient, size = 'default', imageUrl, onClick }: CuisineCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get image URL - use provided, lookup by id, or fallback to default
  const imgSrc = imageUrl || CUISINE_IMAGES[id.toLowerCase()] || CUISINE_IMAGES.default;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative overflow-hidden rounded-2xl transition-all duration-500 ease-out
        ${size === 'large' ? 'aspect-square' : 'aspect-[4/3]'}
        ${isHovered ? 'scale-[1.02] shadow-card-hover' : 'scale-100'}
        active:scale-[0.98]
      `}
    >
      {/* Background image */}
      {!imageError && (
        <img
          src={imgSrc}
          alt={name}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500
            ${isHovered ? 'scale-110' : 'scale-100'}
            ${imageLoaded ? 'opacity-100' : 'opacity-0'}
          `}
        />
      )}

      {/* Fallback gradient (shown while loading or on error) */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient || 'from-midnight-100 to-midnight-200'} transition-opacity duration-500
          ${imageLoaded && !imageError ? 'opacity-0' : 'opacity-100'}
        `}
      />

      {/* Fallback emoji (shown while loading or on error) */}
      {(!imageLoaded || imageError) && (
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out
            ${size === 'large' ? 'text-[100px]' : 'text-[60px]'}
            opacity-40
          `}
        >
          {emoji}
        </div>
      )}

      {/* Darkening overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

      {/* Text content */}
      <div className="absolute inset-0 p-4 sm:p-5 flex flex-col justify-end">
        <h3
          className={`font-display text-cream font-semibold transition-all duration-300
            ${size === 'large' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}
            ${isHovered ? 'translate-y-0' : 'translate-y-0'}
          `}
        >
          {name}
        </h3>
        <p
          className={`text-cream/70 transition-all duration-300
            ${size === 'large' ? 'text-base' : 'text-sm'}
          `}
        >
          {count} places
        </p>

        {/* Explore indicator */}
        <div
          className={`flex items-center gap-2 mt-2 text-amber text-sm font-medium transition-all duration-300
            ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
          `}
        >
          <span>Explore</span>
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${isHovered ? 'translate-x-1' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>
      </div>

      {/* Corner accent */}
      <div
        className={`absolute top-0 right-0 w-16 h-16 transition-all duration-500
          ${isHovered ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-amber/30 to-transparent" />
      </div>
    </button>
  );
}

// Restaurant placeholder images by cuisine
const RESTAURANT_IMAGES: Record<string, string> = {
  italian: 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?w=400&q=80',
  mexican: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&q=80',
  asian: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400&q=80',
  american: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&q=80',
  indian: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400&q=80',
  mediterranean: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&q=80',
  japanese: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=400&q=80',
  thai: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?w=400&q=80',
  french: 'https://images.unsplash.com/photo-1470324161839-ce2bb6fa6bc3?w=400&q=80',
  chinese: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=400&q=80',
  default: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80',
};

// ═══════════════════════════════════════════════════════════════════
// RESTAURANT CARD - For restaurant listings
// ═══════════════════════════════════════════════════════════════════
interface RestaurantCardProps {
  id: string;
  name: string;
  cuisine: string;
  emoji: string;
  rating: number;
  priceLevel: string;
  distance: string;
  neighborhood?: string;
  isOpen?: boolean;
  highlight?: string;
  tags?: string[];
  rank?: number;
  variant?: 'grid' | 'list';
  imageUrl?: string;
  onSave?: () => void;
  onVote?: () => void;
}

export function RestaurantCard({
  id,
  name,
  cuisine,
  emoji,
  rating,
  priceLevel,
  distance,
  neighborhood,
  isOpen = true,
  highlight,
  tags = [],
  rank,
  variant = 'grid',
  imageUrl,
  onSave,
  onVote,
}: RestaurantCardProps) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get image URL - use provided, lookup by cuisine, or fallback
  const imgSrc = imageUrl || RESTAURANT_IMAGES[cuisine.toLowerCase()] || RESTAURANT_IMAGES.default;

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSaved(!isSaved);
    onSave?.();
  };

  const handleVote = (e: React.MouseEvent) => {
    e.stopPropagation();
    onVote?.();
    navigate('/create', { state: { restaurantId: id } });
  };

  if (variant === 'list') {
    return (
      <article
        onClick={() => navigate(`/restaurant/${id}`)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`group relative bg-midnight-100 rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
          ${isHovered ? 'border-amber/40 shadow-card-hover scale-[1.01]' : 'border-midnight-50/30'}
        `}
      >
        <div className="flex flex-col sm:flex-row">
          {/* Rank number */}
          {rank !== undefined && (
            <div className="hidden sm:flex w-20 flex-shrink-0 items-center justify-center bg-midnight-200 border-r border-midnight-50/30">
              <span
                className={`text-4xl font-display font-bold transition-colors duration-300
                  ${isHovered ? 'text-amber' : 'text-amber/50'}
                `}
              >
                {rank}
              </span>
            </div>
          )}

          {/* Image area */}
          <div className="h-40 sm:h-auto sm:w-40 flex-shrink-0 bg-gradient-to-br from-midnight-200 to-midnight-100 relative overflow-hidden">
            {!imageError && (
              <img
                src={imgSrc}
                alt={name}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-500
                  ${isHovered ? 'scale-110' : 'scale-100'}
                  ${imageLoaded ? 'opacity-100' : 'opacity-0'}
                `}
              />
            )}
            {/* Fallback emoji */}
            {(!imageLoaded || imageError) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl opacity-50">{emoji}</span>
              </div>
            )}

            {/* Rank badge on mobile */}
            {rank !== undefined && (
              <div className="absolute top-3 left-3 sm:hidden w-8 h-8 rounded-full bg-amber/90 flex items-center justify-center">
                <span className="text-midnight font-bold text-sm">{rank}</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3
                    className={`font-display text-xl sm:text-2xl font-semibold transition-colors duration-300
                      ${isHovered ? 'text-amber' : 'text-cream'}
                    `}
                  >
                    {name}
                  </h3>
                  <span className="text-cream-500 text-sm">{priceLevel}</span>
                  {isOpen !== undefined && (
                    <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-success animate-pulse' : 'bg-cream-500'}`} />
                  )}
                </div>

                <div className="flex items-center gap-2 text-sm text-cream-400 mb-3">
                  <span>{cuisine}</span>
                  {neighborhood && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-cream-500" />
                      <span>{neighborhood}</span>
                    </>
                  )}
                  <span className="w-1 h-1 rounded-full bg-cream-500" />
                  <span>{distance}</span>
                </div>

                {highlight && (
                  <p className="text-cream-300 italic text-sm mb-3">"{highlight}"</p>
                )}

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 text-xs bg-midnight-200 text-cream-400 rounded-full border border-midnight-50/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Rating & actions */}
              <div className="flex sm:flex-col items-center sm:items-end gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber/20 rounded-lg">
                  <span className="text-amber">★</span>
                  <span className="text-cream font-semibold">{rating}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    className={`p-2 rounded-lg transition-all duration-300
                      ${isSaved ? 'text-amber bg-amber/20' : 'text-cream-400 hover:text-amber hover:bg-midnight-200'}
                    `}
                  >
                    <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleVote}
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

        {/* Hover arrow */}
        <div
          className={`absolute right-4 top-1/2 -translate-y-1/2 transition-all duration-300
            ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}
          `}
        >
          <svg className="w-6 h-6 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </article>
    );
  }

  // Grid variant
  return (
    <article
      onClick={() => navigate(`/restaurant/${id}`)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group bg-midnight-100 rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300
        ${isHovered ? 'border-amber/40 shadow-card-hover scale-[1.02]' : 'border-midnight-50/30'}
      `}
    >
      {/* Image area */}
      <div className="h-36 bg-gradient-to-br from-midnight-200 to-midnight-100 relative overflow-hidden">
        {!imageError && (
          <img
            src={imgSrc}
            alt={name}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-500
              ${isHovered ? 'scale-110' : 'scale-100'}
              ${imageLoaded ? 'opacity-100' : 'opacity-0'}
            `}
          />
        )}
        {/* Fallback emoji */}
        {(!imageLoaded || imageError) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl opacity-50">{emoji}</span>
          </div>
        )}

        {/* Status badge */}
        <div
          className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm transition-all duration-300
            ${isOpen ? 'bg-success/80 text-white' : 'bg-midnight/80 text-cream-400'}
          `}
        >
          {isOpen ? 'Open' : 'Closed'}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`absolute top-3 left-3 p-2 rounded-full backdrop-blur-sm transition-all duration-300
            ${isSaved ? 'bg-amber/90 text-midnight' : 'bg-midnight/60 text-cream hover:bg-midnight/80'}
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}
        >
          <svg className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className={`font-medium transition-colors duration-300 line-clamp-1
              ${isHovered ? 'text-amber' : 'text-cream'}
            `}
          >
            {name}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-amber text-sm">★</span>
            <span className="text-cream text-sm font-medium">{rating}</span>
          </div>
        </div>
        <p className="text-cream-400 text-sm">
          {cuisine} • {priceLevel} • {distance}
        </p>
      </div>
    </article>
  );
}

// Collection placeholder images by theme
const COLLECTION_IMAGES: Record<string, string> = {
  'date-night': 'https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=600&q=80',
  'best-italian': 'https://images.unsplash.com/photo-1498579150354-977475b7ea0b?w=600&q=80',
  'best-mexican': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80',
  'late-night': 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&q=80',
  'outdoor-dining': 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80',
  'hidden-gems': 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=600&q=80',
  'brunch': 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=600&q=80',
  default: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80',
};

// ═══════════════════════════════════════════════════════════════════
// COLLECTION CARD - For curated collections
// ═══════════════════════════════════════════════════════════════════
interface CollectionCardProps {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: string;
  count: number;
  imageUrl?: string;
  onClick?: () => void;
}

export function CollectionCard({ id, title, subtitle: _subtitle, emoji, gradient, count, imageUrl, onClick }: CollectionCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const navigate = useNavigate();

  // Get image URL - use provided, lookup by id, or fallback
  const imgSrc = imageUrl || COLLECTION_IMAGES[id] || COLLECTION_IMAGES.default;

  const handleClick = () => {
    onClick?.();
    navigate(`/guides/${id}`);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative aspect-[3/2] rounded-2xl overflow-hidden transition-all duration-500
        ${isHovered ? 'scale-[1.03] shadow-glow-lg' : 'scale-100'}
        active:scale-[0.98]
      `}
    >
      {/* Background image */}
      {!imageError && (
        <img
          src={imgSrc}
          alt={title}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-700
            ${isHovered ? 'scale-110' : 'scale-100'}
            ${imageLoaded ? 'opacity-100' : 'opacity-0'}
          `}
        />
      )}

      {/* Fallback gradient (shown while loading or on error) */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} transition-opacity duration-500
          ${imageLoaded && !imageError ? 'opacity-0' : 'opacity-100'}
        `}
      />

      {/* Fallback emoji (shown while loading or on error) */}
      {(!imageLoaded || imageError) && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl opacity-40">
          {emoji}
        </div>
      )}

      {/* Darkening overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

      {/* Content */}
      <div className="absolute inset-0 p-4 flex flex-col justify-end">
        <h3 className="font-display text-xl text-cream font-semibold">{title}</h3>
        <p className="text-cream/70 text-sm">{count} places</p>
      </div>

      {/* Shine effect */}
      <div
        className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transition-all duration-700
          ${isHovered ? 'translate-x-full' : '-translate-x-full'}
        `}
        style={{ transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)' }}
      />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATED SECTION WRAPPER
// ═══════════════════════════════════════════════════════════════════
interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  animation?: 'fade-up' | 'fade-left' | 'fade-right' | 'scale-up';
  delay?: number;
}

export function AnimatedSection({ children, className = '', animation = 'fade-up', delay = 0 }: AnimatedSectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Check if element is already in viewport on mount
    const rect = element.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (isInViewport) {
      // Small delay to allow CSS transition to work
      requestAnimationFrame(() => setIsVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '50px 0px 0px 0px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const animationClasses: Record<string, string> = {
    'fade-up': isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8',
    'fade-left': isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8',
    'fade-right': isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8',
    'scale-up': isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95',
  };

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${animationClasses[animation]} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// Need to import useRef and useEffect
import { useRef, useEffect } from 'react';
