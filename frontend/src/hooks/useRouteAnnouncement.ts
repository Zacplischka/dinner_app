// A route change in a single-page app is silent: the URL swaps, the DOM swaps,
// and a screen-reader user is left reading the old page. This names each route
// in the document title and moves focus to the new page's heading (#408).

import { useEffect, useRef, type RefObject } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

const APP_NAME = 'Heykeen';

// Route patterns exactly as App.tsx declares them, most specific first so a
// nested route never loses to its parent.
const TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/session/:sessionCode/select', 'Swiping'],
  ['/session/:sessionCode/results', 'Match'],
  ['/session/:sessionCode/order', 'Group Order'],
  ['/session/:sessionCode', 'Make the Call'],
  ['/list/:listId/cook', 'Method'],
  ['/list/:listId', 'Shopping List'],
  ['/cook', 'Cook together'],
  ['/watch', 'Watch something'],
  ['/compare/:placeId', 'Price comparison'],
  ['/compare', 'Compare menu prices'],
  ['/create', 'Create Session'],
  ['/join', 'Join Session'],
  ['/friends', 'Friends'],
];

/** The document title for a pathname. Unknown URLs render Home, so they read as Home. */
export function routeTitle(pathname: string): string {
  const hit = TITLES.find(([pattern]) => matchPath(pattern, pathname));
  return hit ? `${hit[1]} · ${APP_NAME}` : APP_NAME;
}

/**
 * @param pageRef wrapper around the routed page. Its `h1` is the focus target;
 * the wrapper itself is the fallback for a page that has no heading yet.
 */
export function useRouteAnnouncement(pageRef: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const isFirstRoute = useRef(true);

  useEffect(() => {
    document.title = routeTitle(pathname);

    // Nothing has moved on the first paint, so taking focus off the document
    // would only skip past whatever the browser restored.
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }

    const page = pageRef.current;
    if (!page) return;

    // A page that autofocuses its first field (Create, Join, Cook, Watch) has
    // already put focus where it wants it by the time this passive effect runs.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== page && page.contains(active)) return;

    const focus = (el: HTMLElement) => {
      el.tabIndex = -1;
      // Announce the heading without scrolling the native header under the
      // status bar. Every new page starts at its top, including its navigation.
      window.scrollTo(0, 0);
      el.focus({ preventScroll: true });
    };

    const heading = page.querySelector<HTMLElement>('h1');
    if (heading) {
      focus(heading);
      return;
    }

    // The loading-gated pages (Session, Swiping, Friends) render a spinner
    // screen with no heading first. Hold focus on the page so the reader is at
    // least inside it, then hand over once the h1 mounts — unless by then the
    // user has moved on.
    focus(page);
    const observer = new MutationObserver(() => {
      const late = page.querySelector<HTMLElement>('h1');
      if (!late) return;
      observer.disconnect();
      if (document.activeElement === page) focus(late);
    });
    observer.observe(page, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, pageRef]);
}
