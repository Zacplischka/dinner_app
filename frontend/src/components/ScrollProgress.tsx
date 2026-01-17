// Scroll Progress Indicator
// Shows reading progress on long pages

import { useState, useEffect } from 'react';

interface ScrollProgressProps {
  className?: string;
  color?: string;
  height?: number;
  showPercentage?: boolean;
}

export default function ScrollProgress({
  className = '',
  color = 'amber',
  height = 3,
  showPercentage = false,
}: ScrollProgressProps) {
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollProgress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

      setProgress(scrollProgress);
      setIsVisible(scrollTop > 100); // Show after scrolling 100px
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const colorClasses: Record<string, string> = {
    amber: 'from-amber to-amber-300',
    success: 'from-success to-success-light',
    rose: 'from-rose-500 to-pink-400',
  };

  return (
    <>
      {/* Progress bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-[100] transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        } ${className}`}
        style={{ height: `${height}px` }}
      >
        <div
          className={`h-full bg-gradient-to-r ${colorClasses[color] || colorClasses.amber} shadow-glow transition-transform duration-100 ease-out`}
          style={{
            transform: `translateX(${progress - 100}%)`,
          }}
        />
      </div>

      {/* Optional percentage indicator */}
      {showPercentage && isVisible && (
        <div
          className={`fixed top-4 right-4 z-[100] px-3 py-1.5 bg-midnight-100/90 backdrop-blur-sm rounded-full border border-midnight-50/50 text-sm font-medium text-cream transition-opacity duration-300 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {Math.round(progress)}%
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION PROGRESS INDICATOR
// Shows progress through discrete sections (e.g., form steps)
// ═══════════════════════════════════════════════════════════════════

interface SectionProgressProps {
  currentSection: number;
  totalSections: number;
  labels?: string[];
  className?: string;
}

export function SectionProgress({
  currentSection,
  totalSections,
  labels = [],
  className = '',
}: SectionProgressProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Array.from({ length: totalSections }).map((_, index) => {
        const isComplete = index < currentSection;
        const isCurrent = index === currentSection;

        return (
          <div key={index} className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                  isComplete
                    ? 'bg-amber text-midnight'
                    : isCurrent
                    ? 'bg-amber/20 text-amber border-2 border-amber'
                    : 'bg-midnight-100 text-cream-500 border border-midnight-50/50'
                }`}
              >
                {isComplete ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {labels[index] && (
                <span
                  className={`text-xs mt-1 ${
                    isComplete || isCurrent ? 'text-cream' : 'text-cream-500'
                  }`}
                >
                  {labels[index]}
                </span>
              )}
            </div>

            {/* Connector line */}
            {index < totalSections - 1 && (
              <div
                className={`h-0.5 w-8 transition-colors duration-300 ${
                  isComplete ? 'bg-amber' : 'bg-midnight-50/50'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// READING TIME INDICATOR
// Shows estimated reading time for content
// ═══════════════════════════════════════════════════════════════════

interface ReadingTimeProps {
  content: string;
  wordsPerMinute?: number;
  className?: string;
}

export function ReadingTime({ content, wordsPerMinute = 200, className = '' }: ReadingTimeProps) {
  const wordCount = content.trim().split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);

  return (
    <span className={`text-cream-400 text-sm ${className}`}>
      {readingTime} min read
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BACK TO TOP BUTTON
// Floating button to scroll back to top
// ═══════════════════════════════════════════════════════════════════

interface BackToTopProps {
  threshold?: number;
  className?: string;
}

export function BackToTop({ threshold = 400, className = '' }: BackToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-24 sm:bottom-8 right-4 z-40 w-12 h-12 rounded-full bg-midnight-100 border border-amber/30 text-amber shadow-card flex items-center justify-center transition-all duration-300 hover:bg-midnight-50 hover:border-amber active:scale-95 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      } ${className}`}
      aria-label="Back to top"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    </button>
  );
}
