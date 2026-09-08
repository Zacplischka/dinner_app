// Main entry point for React application
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { initializeNativeStorage } from './services/nativeStorage';
import { useSessionStore } from './stores/sessionStore';

const root = ReactDOM.createRoot(document.getElementById('root')!);
async function start() {
  try {
    if (Capacitor.isNativePlatform()) {
      root.render(
        <main
          className="p-6"
          role="status"
          style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
        >
          Opening YupCrew…
        </main>
      );
      await initializeNativeStorage();
      await useSessionStore.persist.rehydrate();
      if (!useSessionStore.persist.hasHydrated()) throw new Error('Storage unavailable');
      const { sessionCode, orderPlaceId } = useSessionStore.getState();
      if (sessionCode && window.location.pathname === '/') {
        window.history.replaceState(
          {},
          '',
          `/session/${encodeURIComponent(sessionCode)}${orderPlaceId ? '/order' : ''}`
        );
      }
    }
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch {
    root.render(
      <main
        className="p-6 space-y-4"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <p role="alert">Your saved session could not be opened. Unlock your phone and try again.</p>
        <button className="btn btn-primary" onClick={() => void start()}>
          Try again
        </button>
      </main>
    );
  }
}
void start();
