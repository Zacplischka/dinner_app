import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../src/services/apiClient', () => ({
  getRestaurants: vi.fn(async () => [restaurant]),
  getSession: vi.fn(async () => ({
    sessionCode: 'AB123',
    hostName: 'Alice',
    participantCount: 1,
    state: 'waiting',
    expiresAt: new Date().toISOString(),
    shareableLink: 'http://localhost:3000/join?code=AB123',
  })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  submitSelection: vi.fn(async () => ({ success: true, data: null })),
  leaveSession: vi.fn(async () => ({ success: true, data: null })),
  restartSession: vi.fn(async () => ({ success: true, data: null })),
  sendLiveSelection: vi.fn(async () => ({ success: true, data: null })),
}));

import SelectionPage from '../../src/pages/SelectionPage';
import SessionLobbyPage from '../../src/pages/SessionLobbyPage';
import ResultsPage from '../../src/pages/ResultsPage';
import Toast from '../../src/components/Toast/Toast';
import ConfirmLeaveModal from '../../src/components/ConfirmLeaveModal';
import UserMenu from '../../src/components/UserMenu';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';

describe('Neon Night Market components', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useSessionStore.setState({ sessionCode: 'AB123', participants: [] });
  });

  it('keeps restaurant decisions colour-coded and touch-friendly', async () => {
    useSessionStore.setState({
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: false,
          isHost: true,
        },
        {
          participantId: 'p2',
          displayName: 'Bo',
          sessionCode: 'AB123',
          joinedAt: 2,
          hasSubmitted: false,
          isHost: false,
        },
        {
          participantId: 'p3',
          displayName: 'Cy',
          sessionCode: 'AB123',
          joinedAt: 3,
          hasSubmitted: false,
          isHost: false,
          isOnline: false,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/session/AB123/select']}>
        <Routes>
          <Route path="/session/:sessionCode/select" element={<SelectionPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Ramen Ichiban')).toBeInTheDocument());
    expect(screen.getByText('3 together')).toHaveClass('text-cyan');
    expect(screen.getByLabelText('Alice is choosing')).toHaveClass('border-coral');
    expect(screen.getByLabelText('Cy is offline')).toHaveClass('opacity-40');
    expect(screen.getByText('Japanese ramen')).toHaveClass('text-coral-soft');
    expect(screen.getByText('Open now')).toHaveClass('text-lime');
    expect(screen.getByLabelText('Rating 4.6')).toHaveClass('text-amber');

    expect(screen.getByRole('button', { name: 'Pass' })).toHaveClass(
      'min-h-[48px]',
      'text-coral-soft',
      'shadow-glow-coral'
    );
    expect(screen.getByRole('button', { name: 'Like' })).toHaveClass(
      'min-h-[48px]',
      'text-lime',
      'shadow-glow-lime'
    );
  });

  it('uses lime, coral, and cyan for toast severity', () => {
    render(
      <>
        <Toast
          toast={{ id: '1', type: 'success', message: 'Saved', duration: 10_000 }}
          onDismiss={vi.fn()}
        />
        <Toast
          toast={{ id: '2', type: 'error', message: 'Failed', duration: 10_000 }}
          onDismiss={vi.fn()}
        />
        <Toast
          toast={{ id: '3', type: 'info', message: 'Connected', duration: 10_000 }}
          onDismiss={vi.fn()}
        />
      </>
    );

    expect(screen.getByText('Saved').closest('[role="alert"]')).toHaveClass('border-l-lime');
    expect(screen.getByText('Failed').closest('[role="alert"]')).toHaveClass('border-l-coral');
    expect(screen.getByText('Connected').closest('[role="alert"]')).toHaveClass('border-l-cyan');
  });

  it('presents leave confirmation as a Neon dialog', () => {
    render(<ConfirmLeaveModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.shadow-glow-coral')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
      'w-11',
      'h-11',
      'rounded-full'
    );
  });

  it('presents the Session Code in a cyan invite box', async () => {
    useSessionStore.setState({
      sessionCode: 'AB123',
      isConnected: true,
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: false,
          isHost: true,
        },
        {
          participantId: 'p2',
          displayName: 'Bo',
          sessionCode: 'AB123',
          joinedAt: 2,
          hasSubmitted: false,
          isHost: false,
          isOnline: false,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={['/session/AB123']}>
        <Routes>
          <Route path="/session/:sessionCode" element={<SessionLobbyPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Copy shareable link')).toBeInTheDocument());
    expect(
      screen.getAllByText('AB123').some((element) => element.classList.contains('shadow-glow-cyan'))
    ).toBe(true);
    expect(screen.getByLabelText('Alice, host, live')).toHaveClass('border-coral');
    expect(screen.getByLabelText('Bo, offline')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toHaveClass('text-muted');
    expect(screen.getAllByText('Waiting for participant...')[0].previousElementSibling).toHaveClass(
      'border-amber'
    );
  });

  it('reserves the brightest animation for a real match', () => {
    useSessionStore.setState({
      sessionCode: 'AB123',
      participants: [
        {
          participantId: 'p1',
          displayName: 'Alice',
          sessionCode: 'AB123',
          joinedAt: 1,
          hasSubmitted: true,
          isHost: true,
        },
      ],
      overlappingOptions: [restaurant],
      allSelections: { Alice: ['place-1'] },
      restaurantNames: { 'place-1': 'Ramen Ichiban' },
      restaurants: [restaurant],
      sessionStatus: 'complete',
    });

    render(
      <MemoryRouter initialEntries={['/session/AB123/results']}>
        <Routes>
          <Route path="/session/:sessionCode/results" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'MATCH!' })).toHaveClass(
      'animate-match-pop',
      'text-lime',
      'shadow-match'
    );
    expect(screen.getAllByText('Ramen Ichiban')[0].closest('[data-match-card]')).toHaveClass(
      'border-lime'
    );
  });

  it('gives the profile avatar a cyan ring', () => {
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'alice@example.com',
        user_metadata: { full_name: 'Alice' },
      } as any,
      isAuthenticated: true,
      isLoading: false,
    });

    render(<UserMenu />);

    expect(screen.getByLabelText('Alice profile')).toHaveClass('ring-cyan');
  });
});
