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
      useFriendsStore.getState().fetchCurrentProfile();
      fetchFriends();
      fetchFriendRequests();
      fetchSessionInvites();
    }
  }, [isAuthenticated, fetchFriends, fetchFriendRequests, fetchSessionInvites]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-muted">Loading...</p>
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
      {/* Header */}
      <header className="bg-raised/95 border-b border-line/30 backdrop-blur-md">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-muted hover:text-cyan transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-display font-semibold text-text">Friends</h1>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex min-h-[44px] items-center text-cyan hover:text-white font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

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
              Friends ({friends.length})
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
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-coral rounded-full">
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
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-ink bg-cyan rounded-full">
                  {invitesCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Friends Tab */}
        {activeTab === 'friends' && (
          <div className="bg-raised rounded-2xl shadow-card border border-line/30">
            {isLoadingFriends ? (
              <div className="p-8 text-center">
                <div className="inline-block w-6 h-6 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-muted">Loading friends...</p>
              </div>
            ) : (
              <FriendsList friends={friends} />
            )}
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="space-y-3">
            {isLoadingRequests ? (
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
                <div className="inline-block w-6 h-6 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-muted">Loading requests...</p>
              </div>
            ) : friendRequests.length === 0 ? (
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30 text-muted">
                <p className="text-lg">No pending requests</p>
                <p className="text-sm mt-1 text-muted/60">Friend requests you receive will appear here</p>
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
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30">
                <div className="inline-block w-6 h-6 border-2 border-cyan border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-muted">Loading invites...</p>
              </div>
            ) : sessionInvites.length === 0 ? (
              <div className="p-8 text-center bg-raised rounded-2xl shadow-card border border-line/30 text-muted">
                <p className="text-lg">No session invites</p>
                <p className="text-sm mt-1 text-muted/60">When friends invite you to sessions, they&apos;ll appear here</p>
              </div>
            ) : (
              sessionInvites.map((invite) => (
                <SessionInviteCard key={invite.id} invite={invite} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Friend Modal */}
      <AddFriendModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </main>
  );
}
