import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the viewer has asked for reduced motion — read once on mount and
 * then kept live by the media query's own `change` event, so flipping the OS
 * setting mid-Session takes effect on the next render rather than never.
 * Without `matchMedia`, or with one that answers nothing (jsdom, a restored
 * test mock), it is simply `false`.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.(QUERY)?.matches ?? false);

  useEffect(() => {
    const query = window.matchMedia?.(QUERY);
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
