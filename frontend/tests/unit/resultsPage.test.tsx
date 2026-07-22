import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/socketBindings', () => ({
  restartSession: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
}));

import ResultsPage from '../../src/pages/ResultsPage';
import { useSessionStore } from '../../src/stores/sessionStore';

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

  describe('Match card hero photo (#75)', () => {
    it('renders a hero img only for winners with a photoUrl and drops it on load error', () => {
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

      // The rating-sorted fallback crown (#166) picks Noodle House (4.8 > 4.2),
      // so look each card up by name instead of assuming DOM order. Both names
      // also appear in the unanimous-selections disclosure, so pick the match card.
      const findCard = (name: string) =>
        screen
          .getAllByText(name)
          .map((el) => el.closest('[data-match-card]'))
          .find((el): el is HTMLElement => el !== null)!;
      const withPhoto = findCard('Pizza Palace');
      const withoutPhoto = findCard('Noodle House');
      const img = withPhoto.querySelector('img');
      expect(img).toHaveAttribute('src', photoPizza.photoUrl);
      expect(withoutPhoto.querySelector('img')).toBeNull();

      fireEvent.error(img!);
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
    it('orders Select Again (primary), Share Results (secondary), Start Fresh (ghost)', () => {
      seedStore({
        participants: [alice, bob],
        overlappingOptions: [pizza],
        allSelections: { Alice: [pizza.placeId], Bob: [pizza.placeId] },
      });
      renderResults();

      const selectAgain = screen.getByRole('button', { name: /select again/i });
      // The header also exposes a share icon button; the continuation action is the secondary one
      const share = screen
        .getAllByRole('button', { name: /share results/i })
        .find((button) => button.className.includes('btn-secondary'))!;
      const startFresh = screen.getByRole('button', { name: /start fresh/i });

      expect(selectAgain.className).toContain('btn-primary');
      expect(share.className).toContain('btn-secondary');
      expect(startFresh.className).toContain('btn-ghost');

      // DOM order: primary first, then secondary, then tertiary
      expect(
        selectAgain.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        share.compareDocumentPosition(startFresh) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
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

      expect(screen.getByText("TONIGHT'S PICK")).toBeTruthy();
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
      expect(screen.getByText(/no restaurants matched everyone's preferences/i)).toBeTruthy();
      expect(screen.getByText(/no restaurants were selected by all participants/i)).toBeTruthy();
    });
  });
});
