import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import RequireSession from '../../src/components/RequireSession';
import { useSessionStore } from '../../src/stores/sessionStore';

function JoinRoute() {
  return <div>Join route{useLocation().search}</div>;
}

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/join" element={<JoinRoute />} />
        <Route path="/session/:sessionCode" element={<RequireSession />}>
          <Route index element={<div>Lobby route</div>} />
          <Route path="select" element={<div>Select route</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    act(() => useSessionStore.getState().resetSession());
  });

  it('renders the Session route when the stored Session matches the URL', () => {
    act(() => useSessionStore.setState({ sessionCode: 'AB123' }));

    renderAt('/session/AB123');

    expect(screen.getByText('Lobby route')).toBeInTheDocument();
  });

  // #403: a forwarded Session URL, cleared storage or a new browser has no
  // Session in the store — Join already handles the prefilled code, the name
  // entry and a dead link.
  it.each(['/session/AB123', '/session/AB123/select'])(
    'sends a cold link at %s to Join with the code prefilled',
    (route) => {
      renderAt(route);

      expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
    }
  );

  it('sends a URL for a different Session than the stored one to Join', () => {
    act(() => useSessionStore.setState({ sessionCode: 'ZZ999' }));

    renderAt('/session/AB123');

    expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
  });

  // A rejected rejoin resets the store (socketBindings) and toasts the server's
  // reason; the guard is what turns that reset into a redirect, from whichever
  // Session route was open.
  it('redirects when the store is reset mid-session, as a rejected rejoin does', () => {
    act(() => useSessionStore.setState({ sessionCode: 'AB123' }));

    renderAt('/session/AB123/select');
    expect(screen.getByText('Select route')).toBeInTheDocument();

    act(() => useSessionStore.getState().resetSession());

    expect(screen.getByText('Join route?code=AB123')).toBeInTheDocument();
  });
});
