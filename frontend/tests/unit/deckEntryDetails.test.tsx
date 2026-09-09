// Issue #424 — tapping the top Deck card opens a details sheet: a Movie's whole
// overview, a Restaurant's full address and a map link. The card's text region
// is clipped so the swipe-stack geometry (#75) holds, so the details go over the
// Deck rather than growing in place.

import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckEntry, Movie, Recipe, Restaurant } from '@dinder/shared/types';

const alien: Movie = {
  kind: 'movie',
  placeId: 'tmdb:movie:348',
  mediaType: 'movie',
  name: 'Alien',
  photoUrl: 'https://example.com/alien.jpg',
  year: 1979,
  runtimeMinutes: 117,
  genres: ['Horror', 'Sci-Fi'],
  rating: 93,
  imdbId: 'tt0078748',
  trailerUrl: 'https://www.youtube.com/watch?v=LjLamj-b0I8',
  overview:
    'A commercial starship crew investigate a derelict vessel and bring aboard a lifeform that will not stop until every one of them is dead.',
};
const heat: Movie = { kind: 'movie', placeId: 'tmdb:movie:949', name: 'Heat', year: 1995 };
const ramen: Restaurant = {
  placeId: 'ChIJ-ramen',
  name: 'Ramen Ichiban',
  address: '1 Market Lane, A Very Long Suburb Name, Far Away State 90210',
  cuisineType: 'Japanese ramen',
  rating: 4.6,
  priceLevel: 2,
  openNow: true,
  photoUrl: 'https://example.com/ramen.jpg',
};
const carbonara: Recipe = { kind: 'recipe', placeId: 'spoon:1', name: 'Carbonara' };

const deal = vi.fn(async (..._args: unknown[]): Promise<DeckEntry[]> => [alien, heat]);
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
import { releaseAction, SWIPE_THRESHOLD, TAP_SLOP } from '../../src/components/SwipeCard';
import { useSessionStore } from '../../src/stores/sessionStore';

const renderSelectionPage = () =>
  render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );

const seed = (branch: 'watch' | 'eatout' | 'cook', ...names: string[]) => {
  useSessionStore.getState().resetSession();
  useSessionStore.setState({
    sessionCode: 'AB123',
    branch,
    participants: names.map((displayName, i) => ({
      participantId: `p${i}`,
      displayName,
      sessionCode: 'AB123',
      joinedAt: i,
      hasSubmitted: false,
      isHost: i === 0,
    })),
  });
};

// Scoped to the stack: the open sheet shows the same name, so an unscoped
// query is ambiguous the moment the details are up.
const cardFor = (name: string) =>
  within(screen.getByTestId('card-stack'))
    .getByText(name)
    .closest('[data-swipe-card]') as HTMLElement;

// A keyboard user's route in: Tab to the pill, then press it. fireEvent.click
// does not move focus the way a real pointer does, so focus it by hand — the
// sheet must hand focus back to exactly this control on close.
const pressDetails = async () => {
  const pill = await screen.findByRole('button', { name: 'Details' });
  pill.focus();
  fireEvent.click(pill);
  return { pill, dialog: await screen.findByRole('dialog') };
};

describe('releaseAction', () => {
  it('reads a release as a swipe past the threshold, a tap inside the slop, or a spring-back', () => {
    expect(releaseAction(SWIPE_THRESHOLD + 1)).toBe('like');
    expect(releaseAction(-SWIPE_THRESHOLD - 1)).toBe('pass');
    expect(releaseAction(0)).toBe('tap');
    expect(releaseAction(TAP_SLOP)).toBe('tap');
    expect(releaseAction(-TAP_SLOP)).toBe('tap');
    // Between the slop and the threshold is neither: the card just settles.
    expect(releaseAction(TAP_SLOP + 1)).toBe('settle');
    expect(releaseAction(-SWIPE_THRESHOLD)).toBe('settle');
    expect(releaseAction(SWIPE_THRESHOLD)).toBe('settle');
  });
});

describe('Deck Entry details sheet — Movie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deal.mockResolvedValue([alien, heat]);
    seed('watch', 'Alice');
  });

  it('opens on a tap and shows the whole overview, unclamped', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    fireEvent.mouseDown(cardFor('Alien'), { clientX: 120 });
    fireEvent.mouseUp(cardFor('Alien'), { clientX: 120 });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const overview = within(dialog).getByText(/commercial starship crew/);
    expect(overview).not.toHaveClass('line-clamp-3');
    expect(within(dialog).getByRole('heading', { name: 'Alien' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Read full synopsis on TMDB' })
    ).toHaveAttribute('href', 'https://www.themoviedb.org/movie/348');
  });

  it('returns focus to Details after a card tap and dismissal', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    fireEvent.mouseDown(cardFor('Alien'), { clientX: 120 });
    fireEvent.mouseUp(cardFor('Alien'), { clientX: 120 });
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Details' }));
  });

  it('leaves touch and mouse gestures on the card credit to its link', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    const credit = within(cardFor('Alien')).getByRole('link', { name: 'TMDB' });
    fireEvent.touchStart(credit, { touches: [{ clientX: 120 }] });
    const end = createEvent.touchEnd(credit, { changedTouches: [{ clientX: 120 }] });
    fireEvent(credit, end);
    expect(end.defaultPrevented).toBe(false);
    fireEvent.mouseDown(credit, { clientX: 120 });
    fireEvent.mouseUp(credit, { clientX: 120 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useSessionStore.getState().selections).toEqual([]);
  });

  it('opens exactly one sheet when a mouse release runs the end handler twice', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    // mouseup bubbles: React's onMouseUp and the window listener both fire on
    // the same stale isDragging, so the open has to be idempotent.
    fireEvent.mouseDown(cardFor('Alien'), { clientX: 120 });
    fireEvent.mouseUp(cardFor('Alien'), { clientX: 120 });

    await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  // On a phone the tap that opens the sheet is followed by the browser's
  // compatibility click, hit-tested where the finger was — by then the sheet's
  // full-screen backdrop is mounted there and its click closes the sheet in the
  // same gesture. jsdom sends no compatibility click, so the seam asserted here
  // is the suppression itself.
  it('suppresses the compatibility click that would close the sheet on touch', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    const card = cardFor('Alien');
    fireEvent.touchStart(card, { touches: [{ clientX: 120 }] });
    const touchEnd = createEvent.touchEnd(card, { changedTouches: [{ clientX: 120 }] });
    fireEvent(card, touchEnd);

    await screen.findByRole('dialog');
    expect(touchEnd.defaultPrevented).toBe(true);
  });

  it('swipes on a drag past the threshold and opens nothing', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    fireEvent.mouseDown(cardFor('Alien'), { clientX: 10 });
    fireEvent.mouseMove(cardFor('Alien'), { clientX: 160 });
    fireEvent.mouseUp(cardFor('Alien'), { clientX: 160 });

    await waitFor(() => expect(useSessionStore.getState().selections).toEqual(['tmdb:movie:348']));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resets without opening when the touch is cancelled', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    fireEvent.touchStart(cardFor('Alien'), { touches: [{ clientX: 120 }] });
    fireEvent.touchCancel(cardFor('Alien'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The gesture is over, so the touchend the browser may still deliver is a
    // no-op rather than a late tap.
    fireEvent.touchEnd(cardFor('Alien'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cardFor('Alien').style.transform).not.toContain('translateX');
  });

  it('opens from the Details control without starting a drag', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');

    const { pill } = await pressDetails();
    // Pressing the pill must not leave the card mid-drag behind the sheet.
    expect(cardFor('Alien').style.cursor).not.toBe('grabbing');
    expect(pill.closest('[data-swipe-card]')).toBe(cardFor('Alien'));
  });

  it('closes on Escape and hands focus back to the Details control', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    const { pill, dialog } = await pressDetails();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(pill));
  });

  it('closes on a backdrop click and on hardware back', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    const { dialog } = await pressDetails();

    fireEvent.click(within(dialog).getByTestId('details-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await pressDetails();
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('leaves the Deck keys dead while it is open', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    await pressDetails();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Backspace' });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(useSessionStore.getState().selections).toEqual([]);
    expect(cardFor('Alien')).toBeInTheDocument();
  });

  it('shows the trailer, IMDb and TMDB credit links', async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    const { dialog } = await pressDetails();

    expect(within(dialog).getByRole('link', { name: 'Watch trailer' })).toHaveAttribute(
      'href',
      alien.trailerUrl
    );
    expect(within(dialog).getByRole('link', { name: 'IMDb' })).toHaveAttribute(
      'href',
      'https://www.imdb.com/title/tt0078748/'
    );
    expect(within(dialog).getByRole('link', { name: 'TMDB' })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/348'
    );
  });

  it('falls back to a YouTube search when the corpus has no trailer', async () => {
    deal.mockResolvedValue([{ ...alien, trailerUrl: undefined }]);
    renderSelectionPage();
    await screen.findByText('Alien');
    const { dialog } = await pressDetails();

    expect(within(dialog).getByRole('link', { name: 'Watch trailer' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/results?search_query=Alien%201979%20trailer'
    );
  });

  // ADR 0014: every Movie surface credits TMDB, and an overview is optional.
  it('credits TMDB even when the Movie has no overview', async () => {
    deal.mockResolvedValue([heat]);
    renderSelectionPage();
    await screen.findByText('Heat');
    const { dialog } = await pressDetails();

    expect(within(dialog).getByRole('link', { name: 'TMDB' })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org/movie/949'
    );
  });

  it('drops the slide-in under prefers-reduced-motion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (media: string) =>
        ({
          matches: true,
          media,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    renderSelectionPage();
    await screen.findByText('Alien');
    const { dialog } = await pressDetails();

    expect(within(dialog).getByTestId('details-panel')).not.toHaveClass('animate-slide-up');
  });
});

describe('Deck Entry details sheet — Full House interrupt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deal.mockResolvedValue([alien, heat]);
    seed('watch', 'Alice', 'Bob', 'Carol');
  });

  // Like Alien so it sits behind the cursor, open the details of Heat, then
  // let Bob and Carol complete the house on Alien behind the open sheet.
  const openSheetThenFullHouse = async () => {
    renderSelectionPage();
    await screen.findByText('Alien');
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    await screen.findByText('Heat');
    await pressDetails();

    act(() => {
      useSessionStore.getState().recordLiveSelection('tmdb:movie:348', 'Bob');
      useSessionStore.getState().recordLiveSelection('tmdb:movie:348', 'Carol');
    });

    const takeover = await screen.findByRole('dialog');
    expect(within(takeover).getByText('EVERYONE LIKED THIS')).toBeInTheDocument();
    return takeover;
  };

  it('closes the sheet, shows the takeover, and leaves one history entry behind', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const takeover = await openSheetThenFullHouse();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // The sheet's entry is reused rather than stacked on top of.
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Heat')).toBeInTheDocument();
    expect(takeover).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Details' }));
  });

  // The sheet's focus restore must not out-run the takeover's autoFocus: focus
  // behind the takeover would sit in the aria-hidden deck, and the takeover's
  // Escape is a handler on the dialog, so it would stop dismissing it.
  it('leaves focus inside the takeover, where Escape still dismisses it', async () => {
    const takeover = await openSheetThenFullHouse();

    await waitFor(() => expect(takeover.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).toHaveAccessibleName('Finish here');
    const keep = within(takeover).getByRole('button', { name: 'Keep swiping' });
    keep.focus();
    fireEvent.keyDown(keep, { key: 'Tab' });
    expect(document.activeElement).toHaveAccessibleName('Finish here');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Heat')).toBeInTheDocument();
  });
});

describe('Deck Entry details sheet — Restaurant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deal.mockResolvedValue([ramen]);
    seed('eatout', 'Alice');
  });

  it('shows the full address and a Google Maps link that opens safely in a new tab', async () => {
    renderSelectionPage();
    await screen.findByText('Ramen Ichiban');
    const { dialog } = await pressDetails();

    const address = within(dialog).getByText(ramen.address!);
    expect(address).not.toHaveClass('truncate');
    expect(within(dialog).getByText('Japanese ramen')).toBeInTheDocument();
    expect(within(dialog).getByText('Open now')).toBeInTheDocument();

    const maps = within(dialog).getByRole('link', { name: 'Open in Google Maps' });
    expect(maps).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Ramen%20Ichiban&query_place_id=ChIJ-ramen'
    );
    expect(maps).toHaveAttribute('target', '_blank');
    expect(maps).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).queryByRole('region', { name: 'Opening hours' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /^Call / })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Visit website' })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Rating 4.6')).toBeInTheDocument();
  });

  it('shows the weekly hours with today emphasized, phone, website and rating count', async () => {
    const openingHours = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ].map((day) => `${day}: 9:00 AM – 5:00 PM`);
    const today = new Date().toLocaleDateString('en-AU', { weekday: 'long' });
    deal.mockResolvedValue([
      {
        ...ramen,
        openingHours,
        phone: '(03) 5550 1234',
        websiteUrl: 'https://example.com/restaurant',
        userRatingCount: 1204,
      },
    ]);
    renderSelectionPage();
    const { dialog } = await pressDetails();

    const hours = within(dialog).getByRole('region', { name: 'Opening hours' });
    expect(within(hours).getAllByRole('listitem')).toHaveLength(7);
    for (const line of openingHours) expect(within(hours).getByText(line)).toBeInTheDocument();
    expect(hours.querySelectorAll('strong')).toHaveLength(1);
    expect(hours.querySelector('strong')).toHaveTextContent(`${today}: 9:00 AM – 5:00 PM`);
    expect(within(dialog).getByRole('link', { name: 'Call (03) 5550 1234' })).toHaveAttribute(
      'href',
      'tel:(03) 5550 1234'
    );
    const website = within(dialog).getByRole('link', { name: 'Visit website' });
    expect(website).toHaveAttribute('href', 'https://example.com/restaurant');
    expect(website).toHaveAttribute('target', '_blank');
    expect(website).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(dialog).getByLabelText('Rating 4.6 · 1,204 ratings')).toHaveTextContent(
      '★ 4.6 · 1,204 ratings'
    );
  });

  it.each(['javascript:alert(1)', 'not a URL', 'https://user:secret@example.com/'])(
    'omits an unsafe website %s and empty hours while retaining a zero rating count',
    async (websiteUrl) => {
      deal.mockResolvedValue([{ ...ramen, openingHours: [], websiteUrl, userRatingCount: 0 }]);
      renderSelectionPage();
      const { dialog } = await pressDetails();
      expect(within(dialog).queryByRole('link', { name: 'Visit website' })).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole('region', { name: 'Opening hours' })
      ).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText('Rating 4.6 · 0 ratings')).toBeInTheDocument();
    }
  );

  // #85 again: 0 is a genuinely free Restaurant, not an unknown one, and an
  // empty run of '$' is a blank chip and a meaningless announcement.
  it('says "Free" for a price level of 0, as the Match card does', async () => {
    deal.mockResolvedValue([{ ...ramen, priceLevel: 0 }]);
    renderSelectionPage();
    await screen.findByText('Ramen Ichiban');
    const { dialog } = await pressDetails();

    expect(within(dialog).getByText('Free')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^Price level/)).not.toBeInTheDocument();
  });
});

describe('Deck Entry details sheet — Recipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deal.mockResolvedValue([carbonara]);
    seed('cook', 'Alice');
  });

  it('opens truthful fallback details for an older Recipe and returns focus without selecting', async () => {
    renderSelectionPage();
    const { pill, dialog } = await pressDetails();
    expect(
      within(dialog).getByText('A description is not available for this recipe.')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Cooking time is not available.')).toBeInTheDocument();
    expect(within(dialog).getByText('Spoonacular')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(pill);
    expect(useSessionStore.getState().selections).toEqual([]);
  });

  it('shows sourced description, cuisine, time, ingredients and credit inside the existing sheet', async () => {
    deal.mockResolvedValue([
      {
        ...carbonara,
        details: {
          description: 'Pasta with egg and cheese.',
          cuisines: ['Italian'],
          readyInMinutes: 25,
          ingredients: ['200 g pasta', '2 eggs'],
          steps: ['Boil the pasta.', 'Stir in the eggs off the heat.'],
          servings: 2,
          sourceName: 'Test Kitchen',
          sourceUrl: 'https://example.com/recipe',
        },
      },
    ]);
    renderSelectionPage();
    const { dialog } = await pressDetails();
    expect(within(dialog).getByText('Pasta with egg and cheese.')).toBeInTheDocument();
    expect(within(dialog).getByText('Italian')).toBeInTheDocument();
    expect(within(dialog).getByText('Ready in 25 minutes')).toBeInTheDocument();
    expect(within(dialog).getByText('200 g pasta')).toBeInTheDocument();
    expect(within(dialog).getByText('2 ingredients · 2 steps')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Preview the method'));
    expect(within(dialog).getByText('Stir in the eggs off the heat.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Test Kitchen' })).toHaveAttribute(
      'href',
      'https://example.com/recipe'
    );
    fireEvent.click(screen.getByTestId('details-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useSessionStore.getState().selections).toEqual([]);
  });

  it('shows Owned ingredients without inventing time, description or a source credit', async () => {
    deal.mockResolvedValue([
      {
        ...carbonara,
        placeId: 'owned:carbonara',
        details: {
          cuisines: ['Italian'],
          ingredients: ['200 g pasta'],
          steps: ['Boil the pasta.'],
          provenance: 'owned' as const,
        },
      },
    ]);
    renderSelectionPage();
    const { dialog } = await pressDetails();
    expect(within(dialog).getByText('200 g pasta')).toBeInTheDocument();
    expect(within(dialog).queryByText('Spoonacular')).not.toBeInTheDocument();
    expect(within(dialog).getByText('1 ingredient · 1 step')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Cooking time is not available. Check the method before choosing.')
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('A description is not available for this recipe.')
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(useSessionStore.getState().selections).toEqual([]);
  });
});
