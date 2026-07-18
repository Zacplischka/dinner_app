import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../../src/pages/HomePage';
import ComparisonViewPage from '../../src/pages/ComparisonViewPage';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';

vi.mock('../../src/services/comparisonStream', () => ({
  subscribeToComparison: vi.fn(() => vi.fn()),
}));

function ComparisonListStub() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Leave list</button>
      <button onClick={() => navigate('/compare/place-1', { state: { fromComparisonList: true } })}>
        Open comparison
      </button>
    </>
  );
}

describe('comparison navigation', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, session: null });
    useFriendsStore.getState().reset();
  });

  it('opens comparison browsing from the Home quick action', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/compare" element={<div>Comparison browsing</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Compare delivery prices' }));
    expect(screen.getByText('Comparison browsing')).toBeInTheDocument();
  });

  it('returns from a comparison without adding a back-stack loop', () => {
    render(
      <MemoryRouter
        initialEntries={['/sentinel', '/compare']}
        initialIndex={1}
      >
        <Routes>
          <Route path="/sentinel" element={<div>Sentinel</div>} />
          <Route path="/compare" element={<ComparisonListStub />} />
          <Route path="/compare/:placeId" element={<ComparisonViewPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open comparison' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave list' }));
    expect(screen.getByText('Sentinel')).toBeInTheDocument();
  });

  it('returns a cold-opened comparison to the comparison list', () => {
    render(
      <MemoryRouter initialEntries={['/compare/place-1']}>
        <Routes>
          <Route path="/compare" element={<ComparisonListStub />} />
          <Route path="/compare/:placeId" element={<ComparisonViewPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Open comparison' })).toBeInTheDocument();
  });
});
