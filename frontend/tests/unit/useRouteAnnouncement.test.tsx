import { describe, expect, it } from 'vitest';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { routeTitle, useRouteAnnouncement } from '../../src/hooks/useRouteAnnouncement';

function Links() {
  return (
    <>
      <Link to="/friends">Friends</Link>
      <Link to="/session/ABCDE/select">Swipe</Link>
      <Link to="/session/ABCDE">Lobby</Link>
      <Link to="/create">Create</Link>
    </>
  );
}

function Page({ heading }: { heading?: string }) {
  return (
    <>
      {heading && <h1>{heading}</h1>}
      <Links />
    </>
  );
}

/** The loading-gated shape: a spinner screen first, the heading a beat later. */
function LateHeadingPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready ? <Page heading="Make the Call" /> : <p role="status">Loading session...</p>;
}

/** The autofocus shape: the page puts focus in its first field on mount. */
function AutoFocusPage() {
  return (
    <>
      <h1>Create Session</h1>
      <input aria-label="Your name" autoFocus />
      <Links />
    </>
  );
}

function Harness() {
  const pageRef = useRef<HTMLDivElement>(null);
  useRouteAnnouncement(pageRef);
  return (
    <div ref={pageRef} data-testid="page">
      <Routes>
        <Route path="/" element={<Page heading="Dinner, decided" />} />
        <Route path="/friends" element={<Page heading="Friends" />} />
        <Route path="/session/:sessionCode/select" element={<Page />} />
        <Route path="/session/:sessionCode" element={<LateHeadingPage />} />
        <Route path="/create" element={<AutoFocusPage />} />
      </Routes>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>
  );
}

describe('routeTitle', () => {
  it('names every route, params and all', () => {
    expect(routeTitle('/')).toBe('YupCrew');
    expect(routeTitle('/cook')).toBe('Cook together · YupCrew');
    expect(routeTitle('/watch')).toBe('Watch something · YupCrew');
    expect(routeTitle('/compare')).toBe('Compare menu prices · YupCrew');
    expect(routeTitle('/compare/ChIJabc123')).toBe('Price comparison · YupCrew');
    expect(routeTitle('/create')).toBe('Create Session · YupCrew');
    expect(routeTitle('/join')).toBe('Join Session · YupCrew');
    expect(routeTitle('/session/ABCDE')).toBe('Make the Call · YupCrew');
    expect(routeTitle('/session/ABCDE/select')).toBe('Swiping · YupCrew');
    expect(routeTitle('/session/ABCDE/results')).toBe('Match · YupCrew');
    expect(routeTitle('/session/ABCDE/order')).toBe('Group Order · YupCrew');
    expect(routeTitle('/list/7f3a')).toBe('Shopping List · YupCrew');
    expect(routeTitle('/list/7f3a/cook')).toBe('Method · YupCrew');
    expect(routeTitle('/friends')).toBe('Friends · YupCrew');
  });

  it('names a route the way the page names itself on screen', () => {
    // CONTEXT.md forbids "results" and "lobby"; these titles are the first
    // thing a screen reader hears, so they use the domain words.
    expect(routeTitle('/session/ABCDE/results')).not.toMatch(/result/i);
    expect(routeTitle('/session/ABCDE')).not.toMatch(/lobby/i);
  });

  it('falls back to the bare app name on an unknown URL', () => {
    expect(routeTitle('/nowhere')).toBe('YupCrew');
  });
});

describe('useRouteAnnouncement', () => {
  it('titles the first page without stealing focus from it', () => {
    renderAt('/');

    expect(document.title).toBe('YupCrew');
    expect(document.activeElement).toBe(document.body);
  });

  it('retitles and focuses the heading on a route change', () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('link', { name: 'Friends' }));

    expect(document.title).toBe('Friends · YupCrew');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Friends' }));
  });

  it('falls back to the page container when the route has no heading', () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('link', { name: 'Swipe' }));

    expect(document.title).toBe('Swiping · YupCrew');
    expect(document.activeElement).toBe(screen.getByTestId('page'));
  });

  it('hands focus to a heading that only mounts once loading finishes', async () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('link', { name: 'Lobby' }));

    expect(document.title).toBe('Make the Call · YupCrew');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Make the Call' }))
    );
  });

  it('leaves focus alone when the page autofocused its first field', () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('link', { name: 'Create' }));

    expect(document.title).toBe('Create Session · YupCrew');
    expect(document.activeElement).toBe(screen.getByLabelText('Your name'));
  });
});

describe("useRouteAnnouncement under App's lazy routes", () => {
  it('waits for the chunk, then focuses the heading it brings', async () => {
    // App wraps AnimatedRoutes in one Suspense boundary and every route is a
    // React.lazy chunk, so a first visit suspends. React holds the pending
    // commit — the effect must not run against the outgoing page's h1.
    let land: () => void = () => {};
    const chunk = new Promise<void>((resolve) => {
      land = resolve;
    });
    const LazyFriends = lazy(async () => {
      await chunk;
      return { default: () => <Page heading="Friends" /> };
    });

    function LazyHarness() {
      const pageRef = useRef<HTMLDivElement>(null);
      useRouteAnnouncement(pageRef);
      return (
        <div ref={pageRef} data-testid="page">
          <Routes>
            <Route path="/" element={<Page heading="Dinner, decided" />} />
            <Route path="/friends" element={<LazyFriends />} />
          </Routes>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Suspense fallback={<p>Loading...</p>}>
          <LazyHarness />
        </Suspense>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Friends' }));
    expect(document.activeElement).toBe(document.body);

    land();

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Friends' }))
    );
    expect(document.title).toBe('Friends · YupCrew');
  });
});
