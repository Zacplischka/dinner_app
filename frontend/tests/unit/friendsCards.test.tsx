// The three Friends cards each act on their own row: a Session Invite joins the
// Session, a Friend Request is answered, a Friend is removed. Joining has to
// wait for the socket first, and every failure has to land under the card whose
// button caused it rather than vanishing when the button re-enables.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Friend, FriendRequest, SessionInvite } from '@dinder/shared/types';

const mocks = vi.hoisted(() => ({
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(async () => ({
    success: true,
    data: { participantId: 'participant-1', state: 'waiting' },
  })),
}));

vi.mock('../../src/services/socketBindings', () => ({
  waitForConnection: mocks.waitForConnection,
  joinSession: mocks.joinSession,
}));

import FriendRequestCard from '../../src/components/friends/FriendRequestCard';
import FriendsList from '../../src/components/friends/FriendsList';
import SessionInviteCard from '../../src/components/friends/SessionInviteCard';
import { useFriendsStore } from '../../src/stores/friendsStore';
import { useToastStore } from '../../src/hooks/useToast';
import { useSessionStore } from '../../src/stores/sessionStore';

const invite: SessionInvite = {
  id: 'invite-1',
  sessionCode: 'AB123',
  inviter: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'alice@example.com' },
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const request: FriendRequest = {
  id: 'request-1',
  fromUser: { id: 'user-2', displayName: 'Bob', avatarUrl: null, email: 'bob@example.com' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

const friend: Friend = {
  id: 'friend-1',
  friendshipId: 'friendship-1',
  displayName: 'Bob',
  avatarUrl: null,
  email: 'bob@example.com',
  status: 'accepted',
};

function renderInvite() {
  return render(
    <MemoryRouter initialEntries={['/friends']}>
      <Routes>
        <Route path="/friends" element={<SessionInviteCard invite={invite} />} />
        <Route path="/session/:sessionCode" element={<div>Lobby</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Friends cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
    useToastStore.setState({ toasts: [] });
    useFriendsStore.getState().reset();
    useFriendsStore.setState({
      sessionInvites: [invite],
      currentUserProfile: {
        id: 'user-9',
        displayName: 'Cara',
        avatarUrl: null,
        email: 'cara@example.com',
      },
    });
  });

  it('waits for the socket, joins, then spends the invite and opens the lobby', async () => {
    const accept = vi.fn(async () => true);
    useFriendsStore.setState({ acceptSessionInvite: accept });

    renderInvite();
    fireEvent.click(screen.getByText('Join'));

    await waitFor(() => expect(screen.getByText('Lobby')).toBeInTheDocument());
    expect(mocks.joinSession).toHaveBeenCalledWith('AB123', 'Cara');
    expect(mocks.waitForConnection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.joinSession.mock.invocationCallOrder[0]
    );
    // The one-shot accept is spent only once the join acked.
    expect(mocks.joinSession.mock.invocationCallOrder[0]).toBeLessThan(
      accept.mock.invocationCallOrder[0]
    );
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('still opens the lobby, and keeps the invite listed, when the accept fails', async () => {
    // The join already acked, so the user is in the Session: dropping the card
    // and navigating away would hide a row the server still lists as pending.
    useFriendsStore.setState({ acceptSessionInvite: vi.fn(async () => false) });

    renderInvite();
    fireEvent.click(screen.getByText('Join'));

    await waitFor(() => expect(screen.getByText('Lobby')).toBeInTheDocument());
    expect(useFriendsStore.getState().sessionInvites).toHaveLength(1);
    expect(useToastStore.getState().toasts.at(-1)?.message).toContain('still shows');
  });

  it('leaves the invite unspent and the Session store untouched when the join is refused', async () => {
    const accept = vi.fn(async () => true);
    useFriendsStore.setState({ acceptSessionInvite: accept });
    mocks.joinSession.mockResolvedValueOnce({
      success: false,
      error: { code: 'SESSION_FULL', message: 'This session is full.' },
    } as never);

    renderInvite();
    fireEvent.click(screen.getByText('Join'));

    expect(await screen.findByText('This session is full.')).toBeInTheDocument();
    expect(screen.queryByText('Lobby')).not.toBeInTheDocument();
    // Nothing consumed server-side, so the invite survives a refetch too.
    expect(accept).not.toHaveBeenCalled();
    expect(useFriendsStore.getState().sessionInvites).toHaveLength(1);
    // No half-joined Session left behind: a stale code here arms App's
    // beforeunload guard and reopens a socket for a Session never entered.
    expect(useSessionStore.getState().sessionCode).toBeNull();

    fireEvent.click(screen.getByText('Join'));
    await waitFor(() => expect(screen.getByText('Lobby')).toBeInTheDocument());
    expect(accept).toHaveBeenCalledTimes(1);
    expect(mocks.joinSession).toHaveBeenCalledTimes(2);
  });

  it('shows the accept failure on the friend request card', async () => {
    useFriendsStore.setState({
      acceptFriendRequest: vi.fn(async () => {
        useFriendsStore.setState({ error: 'Friend request already answered' });
        return false;
      }),
    });

    render(<FriendRequestCard request={request} />);
    fireEvent.click(screen.getByText('Accept'));

    expect(await screen.findByText('Friend request already answered')).toBeInTheDocument();
  });

  it('shows the remove failure on the friend row', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    useFriendsStore.setState({
      removeFriend: vi.fn(async () => {
        useFriendsStore.setState({ error: 'Could not remove Bob' });
        return false;
      }),
    });

    render(<FriendsList friends={[friend]} />);
    fireEvent.click(screen.getByText('Remove'));

    expect(await screen.findByText('Could not remove Bob')).toBeInTheDocument();
  });
});
