// Animated route wrapper: enter animation for route content on mount.

import { ReactNode, useEffect, useState } from 'react';

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
