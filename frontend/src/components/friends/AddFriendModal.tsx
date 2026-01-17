// AddFriendModal Component
// Modal to search for users and send friend requests

import { useState } from 'react';
import { useFriendsStore } from '../../stores/friendsStore';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddFriendModal({ isOpen, onClose }: AddFriendModalProps) {
  const [email, setEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const {
    searchUsers,
    sendFriendRequest,
    searchResults,
    isSearching,
    error,
    clearError,
  } = useFriendsStore();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage('');

    if (email.trim()) {
      await searchUsers(email.trim());
    }
  };

  const handleSendRequest = async (userEmail: string) => {
    clearError();
    setSuccessMessage('');

    const success = await sendFriendRequest(userEmail);
    if (success) {
      setSuccessMessage('Friend request sent!');
      setEmail('');
    }
  };

  const handleClose = () => {
    setEmail('');
    setSuccessMessage('');
    clearError();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-midnight-100 rounded-2xl shadow-card border border-midnight-50/30 w-full max-w-md p-6 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-semibold text-cream">Add Friend</h2>
            <button
              onClick={handleClose}
              className="text-cream-500 hover:text-cream transition-colors p-1"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search form */}
          <form onSubmit={handleSearch} className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-cream-300 mb-2">
              Search by email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="flex-1 px-4 py-3 text-cream bg-midnight-200 border border-midnight-50/50 rounded-xl placeholder:text-cream-500 focus:border-amber/60 focus:ring-1 focus:ring-amber/30 outline-none transition-all"
              />
              <button
                type="submit"
                disabled={isSearching || !email.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber to-amber-300 text-midnight font-semibold rounded-xl hover:from-amber-300 hover:to-amber-200 disabled:from-midnight-50 disabled:to-midnight-50 disabled:text-cream-500 disabled:cursor-not-allowed transition-all shadow-glow disabled:shadow-none"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-xl">
              <p className="text-sm text-error-light">{error}</p>
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-xl">
              <p className="text-sm text-success-light">{successMessage}</p>
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="border-t border-midnight-50/30 pt-4">
              <h3 className="text-sm font-medium text-cream-400 mb-3">Results</h3>
              <ul className="space-y-2">
                {searchResults.map((user) => (
                  <li
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-midnight-200/50 rounded-xl border border-midnight-50/20"
                  >
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full ring-2 ring-amber/20"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber to-amber-500 flex items-center justify-center shadow-glow">
                          <span className="text-midnight font-medium">
                            {user.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-cream">{user.displayName}</p>
                        <p className="text-xs text-cream-500">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => user.email && handleSendRequest(user.email)}
                      className="px-3 py-1.5 text-sm font-medium text-amber hover:text-amber-200 hover:bg-amber/10 rounded-lg transition-colors"
                    >
                      Add Friend
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No results message */}
          {searchResults.length === 0 && !isSearching && email && !error && !successMessage && (
            <div className="text-center py-4 text-cream-500 text-sm">
              No users found with that email
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
