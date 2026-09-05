// Watch setup (#369): one screen captures the Mood, then creates the Session
// that deals the Movie Deck. A Mood the corpus cannot answer is refused inline,
// with the chips still the Host's to edit.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({ success: true, data: { participantId: 'participant-1' } })),
}));

vi.mock('../../src/services/apiClient', () => ({
  createSession: serviceMocks.createSession,
}));

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: serviceMocks.waitForConnection,
  joinSession: serviceMocks.joinSession,
}));

vi.mock('../../src/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(),
    },
  },
  signInWithGoogle: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));

import WatchSetupPage from '../../src/pages/WatchSetupPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/watch']}>
      <Routes>
        <Route path="/watch" element={<WatchSetupPage />} />
        <Route path="/session/:sessionCode" element={<div>Lobby route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitAs(name = 'Alice') {
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
  await waitFor(() => expect(serviceMocks.createSession).toHaveBeenCalled());
  return serviceMocks.createSession.mock.calls[0];
}

describe('WatchSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createSession.mockResolvedValue({
      sessionCode: 'AB123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=AB123',
      branch: 'watch',
      restaurantCount: 15,
    });
  });

  it('creates a Watch Session from the Mood, then lands in the lobby', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));
    fireEvent.click(screen.getByRole('button', { name: '1990s' }));

    const [hostName, setup] = await submitAs();

    expect(hostName).toBe('Alice');
    expect(setup).toEqual({
      branch: 'watch',
      mood: { genres: ['Comedy', 'Horror'], decades: ['1990s'] },
    });
    await waitFor(() => expect(screen.getByText('Lobby route')).toBeInTheDocument());
  });

  it('deselects a chip on a second tap', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));
    expect(screen.getByRole('button', { name: 'Comedy' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Comedy' }));

    const [, setup] = await submitAs();
    expect(setup.mood.genres).toEqual([]);
  });

  it('sends empty chip sets when nothing is picked — no chips means anything', async () => {
    renderPage();

    const [, setup] = await submitAs();
    expect(setup.mood).toEqual({ genres: [], decades: [] });
  });

  it('asks no solo-or-group question', () => {
    renderPage();
    expect(screen.queryByText(/just me|by myself|solo|group\?/i)).not.toBeInTheDocument();
  });

  // The corpus is static, so a refusal is the whole answer: no Nearest Mood is
  // offered, and the chips stay exactly as the Host set them.
  it('shows the NO_MOVIES_FOUND refusal inline and leaves the Mood editable', async () => {
    serviceMocks.createSession.mockRejectedValue(
      Object.assign(new Error('No movies match those choices. Try removing a filter.'), {
        code: 'NO_MOVIES_FOUND',
      })
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Documentary' }));
    fireEvent.click(screen.getByRole('button', { name: '1970s' }));
    await submitAs();

    await waitFor(() =>
      expect(screen.getByText(/No movies match those choices/)).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Documentary' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Documentary' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /instead/i })).not.toBeInTheDocument();
  });
});
