// FriendsPage - View and manage friends
// Features: Friends list, pending requests, session invites, add friends

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '../stores/authStore';
import { useFriendsStore } from '../stores/friendsStore';
import FriendsList from '../components/friends/FriendsList';
import FriendRequestCard from '../components/friends/FriendRequestCard';
import SessionInviteCard from '../components/friends/SessionInviteCard';
import AddFriendModal from '../components/friends/AddFriendModal';
import Spinner, { LoadingFallback } from '../components/Spinner';
import NavigationHeader from '../components/NavigationHeader';
import { Notice } from '../components/Notice';

const ACTION =
  'mt-4 min-h-[44px] px-6 py-2 font-medium text-white bg-cyan rounded-xl hover:bg-cyan/90 transition-colors';

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

  if (authLoading) return <LoadingFallback />;

  if (!isAuthenticated) {
    return null;
  }

  const tabs = [
    {
      id: 'friends' as const,
      // Hide the count until it's known, so a failed or in-flight fetch never
      // advertises "(0)" as fact
      label: isLoadingFriends || friendsError ? 'Friends' : `Friends (${friends.length})`,
      badge: undefined,
      isLoading: isLoadingFriends,
      error: friendsError,
      retry: fetchFriends,
      items: friends,
      empty: (
        <Notice
          heading="No friends yet"
          body="Friends can be invited straight into your sessions — no code sharing needed."
        >
          <button onClick={() => setIsAddModalOpen(true)} className={ACTION}>
            Add a friend
          </button>
        </Notice>
      ),
      list: (
        <div className="bg-raised rounded-2xl shadow-card border border-line/30">
          <FriendsList friends={friends} />
        </div>
      ),
    },
    {
      id: 'requests' as const,
      label: 'Requests',
      badge: friendRequests.length
        ? { count: friendRequests.length, className: 'text-text bg-coral' }
        : undefined,
      isLoading: isLoadingRequests,
      error: requestsError,
      retry: fetchFriendRequests,
      items: friendRequests,
      empty: (
        <Notice heading="No pending requests" body="Friend requests you receive will appear here" />
      ),
      list: friendRequests.map((request) => (
        <FriendRequestCard key={request.id} request={request} />
      )),
    },
    {
      id: 'invites' as const,
      label: 'Invites',
      badge: sessionInvites.length
        ? { count: sessionInvites.length, className: 'text-white bg-cyan' }
        : undefined,
      isLoading: isLoadingInvites,
      error: invitesError,
      retry: fetchSessionInvites,
      items: sessionInvites,
      empty: (
        <Notice
          heading="No session invites"
          body="When friends invite you to sessions, they'll appear here"
        />
      ),
      list: sessionInvites.map((invite) => <SessionInviteCard key={invite.id} invite={invite} />),
    },
  ];
  const tab = tabs.find((t) => t.id === activeTab)!;

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
              {tabs.map(({ id, label, badge }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                    activeTab === id
                      ? 'border-cyan text-cyan'
                      : 'border-transparent text-muted hover:text-text/80'
                  }`}
                >
                  {label}
                  {badge && (
                    <span
                      className={`ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full ${badge.className}`}
                    >
                      {badge.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {tab.isLoading ? (
            <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
              <Spinner className="text-cyan" label={`Loading ${tab.id}…`} />
              <p className="mt-2 text-muted">Loading {tab.id}…</p>
            </div>
          ) : tab.error ? (
            <Notice heading={`Couldn't load ${tab.id}`} body="Friends are unavailable right now.">
              <button onClick={() => void tab.retry()} className={ACTION}>
                Retry
              </button>
            </Notice>
          ) : tab.items.length === 0 ? (
            tab.empty
          ) : (
            tab.list
          )}
        </div>
      </div>

      {/* Add friend modal */}
      <AddFriendModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </main>
  );
}
