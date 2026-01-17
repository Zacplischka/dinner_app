// Page Transition Component
// Provides smooth fade/slide transitions between route changes

import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
  variant?: 'fade' | 'slide-up' | 'slide-left' | 'scale';
}

export default function PageTransition({ children, variant = 'fade' }: PageTransitionProps) {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);

  useEffect(() => {
    // Start transition out
    setIsVisible(false);

    // After exit animation, update content and start entry animation
    const timeout = setTimeout(() => {
      setDisplayChildren(children);
      requestAnimationFrame(() => setIsVisible(true));
    }, 150); // Match exit animation duration

    return () => clearTimeout(timeout);
  }, [location.pathname]); // Trigger on route change

  // Initial mount - show immediately
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const transitionClasses: Record<string, { enter: string; exit: string }> = {
    fade: {
      enter: 'opacity-100',
      exit: 'opacity-0',
    },
    'slide-up': {
      enter: 'opacity-100 translate-y-0',
      exit: 'opacity-0 translate-y-4',
    },
    'slide-left': {
      enter: 'opacity-100 translate-x-0',
      exit: 'opacity-0 translate-x-4',
    },
    scale: {
      enter: 'opacity-100 scale-100',
      exit: 'opacity-0 scale-98',
    },
  };

  const classes = transitionClasses[variant];

  return (
    <div
      className={`transition-all duration-300 ease-out ${isVisible ? classes.enter : classes.exit}`}
    >
      {displayChildren}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VIEW TRANSITION API WRAPPER (for browsers that support it)
// Provides native-like page transitions using the View Transitions API
// ═══════════════════════════════════════════════════════════════════

export function useViewTransition() {
  const startTransition = (callback: () => void) => {
    // Check for View Transitions API support
    if (document.startViewTransition) {
      document.startViewTransition(callback);
    } else {
      callback();
    }
  };

  return { startTransition };
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATED ROUTE WRAPPER
// Use this to wrap individual route content for enter/exit animations
// ═══════════════════════════════════════════════════════════════════

interface AnimatedRouteProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedRoute({ children, className = '' }: AnimatedRouteProps) {
  const [isEntered, setIsEntered] = useState(false);

  useEffect(() => {
    // Trigger enter animation after mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntered(true));
    });
  }, []);

  return (
    <div
      className={`transition-all duration-500 ease-out ${
        isEntered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      } ${className}`}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STAGGERED CHILDREN ANIMATION
// Animates child elements with staggered delays
// ═══════════════════════════════════════════════════════════════════

interface StaggeredContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number; // ms between each child
}

export function StaggeredContainer({ children, className = '', staggerDelay = 50 }: StaggeredContainerProps) {
  return (
    <div className={className}>
      {Array.isArray(children)
        ? children.map((child, index) => (
            <div
              key={index}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * staggerDelay}ms` }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
