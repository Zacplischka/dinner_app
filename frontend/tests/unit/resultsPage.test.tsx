import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/socketBindings', () => ({
  restartSession: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
}));

import ResultsPage from '../../src/pages/ResultsPage';
import { PHOTO_RETRY_DELAY_MS } from '../../src/components/RetryingPhoto';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useOrderStore } from '../../src/stores/orderStore';
import { useToastStore } from '../../src/hooks/useToast';

function participant(id: string, name: string) {
  return {
    participantId: id,
    displayName: name,
    sessionCode: 'AB123',
    joinedAt: 1,
    hasSubmitted: true,
    isHost: id === 'p1',
  };
}

const alice = participant('p1', 'Alice');
const bob = participant('p2', 'Bob');
const cara = participant('p3', 'Cara');
const dave = participant('p4', 'Dave');

const pizza = { placeId: 'place-pizza', name: 'Pizza Palace', rating: 4.2 };
const noodle = { placeId: 'place-noodle', name: 'Noodle House', rating: 4.8 };
const taco = { placeId: 'place-taco', name: 'Taco Town', rating: 3.9 };

function renderResults() {
  return render(
    <MemoryRouter initialEntries={['/session/AB123/results']}>
      <Routes>
        <Route path="/session/:sessionCode/results" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function seedStore(overrides: Partial<ReturnType<typeof useSessionStore.getState>>) {
  useSessionStore.setState({
    sessionCode: 'AB123',
    currentUserId: 'p1',
    restaurants: [pizza, noodle, taco],
    restaurantNames: {
      [pizza.placeId]: pizza.name,
      [noodle.placeId]: noodle.name,
      [taco.placeId]: taco.name,
    },
    overlappingOptions: [],
    allSelections: {},
    participants: [],
    ...overrides,
  });
}

describe('ResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
    useOrderStore.getState().clear();
  });

  describe('Compare prices link (#71)', () => {
    it('shows a Compare prices link on each Match card targeting the Comparison route', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      const link = screen.getByRole('link', { name: /compare prices/i });
      expect(link).toHaveAttribute('href', '/compare/place-pizza?source=match_card');
    });

    it('keeps the existing direct deep-link buttons on the Match card', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      expect(screen.getByRole('link', { name: /uber eats/i })).toHaveAttribute(
        'href',
        expect.stringContaining('https://www.ubereats.com/search')
      );
      expect(screen.getByRole('link', { name: /doordash/i })).toHaveAttribute(
        'href',
        expect.stringContaining('https://www.doordash.com/search')
      );
    });

    it('shows no Compare prices link when there is no Match', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [pizza.placeId], Bob: [noodle.placeId] },
      });
      renderResults();

      expect(screen.queryByRole('link', { name: /compare prices/i })).toBeNull();
    });
  });

  describe('Match card hero photo (#75, #90)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // The rating-sorted fallback crown (#166) picks Noodle House (4.8 > 4.2),
    // so look each card up by name instead of assuming DOM order. Both names
    // also appear in the unanimous-selections disclosure, so pick the match card.
    const findCard = (name: string) =>
      screen
        .getAllByText(name)
        .map((el) => el.closest('[data-match-card]'))
        .find((el): el is HTMLElement => el !== null)!;

    function renderPhotoCard() {
      const photoPizza = { ...pizza, photoUrl: 'https://places.example/pizza.jpg' };
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [photoPizza, noodle],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
        },
      });
      renderResults();
      return { photoPizza, withPhoto: findCard('Pizza Palace') };
    }

    it('renders a hero img only for winners with a photoUrl, hides it on error, and restores it when the retry loads', () => {
      const { photoPizza, withPhoto } = renderPhotoCard();
      const withoutPhoto = findCard('Noodle House');
      const img = withPhoto.querySelector('img');
      expect(img).toHaveAttribute('src', photoPizza.photoUrl);
      expect(withoutPhoto.querySelector('img')).toBeNull();

      // A transient failure hides the hero at once — no broken slot (#75)...
      fireEvent.error(img!);
      expect(withPhoto.querySelector('img')).toBeNull();

      // ...then one background retry of the same URL, still hidden until it loads.
      act(() => vi.advanceTimersByTime(PHOTO_RETRY_DELAY_MS));
      const retry = withPhoto.querySelector('img') as HTMLImageElement;
      expect(retry).toHaveAttribute('src', photoPizza.photoUrl);
      expect(retry.hidden).toBe(true);

      fireEvent.load(retry);
      expect(retry.hidden).toBe(false);
    });

    it('gives up on the hero after the retry also fails', () => {
      const { withPhoto } = renderPhotoCard();

      fireEvent.error(withPhoto.querySelector('img')!);
      act(() => vi.advanceTimersByTime(PHOTO_RETRY_DELAY_MS));
      fireEvent.error(withPhoto.querySelector('img')!);
      expect(withPhoto.querySelector('img')).toBeNull();

      // No second retry — one attempt is the contract (#90).
      act(() => vi.advanceTimersByTime(10_000));
      expect(withPhoto.querySelector('img')).toBeNull();
    });
  });

  describe('Near Miss cards (#72)', () => {
    function nearMissCards(container: HTMLElement) {
      return [...container.querySelectorAll('[data-near-miss-card]')];
    }

    it('renders the all-but-one tier with a count label for four Participants', () => {
      seedStore({
        participants: [alice, bob, cara, dave],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId],
          Cara: [pizza.placeId],
          Dave: [taco.placeId],
        },
      });
      const { container } = renderResults();

      const cards = nearMissCards(container);
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('Pizza Palace');
      expect(cards[0].textContent).toContain('3 of 4 liked this');
    });

    it('renders "2 of 3 liked this" for three Participants and never Participant names', () => {
      seedStore({
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId],
          Bob: [pizza.placeId],
          Cara: [noodle.placeId],
        },
      });
      const { container } = renderResults();

      const cards = nearMissCards(container);
      expect(cards).toHaveLength(1);
      expect(cards[0].textContent).toContain('2 of 3 liked this');
      for (const name of ['Alice', 'Bob', 'Cara']) {
        expect(cards[0].textContent).not.toContain(name);
      }
    });

    it('renders nothing new for a two-Participant empty Match', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [pizza.placeId], Bob: [noodle.placeId] },
      });
      const { container } = renderResults();

      expect(screen.getByText(/no restaurants were selected by all participants/i)).toBeTruthy();
      expect(nearMissCards(container)).toHaveLength(0);
    });

    it('renders no Near Miss cards when the Match is non-empty', () => {
      seedStore({
        participants: [alice, bob, cara],
        overlappingOptions: [pizza],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
          Cara: [pizza.placeId],
        },
      });
      const { container } = renderResults();

      expect(nearMissCards(container)).toHaveLength(0);
    });

    it('sorts Near Miss cards by rating, highest first', () => {
      seedStore({
        participants: [alice, bob, cara, dave],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
          Cara: [pizza.placeId],
          Dave: [noodle.placeId],
        },
      });
      const { container } = renderResults();

      const cards = nearMissCards(container);
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Noodle House'); // 4.8
      expect(cards[1].textContent).toContain('Pizza Palace'); // 4.2
    });

    it('routes Near Miss platform buttons through the counting redirect and tags Compare with near_miss', () => {
      seedStore({
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId],
          Bob: [pizza.placeId],
          Cara: [noodle.placeId],
        },
      });
      const { container } = renderResults();

      const [card] = nearMissCards(container);
      const links = [...card.querySelectorAll('a')];
      const hrefs = links.map((link) => link.getAttribute('href'));
      expect(hrefs).toContain(
        'http://localhost:3001/api/redirect?platform=ubereats&placeId=place-pizza&source=near_miss'
      );
      expect(hrefs).toContain(
        'http://localhost:3001/api/redirect?platform=doordash&placeId=place-pizza&source=near_miss'
      );
      expect(hrefs).toContain('/compare/place-pizza?source=near_miss');
    });
  });

  describe('Price level display (#85)', () => {
    it('omits the price level entirely when it is unknown instead of rendering "Free"', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [{ placeId: 'place-mystery', name: 'Mystery Diner', rating: 4.0 }],
        allSelections: { Alice: ['place-mystery'], Bob: ['place-mystery'] },
      });
      const { container } = renderResults();

      const card = container.querySelector('[data-match-card]');
      expect(card).not.toBeNull();
      expect(card!.textContent).not.toContain('Free');
      expect(card!.textContent).not.toContain('$');
    });

    it('renders "Free" only when the price level is genuinely free (0)', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [{ placeId: 'place-free', name: 'Free Bites', priceLevel: 0 }],
        allSelections: { Alice: ['place-free'], Bob: ['place-free'] },
      });
      const { container } = renderResults();

      expect(container.querySelector('[data-match-card]')!.textContent).toContain('Free');
    });
  });

  describe('Select Again navigation (#14)', () => {
    function renderResultsWithSelect() {
      return render(
        <MemoryRouter initialEntries={['/session/AB123/results']}>
          <Routes>
            <Route path="/session/:sessionCode/results" element={<ResultsPage />} />
            <Route path="/session/:sessionCode/select" element={<div>SELECTION SCREEN</div>} />
          </Routes>
        </MemoryRouter>
      );
    }

    it('moves every Participant back to Restaurant Selection when the Session restarts', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
        sessionStatus: 'complete',
      });
      renderResultsWithSelect();
      expect(screen.queryByText('SELECTION SCREEN')).toBeNull();

      // Mirror what the session:restarted socket handler applies to the store
      act(() => {
        useSessionStore.getState().resetSelections();
        useSessionStore.getState().setSessionStatus('selecting');
      });

      expect(screen.getByText('SELECTION SCREEN')).toBeTruthy();
    });

    it('stays on results while the Session is complete', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
        sessionStatus: 'complete',
      });
      renderResultsWithSelect();

      expect(screen.queryByText('SELECTION SCREEN')).toBeNull();
      expect(screen.getAllByText('Pizza Palace').length).toBeGreaterThan(0);
    });
  });

  describe('Unanimous Selections disclosure (#85)', () => {
    it('collapses identical per-Participant Selection lists behind a disclosure', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      const { container } = renderResults();

      const disclosure = container.querySelector('details[data-unanimous-selections]');
      expect(disclosure).not.toBeNull();
      expect(disclosure!.hasAttribute('open')).toBe(false);
      expect(disclosure!.querySelector('summary')!.textContent).toMatch(
        /see everyone's selections/i
      );
      // The per-Participant copies live inside the closed disclosure
      expect(disclosure!.textContent).toContain('Alice');
      expect(disclosure!.textContent).toContain('Bob');
    });

    it('treats the same Selections in a different order as unanimous', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza, noodle],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [noodle.placeId, pizza.placeId],
        },
      });
      const { container } = renderResults();

      expect(container.querySelector('details[data-unanimous-selections]')).not.toBeNull();
    });

    it('keeps divergent Selections visible by default', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId, noodle.placeId], Bob: [pizza.placeId] },
      });
      const { container } = renderResults();

      expect(container.querySelector('details[data-unanimous-selections]')).toBeNull();
      expect(screen.getByText(/everyone's selections/i)).toBeTruthy();
    });

    it('keeps identical empty Selection lists visible on an empty Match', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [], Bob: [] },
      });
      const { container } = renderResults();

      expect(container.querySelector('details[data-unanimous-selections]')).toBeNull();
      expect(screen.getByText(/everyone's selections/i)).toBeTruthy();
    });
  });

  describe('Celebration (#85)', () => {
    it('renders a decorative ray layer behind the Match heading only when the Match is non-empty', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      const { container } = renderResults();

      const rays = container.querySelector('[data-match-rays]');
      expect(rays).not.toBeNull();
      expect(rays!.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders no ray layer for an empty Match', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [pizza.placeId], Bob: [noodle.placeId] },
      });
      const { container } = renderResults();

      expect(container.querySelector('[data-match-rays]')).toBeNull();
    });
  });

  describe('Continuation action hierarchy (#85)', () => {
    it('orders Select Again (primary), Share Top Pick (secondary), New Session (ghost)', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      const selectAgain = screen.getByRole('button', { name: /select again/i });
      // The header also exposes a share icon button; the continuation action is the secondary one
      const share = screen
        .getAllByRole('button', { name: /share top pick/i })
        .find((button) => button.className.includes('btn-secondary'))!;
      const newSession = screen.getByRole('button', { name: /new session/i });

      expect(selectAgain.className).toContain('btn-primary');
      expect(share.className).toContain('btn-secondary');
      expect(newSession.className).toContain('btn-ghost');

      // DOM order: primary first, then secondary, then tertiary
      expect(
        selectAgain.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        share.compareDocumentPosition(newSession) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  describe('Share the Top Pick', () => {
    const seedCrown = () =>
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
        topPick: { restaurant: pizza, likedBy: 2, of: 2 },
      });

    it('hands the native sheet the crowned name, its reason and this page', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      try {
        seedCrown();
        renderResults();

        await act(async () => {
          fireEvent.click(screen.getAllByRole('button', { name: 'Share Top Pick' })[0]);
        });

        expect(share).toHaveBeenCalledWith({
          title: 'Pizza Palace',
          text: 'Everyone swiped yes on this one.',
          url: window.location.href,
        });
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
      } finally {
        delete (navigator as { share?: unknown }).share;
      }
    });

    it('falls back to copying this page and says so when there is no sheet', async () => {
      vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
      useToastStore.setState({ toasts: [] });
      seedCrown();
      renderResults();

      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Share Top Pick' })[0]);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href);
      expect(useToastStore.getState().toasts).toContainEqual(
        expect.objectContaining({ message: 'Top Pick link copied!' })
      );
    });
  });

  describe('Order together (#176)', () => {
    it('renders exactly one Order together button, on the crown, outside Other matches and off Near Miss cards', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza, noodle],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
        },
        topPick: { restaurant: noodle, likedBy: 2, of: 2 },
      });
      const { container } = renderResults();

      const buttons = screen.getAllByRole('button', { name: 'Order together' });
      expect(buttons).toHaveLength(1);

      const crownCard = screen.getAllByText('Noodle House')[0].closest('[data-match-card]')!;
      expect(crownCard.contains(buttons[0])).toBe(true);

      const otherMatches = screen.getByText('Other matches (1)').closest('details')!;
      expect(otherMatches.querySelector('button')).toBeNull();
      expect(otherMatches.textContent).toContain('Pizza Palace');

      expect(container.querySelector('[data-near-miss-card]')).toBeNull();
    });

    it('shows an Order together button on a zero-overlap crowned Top Pick', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [pizza.placeId], Bob: [noodle.placeId] },
        topPick: { restaurant: taco, likedBy: 0, of: 2 },
      });
      renderResults();

      expect(screen.getByRole('button', { name: 'Order together' })).toBeInTheDocument();
    });

    it('sets the crowned placeId and navigates to the order route when tapped', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      fireEvent.click(screen.getByRole('button', { name: 'Order together' }));
      expect(useSessionStore.getState().orderPlaceId).toBe(pizza.placeId);
    });

    it('hides Order together for a placeId already marked no_menu', () => {
      useOrderStore.getState().markNoMenu(pizza.placeId);
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      expect(screen.queryByRole('button', { name: 'Order together' })).toBeNull();
    });
  });

  describe('Top Pick (#166)', () => {
    it('crowns the single Match with "Everyone swiped yes on this one." and no Other matches disclosure', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
        topPick: { restaurant: pizza, likedBy: 2, of: 2 },
      });
      renderResults();

      expect(screen.getByText("TOP PICK")).toBeTruthy();
      expect(screen.getByText('Everyone swiped yes on this one.')).toBeTruthy();
      expect(screen.queryByText(/other matches/i)).toBeNull();
    });

    it('crowns the best-rated of several Matches with "best rated of your N matches." and collapses the rest', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza, noodle],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
        },
        topPick: { restaurant: noodle, likedBy: 2, of: 2 },
      });
      const { container } = renderResults();

      expect(screen.getByText('Everyone swiped yes — best rated of your 2 matches.')).toBeTruthy();
      const disclosure = screen.getByText('Other matches (1)').closest('details')!;
      expect(disclosure.textContent).toContain('Pizza Palace');
      expect(disclosure.textContent).not.toContain('Noodle House');
      expect(container.querySelectorAll('[data-match-card]')).toHaveLength(2);
    });

    it('crowns the most-selected Restaurant on partial agreement, excludes it from So Close, and sizes the So Close count from pick.of', () => {
      seedStore({
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId],
          Cara: [noodle.placeId],
        },
        // `of` deliberately differs from participants.length (3) to prove the
        // So Close count reads pick.of, not the client's participants array (#12).
        topPick: { restaurant: pizza, likedBy: 2, of: 4 },
      });
      const { container } = renderResults();

      expect(screen.getByText('2 of 4 swiped yes — the closest you got.')).toBeTruthy();
      const nearMissCards = [...container.querySelectorAll('[data-near-miss-card]')];
      expect(nearMissCards).toHaveLength(1);
      expect(nearMissCards[0].textContent).toContain('Noodle House');
      expect(nearMissCards[0].textContent).toContain('3 of 4 liked this');
      expect(nearMissCards.some((card) => card.textContent?.includes('Pizza Palace'))).toBe(false);
    });

    it('crowns the highest-rated Restaurant with "Nobody swiped yes" when nobody selected anything', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [], Bob: [] },
        topPick: { restaurant: taco, likedBy: 0, of: 2 },
      });
      renderResults();

      expect(
        screen.getByText("Nobody swiped yes, so here's the highest rated nearby.")
      ).toBeTruthy();
    });

    it('renders today\'s "No Match Found" header and empty state when there is no topPick and no Match', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [],
        allSelections: { Alice: [pizza.placeId], Bob: [noodle.placeId] },
      });
      renderResults();

      expect(screen.getByText('No Match Found')).toBeTruthy();
      expect(screen.getByText(/no restaurants got a yes from everyone/i)).toBeTruthy();
      expect(screen.getByText(/no restaurants were selected by all participants/i)).toBeTruthy();
    });
  });

  // The Cook ending (#259): the crowned Recipe, and none of the delivery
  // chrome a Restaurant crown carries.
  describe('the crowned Recipe', () => {
    const rendang = {
      kind: 'recipe' as const,
      placeId: 'rec-rendang',
      name: 'Beef Rendang',
      photoUrl: 'https://img.test/rendang.jpg',
      aggregateLikes: 640,
    };
    const aglio = {
      kind: 'recipe' as const,
      placeId: 'rec-aglio',
      name: 'Aglio e Olio',
      aggregateLikes: 120,
    };

    function seedCook(overrides: Parameters<typeof seedStore>[0] = {}) {
      seedStore({
        restaurants: [rendang, aglio],
        restaurantNames: { [rendang.placeId]: rendang.name, [aglio.placeId]: aglio.name },
        participants: [alice, bob],
        overlappingOptions: [rendang],
        allSelections: { Alice: [rendang.placeId], Bob: [rendang.placeId] },
        topPick: { restaurant: rendang, likedBy: 2, of: 2 },
        ...overrides,
      });
    }

    it('crowns the Recipe with its title and image', () => {
      seedCook();
      const { container } = renderResults();

      const crown = container.querySelector('[data-recipe-crown]')!;
      expect(crown).not.toBeNull();
      expect(crown.textContent).toContain('Beef Rendang');
      expect(crown.textContent).toContain('Everyone swiped yes on this one.');
      expect(crown.querySelector('img')).toHaveAttribute('src', rendang.photoUrl);
    });

    // What follows a Cook Match is the Shopping List (#262), on its own URL.
    it('routes the crown to the Shopping List the Session minted', async () => {
      seedCook({ shoppingListId: 'list-abc' });
      render(
        <MemoryRouter initialEntries={['/session/AB123/results']}>
          <Routes>
            <Route path="/session/:sessionCode/results" element={<ResultsPage />} />
            <Route path="/list/:listId" element={<div>Shopping list route</div>} />
          </Routes>
        </MemoryRouter>
      );

      fireEvent.click(screen.getByRole('button', { name: 'Shopping list' }));

      expect(await screen.findByText('Shopping list route')).toBeInTheDocument();
    });

    // The header read the restaurant topPick, which a Cook Session never sets, so a
    // crowned Recipe sat under "No Match Found" / "No restaurants matched…" (#253).
    it('titles a crowned Recipe as a Match, not "No Match Found"', () => {
      seedCook();
      renderResults();

      expect(screen.getByText('Perfect Match!')).toBeInTheDocument();
      expect(screen.queryByText('No Match Found')).not.toBeInTheDocument();
      expect(
        screen.queryByText("No restaurants got a yes from everyone")
      ).not.toBeInTheDocument();
    });

    it('offers no dead button when nothing could be minted', () => {
      seedCook();
      renderResults();

      expect(screen.queryByRole('button', { name: 'Shopping list' })).not.toBeInTheDocument();
    });

    // Select Again was gated on the Restaurant-only pick, so a crowned Recipe
    // had no Restart (#369).
    it('offers Select Again on a crowned Recipe', () => {
      seedCook();
      renderResults();

      expect(screen.getByRole('button', { name: 'Select Again' })).toBeInTheDocument();
    });

    it('celebrates a Recipe Match the same as a Restaurant one', () => {
      seedCook();
      renderResults();

      expect(screen.getByText('MATCH!')).toBeInTheDocument();
    });

    it('offers no delivery, compare or order actions on a dish you cook', () => {
      seedCook();
      const { container } = renderResults();

      expect(screen.queryByRole('button', { name: 'Order together' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /uber eats|doordash/i })).not.toBeInTheDocument();
      expect(container.querySelector('a[href*="/compare/"]')).toBeNull();
    });

    it('crowns outright — no other-matches list for a group to re-choose from', () => {
      seedCook({
        overlappingOptions: [rendang, aglio],
        allSelections: {
          Alice: [rendang.placeId, aglio.placeId],
          Bob: [rendang.placeId, aglio.placeId],
        },
      });
      const { container } = renderResults();

      expect(screen.queryByText(/other matches/i)).not.toBeInTheDocument();
      // The runner-up appears only in the per-Participant transparency lists,
      // never as a second thing to choose from.
      expect(container.querySelector('[data-recipe-crown]')!.textContent).not.toContain(
        'Aglio e Olio'
      );
      expect(container.querySelectorAll('[data-match-card]')).toHaveLength(1);
    });

    // A Recipe can be a Near Miss too (CONTEXT.md) — the tier is kind-agnostic.
    // Only the delivery actions on the card are restaurant chrome.
    it('surfaces a Recipe Near Miss as a count, with nothing to order or compare', () => {
      const laksa = {
        kind: 'recipe' as const,
        placeId: 'rec-laksa',
        name: 'Laksa',
        aggregateLikes: 300,
      };
      seedCook({
        restaurants: [rendang, aglio, laksa],
        restaurantNames: {
          [rendang.placeId]: rendang.name,
          [aglio.placeId]: aglio.name,
          [laksa.placeId]: laksa.name,
        },
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [rendang.placeId, laksa.placeId],
          Bob: [rendang.placeId, laksa.placeId],
          Cara: [aglio.placeId],
        },
        topPick: { restaurant: rendang, likedBy: 2, of: 3 },
      });
      const { container } = renderResults();

      expect(screen.getByText('2 of 3 swiped yes — the closest you got.')).toBeInTheDocument();

      const nearMissCards = container.querySelectorAll('[data-near-miss-card]');
      expect(nearMissCards).toHaveLength(1);
      // The crowned Recipe is never also a Near Miss.
      expect(nearMissCards[0].textContent).toContain('Laksa');
      expect(nearMissCards[0].textContent).toContain('2 of 3 liked this');
      expect(nearMissCards[0].querySelector('a')).toBeNull();
    });
  });

  // The Watch ending (#369): the crowned Movie, its trailer, and none of the
  // delivery or shopping chrome the other crowns carry.
  describe('the crowned Movie', () => {
    const alien = {
      kind: 'movie' as const,
      placeId: 'Q103569',
      name: 'Alien',
      photoUrl: 'https://img.test/alien.jpg',
      year: 1979,
      runtimeMinutes: 117,
      genres: ['Horror', 'Sci-Fi'],
      rating: 93,
      overview: 'Alien is a 1979 science fiction horror film directed by Ridley Scott.',
      trailerUrl: 'https://www.youtube.com/watch?v=is2EMy3u0xc',
    };
    const heat = {
      kind: 'movie' as const,
      placeId: 'Q188652',
      name: 'Heat',
      year: 1995,
      rating: 88,
    };

    function seedWatch(overrides: Parameters<typeof seedStore>[0] = {}) {
      seedStore({
        branch: 'watch',
        restaurants: [alien, heat],
        restaurantNames: { [alien.placeId]: alien.name, [heat.placeId]: heat.name },
        participants: [alice, bob],
        overlappingOptions: [alien],
        allSelections: { Alice: [alien.placeId], Bob: [alien.placeId] },
        topPick: { restaurant: alien, likedBy: 2, of: 2 },
        ...overrides,
      });
    }

    it('crowns the Movie with its title, poster, facts and reason', () => {
      seedWatch();
      const { container } = renderResults();

      const crown = container.querySelector('[data-movie-crown]')!;
      expect(crown).not.toBeNull();
      expect(crown.textContent).toContain('TONIGHT’S MOVIE');
      expect(crown.textContent).toContain('Alien');
      expect(crown.textContent).toContain('1979 · 117 min · 93% critics');
      expect(crown.textContent).toContain('Everyone swiped yes on this one.');
      expect(crown.querySelector('img')).toHaveAttribute('src', alien.photoUrl);
      // The crown is where the overview can actually be read, credited where it appears.
      expect(within(crown as HTMLElement).getByText(alien.overview)).toHaveClass('line-clamp-3');
      expect(within(crown as HTMLElement).getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
        'href',
        'https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/Q103569'
      );
      // A Movie is not a Recipe: the Cook ending must not claim it.
      expect(container.querySelector('[data-recipe-crown]')).toBeNull();
    });

    it('titles a crowned Movie as a Match and celebrates it', () => {
      seedWatch();
      renderResults();

      expect(screen.getByText('Perfect Match!')).toBeInTheDocument();
      expect(screen.getByText('MATCH!')).toBeInTheDocument();
    });

    it('offers no delivery, compare, order or shopping-list actions on a movie', () => {
      seedWatch();
      const { container } = renderResults();

      expect(screen.queryByRole('button', { name: 'Order together' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Shopping list' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /uber eats|doordash/i })).not.toBeInTheDocument();
      expect(container.querySelector('a[href*="/compare/"]')).toBeNull();
    });

    it('links the trailer in a new tab when the source has one', () => {
      seedWatch();
      renderResults();

      const trailer = screen.getByRole('link', { name: 'Watch trailer' });
      expect(trailer).toHaveAttribute('href', alien.trailerUrl);
      expect(trailer).toHaveAttribute('target', '_blank');
      expect(trailer.getAttribute('rel')).toContain('noopener');
    });

    // 118 of the corpus's 300 Movies carry no trailer id; the crown still ends
    // in a next step, so the same button searches YouTube for one.
    it('searches YouTube for the trailer when the source has none', () => {
      seedWatch({
        overlappingOptions: [heat],
        allSelections: { Alice: [heat.placeId], Bob: [heat.placeId] },
        topPick: { restaurant: heat, likedBy: 2, of: 2 },
      });
      renderResults();

      const trailer = screen.getByRole('link', { name: 'Watch trailer' });
      expect(trailer).toHaveAttribute(
        'href',
        'https://www.youtube.com/results?search_query=Heat%201995%20trailer'
      );
      expect(trailer).toHaveAttribute('target', '_blank');
      expect(trailer.getAttribute('rel')).toContain('noopener');
      // No overview, so nothing to credit.
      expect(screen.queryByRole('link', { name: 'Wikipedia' })).not.toBeInTheDocument();
    });

    it('links where to watch on JustWatch Australia in a new tab', () => {
      seedWatch();
      renderResults();

      const where = screen.getByRole('link', { name: 'Where to watch' });
      expect(where).toHaveAttribute('href', 'https://www.justwatch.com/au/search?q=Alien');
      expect(where).toHaveAttribute('target', '_blank');
      expect(where.getAttribute('rel')).toContain('noopener');
    });

    it('offers Select Again on a crowned Movie', () => {
      seedWatch();
      renderResults();

      expect(screen.getByRole('button', { name: 'Select Again' })).toBeInTheDocument();
    });

    it('crowns the highest-rated Movie with "Nobody swiped yes" when nobody selected anything', () => {
      seedWatch({
        overlappingOptions: [],
        allSelections: { Alice: [], Bob: [] },
        topPick: { restaurant: alien, likedBy: 0, of: 2 },
      });
      renderResults();

      expect(
        screen.getByText("Nobody swiped yes, so here's the highest rated.")
      ).toBeInTheDocument();
    });

    // A Movie can be a Near Miss too (CONTEXT.md): name and count, with neither
    // the Restaurant's stars nor anything to order or compare.
    it('surfaces a Movie Near Miss as a name and count', () => {
      seedWatch({
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [alien.placeId, heat.placeId],
          Bob: [alien.placeId, heat.placeId],
          Cara: [],
        },
        topPick: { restaurant: alien, likedBy: 2, of: 3 },
      });
      const { container } = renderResults();

      const nearMissCards = container.querySelectorAll('[data-near-miss-card]');
      expect(nearMissCards).toHaveLength(1);
      expect(nearMissCards[0].textContent).toContain('Heat');
      expect(nearMissCards[0].textContent).toContain('2 of 3 liked this');
      expect(nearMissCards[0].textContent).not.toContain('88');
      expect(nearMissCards[0].querySelector('a')).toBeNull();
    });

    it('names the Deck kind when nothing was crowned', () => {
      seedWatch({ overlappingOptions: [], allSelections: {}, topPick: undefined });
      renderResults();

      expect(screen.getByText('No movies got a yes from everyone')).toBeInTheDocument();
    });
  });

  // The Eat Out ending (#258): the decision is the destination. Takeaway — and
  // a Session created before the entry fork — keeps today's continuation.
  describe('the Eat Out ending', () => {
    function seedBranch(
      branch: 'eatout' | 'takeaway' | undefined,
      overrides: Parameters<typeof seedStore>[0] = {}
    ) {
      seedStore({
        branch,
        participants: [alice, bob],
        overlappingOptions: [pizza, noodle],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
        },
        topPick: { restaurant: noodle, likedBy: 2, of: 2 },
        ...overrides,
      });
    }

    it('crowns the Top Pick and offers no Comparison, Group Order or delivery continuation', () => {
      seedBranch('eatout');
      const { container } = renderResults();

      const crown = container.querySelector('[data-match-card]')!;
      expect(crown.textContent).toContain('Noodle House');
      expect(crown.textContent).toContain('best rated of your 2 matches.');

      expect(screen.queryByRole('button', { name: 'Order together' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /uber eats|doordash/i })).not.toBeInTheDocument();
      expect(container.querySelector('a[href*="/compare/"]')).toBeNull();
    });

    it('drops the continuation from Near Miss cards too', () => {
      seedBranch('eatout', {
        participants: [alice, bob, cara],
        overlappingOptions: [],
        allSelections: {
          Alice: [pizza.placeId, noodle.placeId],
          Bob: [pizza.placeId, noodle.placeId],
          Cara: [taco.placeId],
        },
        topPick: { restaurant: pizza, likedBy: 2, of: 3 },
      });
      const { container } = renderResults();

      const nearMissCards = container.querySelectorAll('[data-near-miss-card]');
      expect(nearMissCards).toHaveLength(1);
      expect(nearMissCards[0].querySelector('a')).toBeNull();
    });

    it('keeps the Takeaway continuation exactly as it ships today', () => {
      seedBranch('takeaway');
      renderResults();

      expect(screen.getByRole('button', { name: 'Order together' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /compare prices/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('link', { name: /uber eats/i }).length).toBeGreaterThan(0);
    });

    it('keeps today’s behavior for a Session created with no Branch', () => {
      seedBranch(undefined);
      renderResults();

      expect(screen.getByRole('button', { name: 'Order together' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /compare prices/i }).length).toBeGreaterThan(0);
    });
  });
});
