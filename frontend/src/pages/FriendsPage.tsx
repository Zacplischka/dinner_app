// FriendsPage - View and manage friends
// Features: Friends list, pending requests, session invites, add friends

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import FriendsList from '../components/friends/FriendsList';
import FriendRequestCard from '../components/friends/FriendRequestCard';
import SessionInviteCard from '../components/friends/SessionInviteCard';
import AddFriendModal from '../components/friends/AddFriendModal';
import Spinner from '../components/Spinner';
import NavigationHeader from '../components/NavigationHeader';

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
      <Spinner className="text-cyan" label={`Loading ${label}…`} />
      <p className="mt-2 text-muted">Loading {label}…</p>
    </div>
  );
}

function FailureCard({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
      <p className="text-lg text-text">Couldn&apos;t load {label}</p>
      <p className="text-sm mt-1 text-muted">Friends are unavailable right now.</p>
      <button
        onClick={onRetry}
        className="mt-4 min-h-[44px] px-6 py-2 font-medium text-white bg-cyan rounded-xl hover:bg-cyan/90 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const {
    friends,
    friendRequests,
    sessionInvites,
    isLoadingFriends,
    isLoadingRequests,
    isLoadingInvites,
    friendsError,
    requestsError,
    invitesError,
    fetchFriends,
    fetchFriendRequests,
    fetchSessionInvites,
  } = useFriendsStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'invites'>('friends');

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch data on mount
  useEffect(() => {
    if (isAuthenticated) {
      // Ensure user profile exists (creates if needed)
      void useFriendsStore.getState().fetchCurrentProfile();
      void fetchFriends();
      void fetchFriendRequests();
      void fetchSessionInvites();
    }
  }, [isAuthenticated, fetchFriends, fetchFriendRequests, fetchSessionInvites]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <div className="text-center">
          <Spinner size="lg" className="text-cyan" label="Loading…" />
          <p className="mt-4 text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const requestsCount = friendRequests.length;
  const invitesCount = sessionInvites.length;

  return (
    <main className="shared-table-backdrop min-h-screen">
      <div className="sticky top-0 z-40">
        <NavigationHeader
          title="Friends"
          showBackButton
          onBack={() => navigate('/')}
          rightAction={
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex min-h-[44px] items-center text-cyan hover:text-text font-medium transition-colors"
            >
              <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add
            </button>
          }
        />
        <div className="bg-raised/95 backdrop-blur-md border-b border-line/30">
          {/* Tabs */}
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex border-b border-line/30">
              <button
                onClick={() => setActiveTab('friends')}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'friends'
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-muted hover:text-text/80'
                }`}
              >
                {/* Hide the count until it's known, so a failed or in-flight
                    fetch never advertises "(0)" as fact */}
                {isLoadingFriends || friendsError ? 'Friends' : `Friends (${friends.length})`}
              </button>
              <button
                onClick={() => setActiveTab('requests')}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                  activeTab === 'requests'
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-muted hover:text-text/80'
                }`}
              >
                Requests
                {requestsCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-text bg-coral rounded-full">
                    {requestsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('invites')}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                  activeTab === 'invites'
                    ? 'border-cyan text-cyan'
                    : 'border-transparent text-muted hover:text-text/80'
                }`}
              >
                Invites
                {invitesCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-cyan rounded-full">
                    {invitesCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Friends Tab */}
        {activeTab === 'friends' &&
          (isLoadingFriends ? (
            <LoadingCard label="friends" />
          ) : friendsError ? (
            <FailureCard label="friends" onRetry={() => void fetchFriends()} />
          ) : friends.length === 0 ? (
            <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
              <p className="text-lg text-text">No friends yet</p>
              <p className="text-sm mt-1 text-muted">
                Friends can be invited straight into your sessions — no code sharing needed.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-4 min-h-[44px] px-6 py-2 font-medium text-white bg-cyan rounded-xl hover:bg-cyan/90 transition-colors"
              >
                Add a friend
              </button>
            </div>
          ) : (
            <div className="bg-raised rounded-2xl shadow-card border border-line/30">
              <FriendsList friends={friends} />
            </div>
          ))}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {isLoadingRequests ? (
              <LoadingCard label="requests" />
            ) : requestsError ? (
              <FailureCard label="requests" onRetry={() => void fetchFriendRequests()} />
            ) : friendRequests.length === 0 ? (
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30 text-muted">
                <p className="text-lg">No pending requests</p>
                <p className="text-sm mt-1 text-muted">
                  Friend requests you receive will appear here
                </p>
              </div>
            ) : (
              friendRequests.map((request) => (
                <FriendRequestCard key={request.id} request={request} />
              ))
            )}
          </div>
        )}

        {/* Invites Tab */}
        {activeTab === 'invites' && (
          <div className="space-y-3">
            {isLoadingInvites ? (
              <LoadingCard label="invites" />
            ) : invitesError ? (
              <FailureCard label="invites" onRetry={() => void fetchSessionInvites()} />
            ) : sessionInvites.length === 0 ? (
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30 text-muted">
                <p className="text-lg">No session invites</p>
                <p className="text-sm mt-1 text-muted">
                  When friends invite you to sessions, they&apos;ll appear here
                </p>
              </div>
            ) : (
              sessionInvites.map((invite) => <SessionInviteCard key={invite.id} invite={invite} />)
            )}
          </div>
        )}
      </div>

      {/* Add friend modal */}
      <AddFriendModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </main>
  );
}
