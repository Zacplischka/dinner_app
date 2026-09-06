// The Watch Branch (#369) deals Movies through the same swipe mechanics as
// Restaurants and Recipes. This drives the page with a hand-dealt Movie Deck (no
// backend in a unit test): the card renders what a Movie carries — title,
// poster, year and runtime, genres, critics score, overview — and none of the
// Restaurant-only meta, and a swipe records a Selection with no fork anywhere.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Movie } from '@dinder/shared/types';

const alien: Movie = {
  kind: 'movie',
  placeId: 'Q103569',
  name: 'Alien',
  photoUrl: 'https://example.com/alien.jpg',
  year: 1979,
  runtimeMinutes: 117,
  genres: ['Horror', 'Sci-Fi'],
  rating: 93,
  overview: 'A commercial starship crew investigate a derelict vessel.',
};
const heat: Movie = {
  kind: 'movie',
  placeId: 'Q188652',
  name: 'Heat',
  year: 1995,
  genres: ['Crime'],
};
// The corpus's longest name: a two-line title on the card, over the widest
// genre row and a full-length overview.
const pirates: Movie = {
  kind: 'movie',
  placeId: 'Q46717',
  name: 'Pirates of the Caribbean: The Curse of the Black Pearl',
  photoUrl: 'https://example.com/pirates.png',
  year: 2003,
  runtimeMinutes: 137,
  genres: ['Adventure', 'Action', 'Comedy', 'Fantasy'],
  rating: 79,
  overview:
    'Pirates of the Caribbean: The Curse of the Black Pearl is a 2003 American swashbuckler film directed by Gore Verbinski. Produced by Jerry Bruckheimer and distributed by Buena Vista Pictures via the Walt Disney Pictures label, the film is based on the Pirates of the Caribbean attraction at Disney…',
};

const deal = vi.fn(async (): Promise<Movie[]> => [alien, heat]);
vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: (...args: unknown[]) => deal(...args),
  getSession: vi.fn(async () => ({ shareableLink: 'http://localhost:3000/join?code=AB123' })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

import SelectionPage from '../../src/pages/SelectionPage';
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

describe('Movie Deck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deal.mockResolvedValue([alien, heat]);
    useSessionStore.getState().resetSession();
    useSessionStore.setState({
      sessionCode: 'AB123',
      branch: 'watch',
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

  it('deals Movie cards with title, poster, year and runtime, genres, critics score and overview', async () => {
    renderSelectionPage();

    expect(await screen.findByText('Alien')).toBeInTheDocument();
    expect(screen.getByAltText('Alien')).toHaveAttribute('src', 'https://example.com/alien.jpg');
    expect(screen.getByText('1979 · 117 min')).toBeInTheDocument();
    expect(screen.getByText('Horror')).toBeInTheDocument();
    expect(screen.getByText('Sci-Fi')).toBeInTheDocument();
    expect(screen.getByText('93% critics')).toBeInTheDocument();
    expect(screen.getByText(/commercial starship crew/)).toBeInTheDocument();
    // The overview is CC BY-SA Wikipedia text, so the card credits the article.
    expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
      'href',
      'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q103569'
    );
  });

  // jsdom lays nothing out, so the fit is asserted by construction: a Movie's
  // poster frame yields to half the card (a Restaurant's keeps 62%), the info
  // region clips rather than scrolls, and the credit still renders under the
  // longest title in the corpus.
  it('fits the longest title, four genres, a full overview and the credit on one card', async () => {
    deal.mockResolvedValue([pirates]);
    renderSelectionPage();

    const card = (await screen.findByText(pirates.name)).closest('[data-swipe-card]')!;
    expect(card.querySelector('[data-photo-region]')).toHaveClass('h-1/2');
    expect(card.querySelector('[data-photo-region]')).not.toHaveClass('h-[62%]');
    expect(screen.getByText(pirates.name)).toHaveClass('line-clamp-2');
    expect(screen.getByText(/swashbuckler film/)).toHaveClass('line-clamp-3');
    expect(screen.getByText(/swashbuckler film/).parentElement).toHaveClass('overflow-hidden');
    expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
      'href',
      'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q46717'
    );
  });

  it('renders none of the Restaurant-only meta for a Movie', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    // The critics score is a percentage badge, never the Restaurant's stars.
    expect(screen.queryByLabelText(/^Rating/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open now|Closed now/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Price level/)).not.toBeInTheDocument();
  });

  it('records a Selection and broadcasts a Live Selection when a Movie is swiped yes', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    fireEvent.click(screen.getByLabelText('Like'));

    await waitFor(() => {
      expect(useSessionStore.getState().selections).toEqual(['Q103569']);
    });
    expect(sendLiveSelection).toHaveBeenCalledWith('AB123', 'Q103569');
    // The next card is dealt by the same cursor the restaurant deck uses.
    expect(screen.getByText('Heat')).toBeInTheDocument();
  });

  it('titles the Deck "Choose Movies"', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    expect(screen.getByRole('heading', { name: 'Choose Movies' })).toBeInTheDocument();
  });
});
