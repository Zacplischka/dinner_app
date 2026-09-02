// Issue #254 — the Deck deals Restaurants or Recipes through one set of swipe
// mechanics. This drives the page with a hand-dealt Recipe Deck (no backend in
// a unit test): the card renders from what a Recipe actually carries (title,
// image), and a swipe records a Selection with no fork anywhere in the page.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '@dinder/shared/types';

const rendang: Recipe = {
  kind: 'recipe',
  placeId: 'recipe-716429',
  name: 'Beef Rendang',
  photoUrl: 'https://example.com/rendang.jpg',
  aggregateLikes: 640,
};
const aglio: Recipe = {
  kind: 'recipe',
  placeId: 'recipe-716430',
  name: 'Aglio e Olio',
  aggregateLikes: 120,
};

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [rendang, aglio]),
  getSession: vi.fn(async () => ({ shareableLink: 'http://localhost:3000/join?code=AB123' })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

import SelectionPage from '../../src/pages/SelectionPage';
import { getSession } from '../../src/services/apiClient';
import { sendLiveSelection } from '../../src/services/socketBindings';
import { useSessionStore } from '../../src/stores/sessionStore';

const renderSelectionPage = () =>
  render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('Recipe Deck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
    useSessionStore.setState({
      sessionCode: 'AB123',
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: false,
          isHost: true,
        },
      ],
    });
  });

  it('deals Recipe cards with their title and image', async () => {
    renderSelectionPage();

    expect(await screen.findByText('Beef Rendang')).toBeInTheDocument();
    expect(screen.getByAltText('Beef Rendang')).toHaveAttribute(
      'src',
      'https://example.com/rendang.jpg'
    );
  });

  it('renders none of the Restaurant-only meta for a Recipe', async () => {
    renderSelectionPage();
    await screen.findByText('Beef Rendang');

    expect(screen.queryByLabelText(/^Rating/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open now|Closed now/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Price level/)).not.toBeInTheDocument();
  });

  it('records a Selection and broadcasts a Live Selection when a Recipe is swiped yes', async () => {
    renderSelectionPage();
    await screen.findByText('Beef Rendang');

    fireEvent.click(screen.getByLabelText('Like'));

    await waitFor(() => {
      expect(useSessionStore.getState().selections).toEqual(['recipe-716429']);
    });
    expect(sendLiveSelection).toHaveBeenCalledWith('AB123', 'recipe-716429');
    // The next card is dealt by the same cursor the restaurant deck uses.
    expect(screen.getByText('Aglio e Olio')).toBeInTheDocument();
  });

  // #333 — the outage's one plain line. It rides the Session, so every
  // Participant's page reads the same fact off the same load.
  it('says nothing about a Deck the recipe source filled', async () => {
    renderSelectionPage();
    await screen.findByText('Beef Rendang');

    expect(screen.queryByTestId('source-down-note')).not.toBeInTheDocument();
  });

  it('shows one plain line when the source was dark and the deal came up short', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      shareableLink: 'http://localhost:3000/join?code=AB123',
      recipeSourceDown: true,
    } as Awaited<ReturnType<typeof getSession>>);

    renderSelectionPage();
    await screen.findByText('Beef Rendang');

    expect(await screen.findByTestId('source-down-note')).toHaveTextContent(
      /recipe source is down/i
    );
  });
});
