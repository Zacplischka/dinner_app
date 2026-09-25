// Creating a Session is one sequence whatever Branch the Host picked: create,
// connect, join as Host, land in the lobby. This is the shared sequence and the
// failures it hands back.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(
    async (): ReturnType<typeof import('../../src/services/socketBindings').joinSession> => ({
      success: true,
      data: {
        participantId: 'participant-1',
        sessionCode: 'AB123',
        displayName: 'Alice',
        participantCount: 1,
        rejoinToken: 'token',
        participants: [],
      },
    })
  ),
  navigate: vi.fn(),
}));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return { ...actual, createSession: mocks.createSession };
});

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: mocks.waitForConnection,
  joinSession: mocks.joinSession,
}));

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

import { ApiClientError } from '../../src/services/apiClient';
import { useCreateAndJoinSession } from '../../src/hooks/useCreateAndJoinSession';
import { useSessionStore } from '../../src/stores/sessionStore';

const created = {
  sessionCode: 'AB123',
  hostName: 'Alice',
  participantCount: 1,
  state: 'waiting',
  expiresAt: new Date().toISOString(),
  shareableLink: 'http://localhost:3000/join?code=AB123',
};

describe('useCreateAndJoinSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSession.mockResolvedValue(created);
    useSessionStore.getState().resetSession();
  });

  it('creates a Session, joins as Host and lands in the lobby', async () => {
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin('Alice', {
        branch: 'eatout',
        collaborative: true,
      });
    });

    expect(failure).toBeNull();
    expect(mocks.createSession).toHaveBeenCalledWith('Alice', {
      branch: 'eatout',
      collaborative: true,
    });
    expect(mocks.waitForConnection).toHaveBeenCalled();
    expect(mocks.joinSession).toHaveBeenCalledWith('AB123', 'Alice', false, expect.any(Number));
    // #510: replace, so browser Back skips the setup page instead of re-running create.
    expect(mocks.navigate).toHaveBeenCalledWith('/session/AB123', { replace: true });

    const store = useSessionStore.getState();
    // joinSession owns successful Session adoption; its mock does not mutate the store.
    expect(store.sessionCode).toBeNull();
    expect(store.currentUserId).toBeNull();
    // socketBindings.joinSession owns the connection flag — mocked out here, so
    // it stays false. The hook must not write it a second time.
    expect(store.isConnected).toBe(false);
    expect(store.sessionStatus).toBe('waiting');
  });

  it('is creating only while the sequence is in flight', async () => {
    let settle!: (value: typeof created) => void;
    mocks.createSession.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
    const { result } = renderHook(() => useCreateAndJoinSession());
    expect(result.current.isCreating).toBe(false);

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.createAndJoin('Alice', { branch: 'cook' });
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      settle(created);
      await pending;
    });
    await waitFor(() => expect(result.current.isCreating).toBe(false));
  });

  // #518: the socket handshake overlaps POST /sessions instead of following it.
  it('starts connecting while the create request is still in flight', async () => {
    let settle!: (value: typeof created) => void;
    mocks.createSession.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
    const { result } = renderHook(() => useCreateAndJoinSession());

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.createAndJoin('Alice', { branch: 'eatout' });
    });
    expect(mocks.waitForConnection).toHaveBeenCalled();
    expect(mocks.joinSession).not.toHaveBeenCalled();

    await act(async () => {
      settle(created);
      await pending;
    });
    expect(mocks.joinSession).toHaveBeenCalledWith('AB123', 'Alice', false, expect.any(Number));
  });

  // The caller needs the public code, not just a message (DISPLAY_NAME_TAKEN
  // re-asks for a name), and must be left on its screen.
  it('hands back the backend refusal by code and stays on the setup screen', async () => {
    mocks.createSession.mockRejectedValue(
      new ApiClientError('DISPLAY_NAME_TAKEN', 'That name is taken.', 409)
    );
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin('Alice', { branch: 'cook' });
    });

    expect(failure).toEqual({ code: 'DISPLAY_NAME_TAKEN', message: 'That name is taken.' });
    expect(mocks.joinSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
    expect(useSessionStore.getState().sessionCode).toBeNull();
  });

  it('shapes a transport failure as UNKNOWN with its message, and does not navigate', async () => {
    mocks.createSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin('Alice', { branch: 'eatout' });
    });

    expect(failure).toEqual({ code: 'UNKNOWN', message: 'Failed to fetch' });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
  });

  it('hands back the join refusal when the socket will not let the Host in', async () => {
    mocks.joinSession.mockResolvedValueOnce({
      success: false,
      error: { code: 'SESSION_FULL', message: 'This session is full.' },
    });
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin('Alice', { branch: 'eatout' });
    });

    expect(failure).toEqual({ code: 'SESSION_FULL', message: 'This session is full.' });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
    expect(useSessionStore.getState().isConnected).toBe(false);
  });
});

it('ignores an old create response after a newer admission intent', async () => {
  const { beginSessionIntent } = await import('../../src/services/sessionIntent');
  let finish!: (value: unknown) => void;
  mocks.createSession.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  mocks.joinSession.mockClear();
  mocks.navigate.mockClear();
  const { result } = renderHook(() => useCreateAndJoinSession());
  let creating!: ReturnType<typeof result.current.createAndJoin>;
  act(() => {
    creating = result.current.createAndJoin('Alice', {});
  });
  beginSessionIntent('NEW12', 'Alice');
  await act(async () => {
    finish({ sessionCode: 'OLD11' });
    await creating;
  });
  expect(mocks.joinSession).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(result.current.isCreating).toBe(false);
});
