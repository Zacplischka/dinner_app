// Issue #186 — reveal a Live Selection in the deck strip once you have decided
// that card: the anti-conformity gate (never reveal at/ahead of the cursor)
// and the pace-sync buffer (a Live Selection that arrives early is held, not
// dropped, until you swipe past it).

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const restaurant = {
  placeId: 'place-1',
  name: 'Ramen Ichiban',
  address: '1 Market Lane',
  cuisineType: 'Japanese ramen',
  rating: 4.6,
  priceLevel: 2,
  photoUrl: 'https://example.com/ramen.jpg',
  openNow: true,
};
const secondRestaurant = { ...restaurant, placeId: 'place-2', name: 'Taco Turno' };
const thirdRestaurant = { ...restaurant, placeId: 'place-3', name: 'Pho Bar' };
const fourthRestaurant = { ...restaurant, placeId: 'place-4', name: 'Curry Corner' };

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [
    restaurant,
    secondRestaurant,
    thirdRestaurant,
    fourthRestaurant,
  ]),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

import SelectionPage, { liveReveal } from '../../src/pages/SelectionPage';
import { useSessionStore } from '../../src/stores/sessionStore';

const participant = (id: string, displayName: string) => ({
  participantId: id,
  displayName,
  sessionCode: 'AB123',
  joinedAt: 1,
  hasSubmitted: false,
  isHost: id === 'p1',
});

const seedParticipants = (...names: string[]) => {
  useSessionStore.getState().resetSession();
  useSessionStore.setState({
    sessionCode: 'AB123',
    participants: names.map((name, i) => participant(`p${i + 1}`, name)),
  });
};

const renderSelectionPage = () =>
  render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );

const strip = () => screen.getByTestId('strip-status');

describe('liveReveal', () => {
  it('adds exactly one for likedByMe', () => {
    expect(
      liveReveal({
        placeId: 'place-1',
        selectorNames: [],
        likedByMe: true,
        participantNames: ['Alice', 'Bob'],
      })
    ).toEqual({ count: 1, fullHouse: false });
  });

  it('does not count a selector name no longer in participantNames', () => {
    expect(
      liveReveal({
        placeId: 'place-1',
        selectorNames: ['Zed'],
        likedByMe: false,
        participantNames: ['Alice', 'Bob'],
      })
    ).toEqual({ count: 0, fullHouse: false });
  });

  it('clamps the count to participantNames.length', () => {
    expect(
      liveReveal({
        placeId: 'place-1',
        selectorNames: ['Alice', 'Bob', 'Carol'],
        likedByMe: true,
        participantNames: ['Alice'],
      })
    ).toEqual({ count: 1, fullHouse: false });
  });

  it('never reports fullHouse for a solo Session even at count === participantNames.length', () => {
    expect(
      liveReveal({
        placeId: 'place-1',
        selectorNames: [],
        likedByMe: true,
        participantNames: ['Alice'],
      })
    ).toEqual({ count: 1, fullHouse: false });
  });
});

describe('Live Swipe Room reveal strip', () => {
  it('never reveals for the Restaurant at the cursor or one ahead of it (anti-conformity gate)', async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob'); // at the cursor
      useSessionStore.getState().recordLiveSelection('place-2', 'Carol'); // ahead of it
    });

    expect(strip()).toHaveTextContent('3 together');
  });

  it('reveals a buffered Live Selection once you swipe past it (pace-sync buffer)', async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-2', 'Carol');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // past place-1
    await waitFor(() => expect(screen.getByText('Taco Turno')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // past place-2

    expect(strip()).toHaveTextContent('2 of 3 liked Taco Turno');
  });

  it('clears the reveal on Undo and does not re-reveal when the Restaurant is re-decided', async () => {
    seedParticipants('Alice', 'Bob');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    await waitFor(() => expect(strip()).toHaveTextContent('1 of 2 liked Ramen Ichiban'));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(strip()).toHaveTextContent('2 together');

    fireEvent.click(screen.getByRole('button', { name: 'Pass' })); // re-decide place-1
    await waitFor(() => expect(screen.getByText('Taco Turno')).toBeInTheDocument());
    expect(strip()).toHaveTextContent('2 together');
  });

  it('does not double-count the same displayName recorded twice for one placeId (rejoin)', async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob'); // duplicate, e.g. a rejoin
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    expect(strip()).toHaveTextContent('1 of 3 liked Ramen Ichiban');
  });

  it('shrinks the denominator with the departing Participant instead of over-counting', async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    act(() => {
      useSessionStore.getState().recordLiveSelection('place-2', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-2', 'Carol');
    });
    act(() => {
      useSessionStore.getState().removeParticipant('p3'); // Carol leaves before the reveal
    });

    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // past place-1, no-op
    await waitFor(() => expect(screen.getByText('Taco Turno')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // past place-2 (likedByMe)

    expect(strip()).toHaveTextContent('2 of 2 liked Taco Turno');
  });

  it('announces only the highest-index placeId when two unlock in a single effect run', async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Pass' })); // past place-1, nothing recorded yet
    await waitFor(() => expect(screen.getByText('Taco Turno')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Pass' })); // past place-2
    await waitFor(() => expect(screen.getByText('Pho Bar')).toBeInTheDocument());
    expect(strip()).toHaveTextContent('3 together');

    // Both place-1 and place-2 unlock together in one effect run.
    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-2', 'Carol');
    });

    expect(strip()).toHaveTextContent('1 of 3 liked Taco Turno');
    expect(strip()).not.toHaveTextContent('Ramen Ichiban');

    fireEvent.click(screen.getByRole('button', { name: 'Pass' })); // past place-3, nothing new recorded
    expect(strip()).not.toHaveTextContent('Ramen Ichiban');
  });
});
