// The entry fork (#255): `/` asks the only question that matters — "Tonight
// you're…" — with three Branch cards, and demotes Join/Compare to a text row.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import HomePage from '../../src/pages/HomePage';
import { useAuthStore } from '../../src/stores/authStore';
import { useFriendsStore } from '../../src/stores/friendsStore';

function CreateStub() {
  const [params] = useSearchParams();
  return <div>Create branch: {params.get('branch') ?? 'none'}</div>;
}

function renderFork(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<CreateStub />} />
        <Route path="/join" element={<div>Join route</div>} />
        <Route path="/compare" element={<div>Compare route</div>} />
        <Route path="/cook" element={<div>Cook setup route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HomePage entry fork', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, session: null });
    useFriendsStore.getState().reset();
  });

  it('asks "Tonight you\'re…" with the three Branch cards', () => {
    renderFork();
    expect(screen.getByRole('heading', { name: /tonight you.re/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /eating out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /getting takeaway/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cooking/i })).toBeInTheDocument();
  });

  it('routes the Eat Out card into the existing create flow with its branch', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /eating out/i }));
    expect(screen.getByText('Create branch: eatout')).toBeInTheDocument();
  });

  it('routes the Takeaway card into the existing create flow with its branch', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /getting takeaway/i }));
    expect(screen.getByText('Create branch: takeaway')).toBeInTheDocument();
  });

  it('routes the Cook card into Cook setup (#259)', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /cooking/i }));
    expect(screen.getByText('Cook setup route')).toBeInTheDocument();
  });

  it('keeps Join with a code reachable from the text row', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: /join with a code/i }));
    expect(screen.getByText('Join route')).toBeInTheDocument();
  });

  it('keeps Compare delivery prices reachable from the text row', () => {
    renderFork();
    fireEvent.click(screen.getByRole('button', { name: 'Compare delivery prices' }));
    expect(screen.getByText('Compare route')).toBeInTheDocument();
  });

  it('the fork never asks solo-or-group', () => {
    renderFork();
    expect(screen.queryByText(/solo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/group\?/i)).not.toBeInTheDocument();
  });
});
