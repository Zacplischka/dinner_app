// Issue #82 — keep Restaurant Selection fully visible on mobile, with
// progressive coral/lime drag feedback that respects reduced motion.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const restaurant = {
  placeId: 'place-1',
  name: 'Ramen Ichiban',
  address: '1 Market Lane, A Very Long Suburb Name, Far Away State 90210',
  cuisineType: 'Japanese ramen',
  rating: 4.6,
  priceLevel: 2,
  photoUrl: 'https://example.com/ramen.jpg',
  openNow: true,
};
const secondRestaurant = { ...restaurant, placeId: 'place-2', name: 'Taco Turno' };

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [restaurant, secondRestaurant]),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => undefined),
  leaveSession: vi.fn(async () => ({ success: true })),
}));

import SelectionPage from '../../src/pages/SelectionPage';
import SwipeCard, { swipeVisuals } from '../../src/components/SwipeCard';
import { useSessionStore } from '../../src/stores/sessionStore';

const renderSelectionPage = () =>
  render(
    <MemoryRouter initialEntries={['/session/AB123/select']}>
      <Routes>
        <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
      </Routes>
    </MemoryRouter>
  );

const renderCard = (overrides: Partial<typeof restaurant> = {}) =>
  render(
    <SwipeCard
      restaurant={{ ...restaurant, ...overrides } as never}
      onSwipeLeft={vi.fn()}
      onSwipeRight={vi.fn()}
      isTop
      stackPosition={0}
    />
  );

describe('swipeVisuals', () => {
  it('tilts gently with the drag and clamps feedback intensity at the decision threshold', () => {
    expect(swipeVisuals(50, false)).toEqual({
      rotation: 5,
      likeIntensity: 0.5,
      nopeIntensity: 0,
    });
    expect(swipeVisuals(-200, false)).toEqual({
      rotation: -20,
      likeIntensity: 0,
      nopeIntensity: 1,
    });
    expect(swipeVisuals(0, false)).toEqual({ rotation: 0, likeIntensity: 0, nopeIntensity: 0 });
  });

  it('removes tilt but keeps decision feedback under reduced motion', () => {
    expect(swipeVisuals(80, true)).toEqual({ rotation: 0, likeIntensity: 0.8, nopeIntensity: 0 });
  });
});

describe('SwipeCard drag feedback', () => {
  it('shows progressively stronger lime edge light when dragging toward Selection', () => {
    renderCard();
    const card = screen.getByText('Ramen Ichiban').closest('[data-swipe-card]') as HTMLElement;

    fireEvent.mouseDown(card, { clientX: 100 });
    fireEvent.mouseMove(card, { clientX: 130 });
    const limeEdge = screen.getByTestId('edge-light-like');
    expect(limeEdge).toHaveStyle({ opacity: '0.3' });

    fireEvent.mouseMove(card, { clientX: 180 });
    expect(limeEdge).toHaveStyle({ opacity: '0.8' });
    expect(screen.getByTestId('edge-light-nope')).toHaveStyle({ opacity: '0' });
  });

  it('shows coral edge light when dragging toward Pass', () => {
    renderCard();
    const card = screen.getByText('Ramen Ichiban').closest('[data-swipe-card]') as HTMLElement;

    fireEvent.mouseDown(card, { clientX: 200 });
    fireEvent.mouseMove(card, { clientX: 140 });
    expect(screen.getByTestId('edge-light-nope')).toHaveStyle({ opacity: '0.6' });
    expect(screen.getByTestId('edge-light-like')).toHaveStyle({ opacity: '0' });
  });

  it('does not tilt the card when the user prefers reduced motion', () => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as never
    );
    renderCard();
    const card = screen.getByText('Ramen Ichiban').closest('[data-swipe-card]') as HTMLElement;

    fireEvent.mouseDown(card, { clientX: 100 });
    fireEvent.mouseMove(card, { clientX: 180 });
    expect(card.style.transform).not.toContain('rotate');
    expect(screen.getByTestId('edge-light-like')).toHaveStyle({ opacity: '0.8' });
  });
});

describe('SwipeCard long content', () => {
  it('truncates the address in a single clean line', () => {
    renderCard();
    const address = screen.getByText(/1 Market Lane/);
    expect(address).toHaveClass('truncate');
    // A truncating flex item never shrinks text; the truncate must sit on the
    // text span itself, not the flex row that also holds the pin icon.
    expect(address.tagName).toBe('SPAN');
  });

  it('clamps long Restaurant names instead of letting them push content under the controls', () => {
    renderCard({ name: 'The Extraordinarily Long-Named Restaurant of Neon Night Market Lane' });
    expect(
      screen.getByText('The Extraordinarily Long-Named Restaurant of Neon Night Market Lane')
    ).toHaveClass('line-clamp-2');
  });

  it('describes the price level accessibly rather than by symbols alone', () => {
    renderCard();
    expect(screen.getByLabelText('Price level 2 of 4')).toHaveTextContent('$$');
  });
});

describe('SelectionPage mobile geometry', () => {
  beforeEach(() => {
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

  it('pins the whole flow inside the dynamic viewport so controls stay in the safe area', async () => {
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    const main = screen.getByRole('main');
    expect(main).toHaveClass('h-screen-dvh', 'overflow-hidden', 'flex', 'flex-col');

    const stack = screen.getByTestId('card-stack');
    expect(stack).toHaveClass('flex-1', 'min-h-0');

    expect(screen.getByRole('button', { name: 'Pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Like' })).toBeInTheDocument();
    expect(screen.getByText('Swipe or use buttons to choose')).toBeInTheDocument();
  });

  it('undoes the previous Selection when rewinding past a liked Restaurant', async () => {
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(useSessionStore.getState().selections).toEqual(['place-1']);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(useSessionStore.getState().selections).toEqual([]);
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());
  });

  it('exposes swipe progress as an accessible progressbar', async () => {
    renderSelectionPage();
    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '1');
    expect(progressbar).toHaveAttribute('aria-valuemax', '2');
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});
