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
      <div className="flex items-center justify-center min-h-screen bg-midnight">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-cream-400">Loading...</p>
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
    <main className="min-h-screen bg-warm-gradient">
      {/* Header */}
      <header className="bg-midnight-100 border-b border-midnight-50/30">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-cream-400 hover:text-amber transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-xl font-display font-semibold text-cream">Friends</h1>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center text-amber hover:text-amber-200 font-medium transition-colors"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex border-b border-midnight-50/30">
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'friends'
                  ? 'border-amber text-amber'
                  : 'border-transparent text-cream-500 hover:text-cream-300'
              }`}
            >
              Friends ({friends.length})
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === 'requests'
                  ? 'border-amber text-amber'
                  : 'border-transparent text-cream-500 hover:text-cream-300'
              }`}
            >
              Requests
              {requestsCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-midnight bg-error rounded-full">
                  {requestsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('invites')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === 'invites'
                  ? 'border-amber text-amber'
                  : 'border-transparent text-cream-500 hover:text-cream-300'
              }`}
            >
              Invites
              {invitesCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-midnight bg-amber rounded-full">
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
          <div className="bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30">
            {isLoadingFriends ? (
              <div className="p-8 text-center">
                <div className="inline-block w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-cream-500">Loading friends...</p>
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
              <div className="p-8 text-center bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30">
                <div className="inline-block w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-cream-500">Loading requests...</p>
              </div>
            ) : friendRequests.length === 0 ? (
              <div className="p-8 text-center bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 text-cream-500">
                <p className="text-lg">No pending requests</p>
                <p className="text-sm mt-1 text-cream-500/60">Friend requests you receive will appear here</p>
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
              <div className="p-8 text-center bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30">
                <div className="inline-block w-6 h-6 border-2 border-amber border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-2 text-cream-500">Loading invites...</p>
              </div>
            ) : sessionInvites.length === 0 ? (
              <div className="p-8 text-center bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 text-cream-500">
                <p className="text-lg">No session invites</p>
                <p className="text-sm mt-1 text-cream-500/60">When friends invite you to sessions, they'll appear here</p>
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
