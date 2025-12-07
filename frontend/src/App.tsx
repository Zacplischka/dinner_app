// React Router configuration and main App component
// Based on: specs/001-dinner-decider-enables/tasks.md T050

import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { initializeSocket } from './services/socketService';
import { useAuthStore } from './stores/authStore';

// Lazy load route components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const CreateSessionPage = lazy(() => import('./pages/CreateSessionPage'));
const JoinSessionPage = lazy(() => import('./pages/JoinSessionPage'));
const SessionLobbyPage = lazy(() => import('./pages/SessionLobbyPage'));
const SelectionPage = lazy(() => import('./pages/SelectionPage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

function App() {
  const initializeAuth = useAuthStore((state) => state.initialize);

  useEffect(() => {
    // Initialize auth on app mount
    initializeAuth();

    // Initialize Socket.IO connection on app mount
    initializeSocket();

    // Cleanup on unmount
    return () => {
      // Socket cleanup happens in socketService
    };
  }, [initializeAuth]);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Home page */}
          <Route path="/" element={<HomePage />} />

          {/* Create new session */}
          <Route path="/create" element={<CreateSessionPage />} />

          {/* Join existing session */}
          <Route path="/join" element={<JoinSessionPage />} />

          {/* Session lobby (waiting room) */}
          <Route path="/session/:sessionCode" element={<SessionLobbyPage />} />

          {/* Selection screen */}
          <Route path="/session/:sessionCode/select" element={<SelectionPage />} />

          {/* Results screen */}
          <Route path="/session/:sessionCode/results" element={<ResultsPage />} />

          {/* Friends page */}
          <Route path="/friends" element={<FriendsPage />} />

          {/* 404 - Redirect to home */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;