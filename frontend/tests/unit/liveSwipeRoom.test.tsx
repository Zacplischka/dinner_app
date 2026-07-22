// Issue #186 — reveal a Live Selection in the deck strip once you have decided
// that card: the anti-conformity gate (never reveal at/ahead of the cursor)
// and the pace-sync buffer (a Live Selection that arrives early is held, not
// dropped, until you swipe past it).

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { submitSelection } from '../../src/services/socketBindings';
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

// Issue #187 — the Full House takeover: a full-screen overlay raised when the
// reveal effect's liveReveal() returns fullHouse: true, offering Finish here or
// Keep swiping.
describe('Full House takeover', () => {
  beforeEach(() => {
    vi.mocked(submitSelection).mockClear();
  });

  // Like place-1 (so it is behind the cursor and likedByMe), then land the other
  // two Live Selections for it → a Full House for a card behind the cursor.
  const raiseFullHouse = async () => {
    seedParticipants('Alice', 'Bob', 'Carol');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    await waitFor(() => expect(screen.getByText('Taco Turno')).toBeInTheDocument());
    act(() => {
      useSessionStore.getState().recordLiveSelection('place-1', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-1', 'Carol');
    });
    return screen.findByRole('dialog');
  };

  it('renders the overlay with the copy, dialog semantics and focus on Finish here', async () => {
    const dialog = await raiseFullHouse();

    expect(within(dialog).getByText('EVERYONE LIKED THIS')).toBeInTheDocument();
    expect(within(dialog).getByText('Ramen Ichiban')).toBeInTheDocument();
    expect(within(dialog).getByText('Lock it in now, or keep going for more.')).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('full-house-title');
    expect(document.getElementById('full-house-title')).toHaveTextContent('EVERYONE LIKED THIS');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Finish here' }));
  });

  it('makes the deck inert: action buttons disabled and the deck container aria-hidden', async () => {
    await raiseFullHouse();

    expect(screen.getByRole('button', { name: 'Pass', hidden: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo', hidden: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Like', hidden: true })).toBeDisabled();
    expect(screen.getByTestId('card-stack').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('Keep swiping dismisses and no second overlay fires for the rest of the deck', async () => {
    await raiseFullHouse();

    fireEvent.click(screen.getByRole('button', { name: 'Keep swiping' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // A second Restaurant reaches a Full House — the once-per-deck ref suppresses it.
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // like place-2, advance
    await waitFor(() => expect(screen.getByText('Pho Bar')).toBeInTheDocument());
    act(() => {
      useSessionStore.getState().recordLiveSelection('place-2', 'Bob');
      useSessionStore.getState().recordLiveSelection('place-2', 'Carol');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape dismisses exactly as Keep swiping does', async () => {
    const dialog = await raiseFullHouse();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Finish here submits the current selections once and lands on All Done!', async () => {
    await raiseFullHouse();

    fireEvent.click(screen.getByRole('button', { name: 'Finish here' }));

    await waitFor(() => expect(screen.getByText('All Done!')).toBeInTheDocument());
    expect(submitSelection).toHaveBeenCalledTimes(1);
    expect(submitSelection).toHaveBeenCalledWith('AB123', ['place-1']);
  });

  it('keeps the overlay up on an ack failure and re-enables the primary, sending only once', async () => {
    let resolveAck: (ack: {
      success: false;
      error: { code: 'INTERNAL_ERROR'; message: string };
    }) => void = () => {};
    vi.mocked(submitSelection).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAck = resolve;
        })
    );

    await raiseFullHouse();
    fireEvent.click(screen.getByRole('button', { name: 'Finish here' }));

    // In flight: primary shows the spinner and a second tap sends nothing.
    await waitFor(() => expect(screen.getByText('Submitting...')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Submitting/ }));

    resolveAck({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } });

    await waitFor(() =>
      expect(screen.getByText('Could not submit — try again')).toBeInTheDocument()
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish here' })).toBeEnabled();
    expect(submitSelection).toHaveBeenCalledTimes(1);
  });

  it('clears a failed submit error when the takeover is dismissed, so it never leaks to the end-of-deck screen', async () => {
    vi.mocked(submitSelection).mockResolvedValueOnce({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'boom' },
    });

    await raiseFullHouse();
    fireEvent.click(screen.getByRole('button', { name: 'Finish here' }));
    await waitFor(() =>
      expect(screen.getByText('Could not submit — try again')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Keep swiping' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Could not submit — try again')).not.toBeInTheDocument();

    // Swipe to the end of the deck: the stale error must not surface on "You've seen them all!".
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // place-2
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // place-3
    fireEvent.click(screen.getByRole('button', { name: 'Like' })); // place-4 → end
    await waitFor(() => expect(screen.getByText("You've seen them all!")).toBeInTheDocument());
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('never raises the overlay for a solo Session across the whole deck', async () => {
    seedParticipants('Alice');
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    // Like every card; a solo Session can never reach fullHouse (length >= 2 gate).
    for (const name of ['Ramen Ichiban', 'Taco Turno', 'Pho Bar', 'Curry Corner']) {
      await waitFor(() => expect(screen.getByText(name)).toBeInTheDocument());
      act(() => {
        useSessionStore.getState().recordLiveSelection('place-1', 'Ghost');
      });
      fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    }

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
