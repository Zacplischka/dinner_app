import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
