// React Router configuration and main App component
// Based on: specs/001-dinner-decider-enables/tasks.md T050

import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import { useSessionStore } from './stores/sessionStore';
import { useAuthStore } from './stores/authStore';
import { DEMO_MODE } from './config/demo';
import { AnimatedRoute } from './components/PageTransition';

// Lazy load route components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const GuideHomePage = lazy(() => import('./pages/GuideHomePage'));
const GuideListPage = lazy(() => import('./pages/GuideListPage'));
const RestaurantDetailPage = lazy(() => import('./pages/RestaurantDetailPage'));

// Demo decider flow uses the existing routes, but with dummy data/services
const CreateSessionPage = lazy(() => import('./pages/CreateSessionPage'));
const JoinSessionPage = lazy(() => import('./pages/JoinSessionPage'));
const SessionLobbyPage = lazy(() => import('./pages/SessionLobbyPage'));
const SelectionPage = lazy(() => import('./pages/SelectionPage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));

// Legacy/unused in demo (kept for later)
const FriendsPage = lazy(() => import('./pages/FriendsPage'));

// New homepage redesign (Food Network inspired)
const HomePageRedesign = lazy(() => import('./pages/HomePageRedesign'));

// New discovery pages (Food Network style)
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const CuratedListPage = lazy(() => import('./pages/CuratedListPage'));
const RestaurantDetailPageV2 = lazy(() => import('./pages/RestaurantDetailPageV2'));

// Loading fallback component - matches dark theme
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-midnight">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-amber border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-cream-400 font-body">Loading...</p>
      </div>
    </div>
  );
}

// Animated routes wrapper - provides smooth page transitions
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatedRoute key={location.pathname}>
      <Routes location={location}>
        {/* Home with auth */}
        <Route path="/" element={<HomePage />} />

        {/* Guide pages */}
        <Route path="/guide" element={<GuideHomePage />} />
        <Route path="/lists/:listId" element={<GuideListPage />} />
        <Route path="/r/:placeId" element={<RestaurantDetailPage />} />

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

        {/* New homepage redesign preview */}
        <Route path="/home-v2" element={<HomePageRedesign />} />

        {/* New discovery pages (Food Network style) */}
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/guides/:listId" element={<CuratedListPage />} />
        <Route path="/restaurant/:restaurantId" element={<RestaurantDetailPageV2 />} />

        {/* 404 - Redirect to home */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </AnimatedRoute>
  );
}

function App() {
  const sessionCode = useSessionStore((state) => state.sessionCode);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const initializeAuth = useAuthStore((state) => state.initialize);

  useEffect(() => {
    // Demo mode: mark "connected" and assign a stable-ish client ID.
    if (DEMO_MODE) {
      const store = useSessionStore.getState();
      store.setConnectionStatus(true);
      if (!store.currentUserId) {
        store.setCurrentUserId(`demo-client-${Math.random().toString(16).slice(2)}`);
      }
      return;
    }

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
    <BrowserRouter>
      <ToastProvider>
        <Suspense fallback={<LoadingFallback />}>
          <AnimatedRoutes />
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;