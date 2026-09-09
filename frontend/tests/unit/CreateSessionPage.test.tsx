import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(),
  leaveSession: vi.fn(),
}));
vi.mock('../../src/services/apiClient', async (original) => ({
  ...(await original<typeof import('../../src/services/apiClient')>()),
  createSession: mocks.createSession,
}));
vi.mock('../../src/services/socketBindings', () => mocks);
import CreateSessionPage from '../../src/pages/CreateSessionPage';
import CookSetupPage from '../../src/pages/CookSetupPage';
import WatchSetupPage from '../../src/pages/WatchSetupPage';
import { useAuthStore } from '../../src/stores/authStore';
import { useSessionStore } from '../../src/stores/sessionStore';
function renderPage(route = '/create') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/create" element={<CreateSessionPage />} />
        <Route path="/cook" element={<CookSetupPage />} />
        <Route path="/watch" element={<WatchSetupPage />} />
        <Route path="/session/:sessionCode" element={<div>Lobby route</div>} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.getState().resetSession();
  useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isLoading: false });
  mocks.createSession.mockResolvedValue({ sessionCode: 'AB123' });
  mocks.joinSession.mockResolvedValue({ success: true, data: { participantId: 'host' } });
  mocks.leaveSession.mockImplementation(async () => {
    useSessionStore.getState().resetSession();
    return { success: true, data: null };
  });
});
describe('gather-first entry and identity', () => {
  it.each([
    ['/create', 'eatout'],
    ['/create?branch=takeaway', 'takeaway'],
    ['/cook', 'cook'],
    ['/watch', 'watch'],
  ])('creates %s before any choices', async (route, branch) => {
    renderPage(route);
    expect(screen.queryByRole('button', { name: 'Use my current location' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Comedy' })).toBeNull();
    expect(screen.queryByLabelText('Shared meal type')).toBeNull();
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: ' Guest ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByText('Lobby route')).toBeTruthy();
    expect(mocks.createSession).toHaveBeenCalledWith('Guest', { branch, collaborative: true });
  });
  it('waits for delayed auth and creates once without a name form or confirmation', async () => {
    useAuthStore.setState({ isLoading: true });
    renderPage('/watch');
    expect(screen.queryByLabelText('Your Name')).toBeNull();
    expect(mocks.createSession).not.toHaveBeenCalled();
    act(() =>
      useAuthStore.setState({
        user: { user_metadata: { full_name: ' Alice Nguyen ' } } as never,
        isAuthenticated: true,
        isLoading: false,
      })
    );
    expect(await screen.findByText('Lobby route')).toBeTruthy();
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.createSession).toHaveBeenCalledWith('Alice Nguyen', {
      branch: 'watch',
      collaborative: true,
    });
  });
  it.each([undefined, '', ' '.repeat(5), 'A'.repeat(51)])(
    'asks for an explicit correction to invalid metadata %s',
    (name) => {
      useAuthStore.setState({
        user: { user_metadata: { full_name: name } } as never,
        isAuthenticated: true,
      });
      renderPage('/cook');
      expect(screen.getByLabelText('Your Name')).toHaveValue('');
      expect(mocks.createSession).not.toHaveBeenCalled();
    }
  );
  it('preserves a name the guest typed when auth resolves later', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alex' } });
    act(() =>
      useAuthStore.setState({
        user: { user_metadata: { full_name: 'Alice' } } as never,
        isAuthenticated: true,
      })
    );
    expect(screen.getByLabelText('Your Name')).toHaveValue('Alex');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it('retains the branch and permits retry after a create failure', async () => {
    mocks.createSession.mockRejectedValueOnce(new Error('Network unavailable'));
    renderPage('/cook');
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Zac' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Lobby route')).toBeTruthy();
  });
  it('does not replace existing participation without an explicit switch confirmation', async () => {
    useSessionStore.setState({ sessionCode: 'OLD12', sessionStatus: 'selecting' });
    useAuthStore.setState({
      user: { user_metadata: { full_name: 'Alice' } } as never,
      isAuthenticated: true,
    });
    renderPage('/cook');
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Leave this session to create or join another'
    );
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.leaveSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave and continue' }));
    await waitFor(() =>
      expect(mocks.leaveSession).toHaveBeenCalledWith('OLD12', expect.any(Number))
    );
    expect(await screen.findByText('Lobby route')).toBeTruthy();
  });
});
