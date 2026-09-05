// Creating a Session is one sequence whatever Branch the Host picked: create,
// connect, join as Host, invite, land in the lobby. The setup pages own their
// forms; this is the shared sequence and the failures it hands back.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Craving, SessionLocation } from '@dinder/shared/types';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  inviteFriendsToSession: vi.fn(async () => undefined),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({ success: true, data: { participantId: 'participant-1' } })),
  navigate: vi.fn(),
}));

vi.mock('../../src/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/apiClient')>(
    '../../src/services/apiClient'
  );
  return {
    ...actual,
    createSession: mocks.createSession,
    inviteFriendsToSession: mocks.inviteFriendsToSession,
  };
});

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: mocks.waitForConnection,
  joinSession: mocks.joinSession,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

import { ApiClientError } from '../../src/services/apiClient';
import { useCreateAndJoinSession } from '../../src/hooks/useCreateAndJoinSession';
import { useSessionStore } from '../../src/stores/sessionStore';

const richmond: SessionLocation = {
  latitude: -37.8238936,
  longitude: 144.9982667,
  address: 'Richmond VIC 3121, Australia',
};

const craving: Craving = { mealType: 'main course', cuisines: ['italian'], diets: [] };

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

  it('creates an Eat Out Session, joins as Host and lands in the lobby', async () => {
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin(
        'Alice',
        { location: richmond, searchRadiusMiles: 3, branch: 'eatout' },
        new Set()
      );
    });

    expect(failure).toBeNull();
    expect(mocks.createSession).toHaveBeenCalledWith('Alice', {
      location: richmond,
      searchRadiusMiles: 3,
      branch: 'eatout',
    });
    expect(mocks.waitForConnection).toHaveBeenCalled();
    expect(mocks.joinSession).toHaveBeenCalledWith('AB123', 'Alice');
    expect(mocks.navigate).toHaveBeenCalledWith('/session/AB123');

    const store = useSessionStore.getState();
    expect(store.sessionCode).toBe('AB123');
    expect(store.currentUserId).toBe('participant-1');
    expect(store.isConnected).toBe(true);
    expect(store.sessionStatus).toBe('waiting');
    expect(store.location).toEqual(richmond);
    expect(store.searchRadiusMiles).toBe(3);
  });

  it('creates a Cook Session from a Craving and Headcount, with no location to remember', async () => {
    const { result } = renderHook(() => useCreateAndJoinSession());

    await act(async () => {
      await result.current.createAndJoin(
        'Alice',
        { branch: 'cook', craving, headcount: 4 },
        new Set()
      );
    });

    expect(mocks.createSession).toHaveBeenCalledWith('Alice', {
      branch: 'cook',
      craving,
      headcount: 4,
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/session/AB123');
    expect(useSessionStore.getState().location).toBeUndefined();
    expect(useSessionStore.getState().searchRadiusMiles).toBeUndefined();
  });

  it('invites the selected Friends once the Host is in, and nobody when none were picked', async () => {
    const { result } = renderHook(() => useCreateAndJoinSession());

    await act(async () => {
      await result.current.createAndJoin('Alice', { branch: 'cook', craving }, new Set());
    });
    expect(mocks.inviteFriendsToSession).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.createAndJoin(
        'Alice',
        { branch: 'cook', craving },
        new Set(['friend-1', 'friend-2'])
      );
    });
    expect(mocks.inviteFriendsToSession).toHaveBeenCalledWith('AB123', ['friend-1', 'friend-2']);
    expect(mocks.inviteFriendsToSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigate.mock.invocationCallOrder[1]
    );
  });

  it('is creating only while the sequence is in flight', async () => {
    let settle!: (value: typeof created) => void;
    mocks.createSession.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)));
    const { result } = renderHook(() => useCreateAndJoinSession());
    expect(result.current.isCreating).toBe(false);

    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.createAndJoin('Alice', { branch: 'cook', craving }, new Set());
    });
    expect(result.current.isCreating).toBe(true);

    await act(async () => {
      settle(created);
      await pending;
    });
    await waitFor(() => expect(result.current.isCreating).toBe(false));
  });

  // The refusal Cook setup answers with a Nearest Craving (#334): the caller
  // needs the public code, not just a message, and must be left on its screen.
  it('hands back the backend refusal by code and stays on the setup screen', async () => {
    mocks.createSession.mockRejectedValue(
      new ApiClientError('NO_RECIPES_FOUND', 'No recipes match that craving.', 404)
    );
    const { result } = renderHook(() => useCreateAndJoinSession());

    let failure: unknown;
    await act(async () => {
      failure = await result.current.createAndJoin(
        'Alice',
        { branch: 'cook', craving, headcount: 2 },
        new Set()
      );
    });

    expect(failure).toEqual({
      code: 'NO_RECIPES_FOUND',
      message: 'No recipes match that craving.',
    });
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
      failure = await result.current.createAndJoin(
        'Alice',
        { location: richmond, searchRadiusMiles: 3, branch: 'eatout' },
        new Set()
      );
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
      failure = await result.current.createAndJoin(
        'Alice',
        { location: richmond, searchRadiusMiles: 3, branch: 'eatout' },
        new Set(['friend-1'])
      );
    });

    expect(failure).toEqual({ code: 'SESSION_FULL', message: 'This session is full.' });
    expect(mocks.inviteFriendsToSession).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
    expect(useSessionStore.getState().isConnected).toBe(false);
  });
});
