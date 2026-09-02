// Cook setup (#259): one screen captures the Craving and the Headcount, then
// creates the Session that deals the Recipe Deck.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  fetchNearestCraving: vi.fn(async () => null),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({ success: true, data: { participantId: 'participant-1' } })),
}));

vi.mock('../../src/services/apiClient', () => ({
  createSession: serviceMocks.createSession,
  fetchNearestCraving: serviceMocks.fetchNearestCraving,
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

// The Nearest Craving (#334): a zero-Recipe Craving is answered with the
// closest deal there is, not a flat refusal. Relaxation is an offer — the Host
// taps it or ignores it, and the chips are theirs either way.
describe('CookSetupPage — the Nearest Craving', () => {
  const ASIAN = ['chinese', 'indian', 'japanese', 'korean', 'thai', 'vietnamese'];

  /** What the create endpoint answers a Craving that dealt nothing. */
  const refusal = () =>
    Object.assign(new Error('No recipes match those choices. Try removing a filter.'), {
      code: 'NO_RECIPES_FOUND',
    });

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.createSession.mockRejectedValue(refusal());
    serviceMocks.fetchNearestCraving.mockResolvedValue({
      craving: { mealType: 'main course', cuisines: ASIAN, diets: ['vegan'] },
      label: 'Asian',
      recipeCount: 12,
    });
  });

  /** Sets up the vegan + korean Craving the corpus has no answer for. */
  async function refusedAs() {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'korean' }));
    fireEvent.click(screen.getByRole('button', { name: 'vegan' }));
    await submitAs();
    return screen.findByRole('button', { name: /vegan \+ Asian/i });
  }

  it('offers the closest deal there is, with a real count', async () => {
    const offer = await refusedAs();

    expect(offer).toHaveTextContent(/12 recipes/i);
    expect(serviceMocks.fetchNearestCraving).toHaveBeenCalledWith({
      mealType: 'main course',
      cuisines: ['korean'],
      diets: ['vegan'],
    });
    // Nothing has moved: the Craving is still the Host's until they say so.
    expect(screen.getByRole('button', { name: 'korean' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'japanese' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('mints the offered Craving on one tap and deals from it', async () => {
    const offer = await refusedAs();
    serviceMocks.createSession.mockResolvedValue({
      sessionCode: 'AB123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=AB123',
      branch: 'cook',
      headcount: 2,
    });

    fireEvent.click(offer);

    await waitFor(() => expect(serviceMocks.createSession).toHaveBeenCalledTimes(2));
    expect(serviceMocks.createSession.mock.calls[1][1]).toEqual({
      branch: 'cook',
      craving: { mealType: 'main course', cuisines: ASIAN, diets: ['vegan'] },
      headcount: 2,
    });
    await waitFor(() => expect(screen.getByText('Lobby route')).toBeInTheDocument());
  });

  it('declining is doing nothing — the chips are still what gets sent', async () => {
    await refusedAs();

    fireEvent.click(screen.getByRole('button', { name: 'thai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));

    await waitFor(() => expect(serviceMocks.createSession).toHaveBeenCalledTimes(2));
    expect(serviceMocks.createSession.mock.calls[1][1].craving.cuisines).toEqual([
      'korean',
      'thai',
    ]);
  });

  // An offer names one Craving. Edit the Craving under it and it is an offer
  // about something else — which is how a button reading "vegan + gluten free
  // + Asian" ends up dealing a Craving with no gluten-free chip on it.
  it.each([
    ['a cuisine chip', () => fireEvent.click(screen.getByRole('button', { name: 'thai' }))],
    ['a diet chip', () => fireEvent.click(screen.getByRole('button', { name: 'gluten free' }))],
    [
      'the meal type',
      () => fireEvent.change(screen.getByLabelText('Meal'), { target: { value: 'dessert' } }),
    ],
  ])('drops the offer when %s changes under it', async (_label, edit) => {
    await refusedAs();

    edit();

    expect(screen.queryByRole('button', { name: /instead/i })).not.toBeInTheDocument();
  });

  // The likeliest moment to edit a chip is the one right after being told "No
  // recipes match those choices" — while the offer read for that refusal is
  // still out. It must not land on top of the Craving the Host just changed.
  it('ignores an offer for a Craving edited out from under it', async () => {
    let landOffer!: (offer: unknown) => void;
    serviceMocks.fetchNearestCraving.mockImplementationOnce(
      () => new Promise((resolve) => (landOffer = resolve))
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'korean' }));
    await submitAs();
    await waitFor(() => expect(serviceMocks.fetchNearestCraving).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'thai' }));
    expect(screen.getByRole('button', { name: 'thai' })).toHaveAttribute('aria-pressed', 'true');

    await act(async () => {
      landOffer({
        craving: { mealType: 'main course', cuisines: ASIAN, diets: [] },
        label: 'Asian',
        recipeCount: 12,
      });
    });

    expect(screen.queryByRole('button', { name: /instead/i })).not.toBeInTheDocument();
  });

  it('ignores an offer for a Craving already dealt over', async () => {
    let landFirstOffer!: (offer: unknown) => void;
    serviceMocks.fetchNearestCraving
      .mockImplementationOnce(() => new Promise((resolve) => (landFirstOffer = resolve)))
      .mockImplementationOnce(async () => null);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'korean' }));
    await submitAs();
    await waitFor(() => expect(serviceMocks.fetchNearestCraving).toHaveBeenCalledTimes(1));

    // The refusal is back before its offer read is: a second deal starts, and
    // the first Craving's neighbour is no longer an offer about anything.
    fireEvent.click(screen.getByRole('button', { name: 'thai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    await waitFor(() => expect(serviceMocks.fetchNearestCraving).toHaveBeenCalledTimes(2));

    await act(async () => {
      landFirstOffer({
        craving: { mealType: 'main course', cuisines: ASIAN, diets: [] },
        label: 'Asian',
        recipeCount: 12,
      });
    });

    expect(screen.queryByRole('button', { name: /instead/i })).not.toBeInTheDocument();
  });

  it('leaves the refusal standing inline when even the widest step is empty', async () => {
    serviceMocks.fetchNearestCraving.mockResolvedValue(null);
    renderPage();

    await submitAs();

    await waitFor(() =>
      expect(screen.getByText(/No recipes match those choices/)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /instead/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'korean' })).toBeEnabled();
  });

  it('asks for no offer when the source simply did not answer', async () => {
    serviceMocks.createSession.mockRejectedValue(
      Object.assign(new Error("Couldn't load recipes just now. Try again in a moment."), {
        code: 'RECIPE_SOURCE_UNAVAILABLE',
      })
    );
    renderPage();

    await submitAs();

    // Nothing is wrong with the Craving, so there is nothing nearer to offer.
    await waitFor(() => expect(screen.getByText(/Try again in a moment/)).toBeInTheDocument());
    expect(serviceMocks.fetchNearestCraving).not.toHaveBeenCalled();
  });
});
