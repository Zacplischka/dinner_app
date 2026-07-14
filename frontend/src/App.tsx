// React Router configuration and main App component
// Based on: specs/001-dinner-decider-enables/tasks.md T050

import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import ToastProvider from './components/Toast/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { useSessionStore } from './stores/sessionStore';
import { useAuthStore } from './stores/authStore';

// Lazy load route components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const GuideHomePage = lazy(() => import('./pages/GuideHomePage'));
const GuideListPage = lazy(() => import('./pages/GuideListPage'));
const RestaurantDetailPage = lazy(() => import('./pages/RestaurantDetailPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const ComparisonViewPage = lazy(() => import('./pages/ComparisonViewPage'));

// Demo decider flow uses the existing routes, but with dummy data/services
const CreateSessionPage = lazy(() => import('./pages/CreateSessionPage'));
const JoinSessionPage = lazy(() => import('./pages/JoinSessionPage'));
const SessionLobbyPage = lazy(() => import('./pages/SessionLobbyPage'));
const SelectionPage = lazy(() => import('./pages/SelectionPage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));

const FriendsPage = lazy(() => import('./pages/FriendsPage'));

// Loading fallback component - matches dark theme
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-ink">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-cyan border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted font-body">Loading...</p>
      </div>
    </div>
  );
}

// Routes wrapper - provides smooth page transitions
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <div key={location.pathname} className="animate-slide-up">
      <Routes location={location}>
        {/* Home with auth */}
        <Route path="/" element={<HomePage />} />

        {/* Guide pages */}
        <Route path="/guide" element={<GuideHomePage />} />
        <Route path="/lists/:listId" element={<GuideListPage />} />
        <Route path="/r/:placeId" element={<RestaurantDetailPage />} />

        {/* Standalone delivery price comparison */}
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/compare/:placeId" element={<ComparisonViewPage />} />

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
    </div>
  );
}

function App() {
  const sessionCode = useSessionStore((state) => state.sessionCode);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const initializeAuth = useAuthStore((state) => state.initialize);

  useEffect(() => {
    // Initialize auth (Supabase session check)
    initializeAuth();
  }, [initializeAuth]);

  // Browser navigation guard - warn before closing/refreshing during active session
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only warn if user is in an active session (not expired or complete)
      if (sessionCode && sessionStatus !== 'expired' && sessionStatus !== 'complete') {
        e.preventDefault();
        // Modern browsers require setting returnValue
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionCode, sessionStatus]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <Suspense fallback={<LoadingFallback />}>
            <AnimatedRoutes />
          </Suspense>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
