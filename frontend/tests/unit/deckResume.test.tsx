// #404 — the Deck's cursor rides the store, so a reload resumes on the same
// card; a Deck that failed or came back empty offers a retry instead of the
// end-of-deck screen's "you liked 0, submit".

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const entry = (placeId: string, name: string) => ({
  placeId,
  name,
  address: '1 Market Lane',
  cuisineType: 'Japanese ramen',
  rating: 4.6,
  priceLevel: 2,
  photoUrl: 'https://example.com/ramen.jpg',
  openNow: true,
});

const deck = [
  entry('place-1', 'Ramen Ichiban'),
  entry('place-2', 'Taco Turno'),
  entry('place-3', 'Pho Bar'),
];

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => deck),
  getSession: vi.fn(async () => ({ shareableLink: 'http://localhost:3000/join?code=AB123' })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

import SelectionPage from '../../src/pages/SelectionPage';
import { getRestaurants } from '../../src/services/apiClient';
import { useSessionStore } from '../../src/stores/sessionStore';

const renderSelectionPage = () =>
  render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );

const progress = () => screen.getByRole('progressbar').getAttribute('aria-valuenow');

beforeEach(() => {
  vi.mocked(getRestaurants).mockResolvedValue(deck);
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

describe('the Deck cursor survives a reload', () => {
  it('resumes on the same card when the page remounts', async () => {
    const first = renderSelectionPage();
    await waitFor(() => expect(progress()).toBe('1'));

    fireEvent.click(screen.getByLabelText('Pass'));
    await waitFor(() => expect(progress()).toBe('2'));
    first.unmount();

    renderSelectionPage();
    await waitFor(() => expect(progress()).toBe('2'));
  });

  it('does not replay reveals for cards already decided before the reload', async () => {
    useSessionStore.setState({
      deckCursor: 2,
      liveSelections: { 'place-1': ['Bob'], 'place-2': ['Bob'] },
    });
    renderSelectionPage();

    await waitFor(() => expect(progress()).toBe('3'));
    expect(screen.getByTestId('strip-status').textContent).toBe('1 together');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not celebrate a Full House a second time after the reload', async () => {
    const roster = (names: string[]) =>
      names.map((displayName, i) => ({
        participantId: `p${i + 1}`,
        displayName,
        sessionCode: 'AB123',
        joinedAt: i + 1,
        hasSubmitted: false,
        isHost: i === 0,
      }));
    // Alice (me) and Bob both liked place-1 before the reload, so its Full House
    // already took the screen over. Carol joining re-arms the takeover and likes
    // it too: a bigger house, not a new one.
    useSessionStore.setState({
      deckCursor: 2,
      selections: ['place-1'],
      liveSelections: { 'place-1': ['Bob'] },
      participants: roster(['Alice', 'Bob']),
    });
    renderSelectionPage();
    await waitFor(() => expect(progress()).toBe('3'));

    act(() => {
      useSessionStore.setState({
        participants: roster(['Alice', 'Bob', 'Carol']),
        liveSelections: { 'place-1': ['Bob', 'Carol'] },
      });
    });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is cleared when the Selections are reset', () => {
    useSessionStore.getState().setDeckCursor(4);
    useSessionStore.getState().resetSelections();
    expect(useSessionStore.getState().deckCursor).toBe(0);
  });
});

describe('an empty or failed Deck', () => {
  it('offers a retry that re-fetches, never the end-of-deck screen', async () => {
    vi.mocked(getRestaurants).mockResolvedValueOnce([]);
    renderSelectionPage();

    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(screen.queryByText(/seen them all/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /submit selections/i })).toBeNull();

    fireEvent.click(retry);
    await waitFor(() => expect(progress()).toBe('1'));
  });

  it('offers a retry when the Deck request fails', async () => {
    vi.mocked(getRestaurants).mockRejectedValueOnce(new Error('Network down'));
    renderSelectionPage();

    expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByText('Network down')).toBeTruthy();
    expect(screen.queryByText(/seen them all/i)).toBeNull();
  });
});
