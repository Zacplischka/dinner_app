import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionLobbyState } from '@dinder/shared/types';
const mocks = vi.hoisted(() => ({ geocodeArea: vi.fn(), reverseGeocode: vi.fn() }));
vi.mock('../../src/services/apiClient', async (original) => ({
  ...(await original<typeof import('../../src/services/apiClient')>()),
  ...mocks,
}));
import LobbyChoices from '../../src/components/LobbyChoices';
const onChange = vi.fn(async () => undefined);
function lobby(branch: SessionLobbyState['branch'] = 'cook'): SessionLobbyState {
  return {
    sessionCode: 'AB123',
    state: 'waiting',
    branch,
    revision: 1,
    mealType: 'main course',
    headcount: 2,
    deckSize: 10,
    searchRadiusMiles: 5,
    participants: [
      {
        participantId: 'me',
        displayName: 'Alice',
        isHost: true,
        isOnline: true,
        hasSubmitted: false,
        ready: false,
        waitingForNextRound: false,
        cuisines: [],
        diets: [],
      },
    ],
  };
}
function renderChoices(state = lobby(), isHost = true) {
  return render(
    <LobbyChoices
      lobby={state}
      participantId="me"
      isHost={isHost}
      disabled={false}
      onChange={onChange}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});
it('keeps Main course as the shared default with the meal-type change optional', () => {
  renderChoices();
  expect(screen.getByText('Change meal type').closest('details')).not.toHaveAttribute('open');
  fireEvent.change(screen.getByLabelText('Shared meal type'), { target: { value: 'soup' } });
  expect(onChange).toHaveBeenCalledWith({ mealType: 'soup' });
});
it('changes only personal cuisine and diet interests', () => {
  renderChoices();
  fireEvent.click(screen.getByRole('button', { name: 'italian', exact: true }));
  expect(onChange).toHaveBeenCalledWith({ cuisines: ['italian'] });
  fireEvent.click(screen.getByRole('button', { name: 'vegetarian', exact: true }));
  expect(onChange).toHaveBeenCalledWith({ diets: ['vegetarian'] });
  expect(screen.getByText(/Every recipe must meet everyone’s requirements/)).toHaveTextContent(
    'not an allergy-safety guarantee'
  );
});
it('retains the server deck size and Host ownership of headcount/deck size', () => {
  const view = renderChoices();
  expect(screen.getByText('10 recipes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Bigger Deck' }));
  expect(onChange).toHaveBeenCalledWith({ deckSize: 15 });
  fireEvent.change(screen.getByLabelText('Cooking for'), { target: { value: '4' } });
  expect(onChange).toHaveBeenCalledWith({ headcount: 4 });
  view.unmount();
  renderChoices(lobby(), false);
  expect(screen.queryByRole('button', { name: 'Bigger Deck' })).toBeNull();
  expect(screen.queryByLabelText('Cooking for')).toBeNull();
  expect(screen.getByText('Change meal type')).toBeInTheDocument();
});
it.each([
  ['cook', 'recipes', 50],
  ['watch', 'titles', 50],
  ['eatout', 'restaurants', 20],
  ['takeaway', 'restaurants', 20],
] as const)('shows the confirmed %s Deck size without changing its limits', (branch, unit, max) => {
  const state = lobby(branch);
  const view = renderChoices(state);
  const visibleCards = () =>
    view.container.querySelectorAll('[data-deck-preview-card][data-active="true"]');
  expect(screen.getByText(`10 ${unit}`)).toBeInTheDocument();
  expect(visibleCards()).toHaveLength(10);
  expect(view.container.querySelector('[data-deck-preview]')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bigger Deck' }));
  expect(onChange).toHaveBeenCalledWith({ deckSize: 15 });
  // The server owns the shared value; no optimistic, misleading extra cards.
  expect(visibleCards()).toHaveLength(10);
  const update = (deckSize: number, disabled = false) =>
    view.rerender(
      <LobbyChoices
        lobby={{ ...state, deckSize }}
        participantId="me"
        isHost
        disabled={disabled}
        onChange={onChange}
      />
    );
  update(15);
  expect(visibleCards()).toHaveLength(15);
  const animationStyles = () =>
    Array.from(view.container.querySelectorAll('[data-deck-preview-card]'), (card) =>
      card.getAttribute('style')
    );
  const movingCards = animationStyles();
  update(15, true);
  expect(animationStyles()).toEqual(movingCards);
  update(5);
  expect(screen.getByRole('button', { name: 'Smaller Deck' })).toBeDisabled();
  update(max);
  expect(visibleCards()).toHaveLength(max);
  expect(screen.getByRole('button', { name: 'Bigger Deck' })).toBeDisabled();
  update(10, true);
  expect(screen.getByRole('button', { name: 'Smaller Deck' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Bigger Deck' })).toBeDisabled();
});
it('collects all requirements before checking admission of a Cook newcomer', async () => {
  const state = lobby();
  state.state = 'selecting';
  state.participants[0].waitingForNextRound = true;
  renderChoices(state);
  fireEvent.click(screen.getByRole('button', { name: 'vegetarian', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'gluten free', exact: true }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Check requirements' }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith({ diets: ['vegetarian', 'gluten free'] })
  );
  expect(screen.getByText(/waiting outside this round/)).toBeInTheDocument();
});
it.each(['eatout', 'takeaway'] as const)(
  'supports manual location inside the %s Lobby',
  async (branch) => {
    mocks.geocodeArea.mockResolvedValue({
      latitude: -37.82,
      longitude: 144.99,
      area: 'Richmond VIC',
    });
    renderChoices(lobby(branch), false);
    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    fireEvent.change(screen.getByLabelText('Suburb or postcode'), {
      target: { value: 'Richmond' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find area' }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        location: { latitude: -37.82, longitude: 144.99, address: 'Richmond VIC' },
      })
    );
    expect(mocks.geocodeArea).toHaveBeenCalledWith('Richmond');
  }
);
it('recovers from denied location permission with manual entry', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    configurable: true,
  });
  renderChoices(lobby('eatout'));
  fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter your suburb or postcode');
  expect(screen.getByLabelText('Suburb or postcode')).toBeEnabled();
});
it('keeps the query after an unresolvable area', async () => {
  mocks.geocodeArea.mockRejectedValue(new Error('Could not find that suburb'));
  renderChoices(lobby('takeaway'));
  fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
  fireEvent.change(screen.getByLabelText('Suburb or postcode'), { target: { value: 'Nowhere' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find area' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not find');
  expect(screen.getByLabelText('Suburb or postcode')).toHaveValue('Nowhere');
});
it('converts the bounded visible radius to backend miles', () => {
  renderChoices(lobby('eatout'));
  const radius = screen.getByRole('slider');
  expect(radius).toHaveAttribute('min', '2');
  expect(radius).toHaveAttribute('max', '24');
  fireEvent.change(radius, { target: { value: '16' } });
  expect(onChange).toHaveBeenCalledWith({ searchRadiusMiles: 9.9 });
});
