// Cook setup (#259): one screen captures the Craving and the Headcount, then
// creates the Session that deals the Recipe Deck.
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

import CookSetupPage from '../../src/pages/CookSetupPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cook']}>
      <Routes>
        <Route path="/cook" element={<CookSetupPage />} />
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

describe('CookSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createSession.mockResolvedValue({
      sessionCode: 'AB123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=AB123',
      branch: 'cook',
      headcount: 2,
      restaurantCount: 15,
    });
  });

  it('creates a Cook Session from the Craving and Headcount, then lands in the lobby', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'italian' }));
    fireEvent.click(screen.getByRole('button', { name: 'thai' }));
    fireEvent.click(screen.getByRole('button', { name: 'vegetarian' }));
    fireEvent.click(screen.getByRole('button', { name: 'More people' }));

    const [hostName, setup] = await submitAs();

    expect(hostName).toBe('Alice');
    expect(setup).toEqual({
      branch: 'cook',
      craving: { mealType: 'main course', cuisines: ['italian', 'thai'], diets: ['vegetarian'] },
      headcount: 3,
    });
    await waitFor(() => expect(screen.getByText('Lobby route')).toBeInTheDocument());
  });

  it('sends the chosen meal type', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Meal'), { target: { value: 'dessert' } });

    const [, setup] = await submitAs();
    expect(setup.craving.mealType).toBe('dessert');
  });

  it('deselects a chip on a second tap', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'italian' }));
    expect(screen.getByRole('button', { name: 'italian' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'italian' }));

    const [, setup] = await submitAs();
    expect(setup.craving.cuisines).toEqual([]);
  });

  it('sends empty chip sets when nothing is picked — no chips means anything', async () => {
    renderPage();

    const [, setup] = await submitAs();
    expect(setup.craving).toEqual({ mealType: 'main course', cuisines: [], diets: [] });
  });

  it('keeps the Headcount stepper inside sane bounds', () => {
    renderPage();

    // Floor: one person cooking for themselves.
    fireEvent.click(screen.getByRole('button', { name: 'Fewer people' }));
    expect(screen.getByText('1 person')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer people' })).toBeDisabled();

    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'More people' }));
    }
    expect(screen.getByText('12 people')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More people' })).toBeDisabled();
  });

  it('says the diet chips are a preference filter, not an allergy guarantee', () => {
    renderPage();
    expect(screen.getByText(/not an allergy-safety guarantee/i)).toBeInTheDocument();
  });

  it('asks no solo-or-group question', () => {
    renderPage();
    expect(screen.queryByText(/just me|by myself|solo|group\?/i)).not.toBeInTheDocument();
  });

  it('surfaces a create failure and leaves the setup editable', async () => {
    serviceMocks.createSession.mockRejectedValue(new Error('No recipes match those choices.'));
    renderPage();

    await submitAs();

    await waitFor(() =>
      expect(screen.getByText('No recipes match those choices.')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Start swiping' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'italian' })).toBeEnabled();
  });
});
