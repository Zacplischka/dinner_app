import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/socketBindings', () => ({
  restartSession: vi.fn(async () => undefined),
  leaveSession: vi.fn(async () => ({ success: true })),
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
      const { container } = renderResults();

      const [withPhoto, withoutPhoto] = [...container.querySelectorAll('[data-match-card]')];
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
});
