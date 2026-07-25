import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  leaveSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../src/services/socketBindings', () => ({
  leaveSession: mocks.leaveSession,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

import { useLeaveSession } from '../../src/hooks/useLeaveSession';
import { useSessionStore } from '../../src/stores/sessionStore';

describe('useLeaveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSessionStore.getState().resetSession();
  });

  it('leaves the Session and navigates home', async () => {
    mocks.leaveSession.mockResolvedValueOnce({ success: true, data: null });
    const { result } = renderHook(() => useLeaveSession('AB123'));

    await act(() => result.current());

    expect(mocks.leaveSession).toHaveBeenCalledWith('AB123');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  // The reason the catch exists: leaveSession only resets the store after its
  // ack resolves, so a synchronous socket.emit throw would strand a user who has
  // already navigated home with a dirty Session and Group Order store.
  it('resets the store and still navigates home when leaving throws synchronously', async () => {
    useSessionStore.setState({ sessionCode: 'AB123' });
    mocks.leaveSession.mockImplementationOnce(() => {
      throw new Error('socket closed');
    });
    const { result } = renderHook(() => useLeaveSession('AB123'));

    await act(() => result.current());

    expect(useSessionStore.getState().sessionCode).toBeNull();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('navigates home without calling the server when there is no session code', async () => {
    const { result } = renderHook(() => useLeaveSession(undefined));

    await act(() => result.current());

    expect(mocks.leaveSession).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });
});
