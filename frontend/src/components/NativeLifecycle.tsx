import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { appLink } from '../services/appLinks';
import { reconcileSession } from '../services/socketBindings';
import { finishNativeSignIn } from '../services/supabase';
import { toast } from '../hooks/useToast';

export default function NativeLifecycle() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigateRef = useRef(navigate);
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    navigateRef.current = navigate;
    pathnameRef.current = pathname;
  }, [navigate, pathname]);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const handles: PluginListenerHandle[] = [];
    const register = async (pending: Promise<PluginListenerHandle>) => {
      const handle = await pending;
      if (active) handles.push(handle);
      else await handle.remove();
    };
    let lastDelivery: { url: string; time: number } | undefined;
    const openLink = async (url: string) => {
      if (!active) return;
      if (lastDelivery?.url === url && Date.now() - lastDelivery.time < 1000) return;
      lastDelivery = { url, time: Date.now() };
      const path = appLink(url);
      if (!path) {
        toast.error('This link cannot be opened in YupCrew.');
        return;
      }
      if (path.startsWith('/auth/callback')) {
        try {
          await finishNativeSignIn(url);
        } catch {
          toast.error('Sign-in did not finish. You can try again or continue as a guest.');
        }
      } else navigateRef.current(path);
    };
    const external = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href);
      if (
        url.origin === window.location.origin ||
        url.protocol === 'mailto:' ||
        url.protocol === 'tel:'
      )
        return;
      event.preventDefault();
      if (url.protocol !== 'https:' || url.username || url.password) {
        toast.error('This destination cannot be opened.');
        return;
      }
      void Browser.open({ url: url.href }).catch(() =>
        toast.error('Could not open that destination.')
      );
    };
    document.addEventListener('click', external, true);
    const connectivity = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void reconcileSession();
    };
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    void (async () => {
      await register(
        App.addListener('appUrlOpen', ({ url }) => {
          void openLink(url);
        })
      );
      if (Capacitor.getPlatform() === 'android') {
        // Android resumes after permission sheets, but becomes inactive only
        // on Stop. Require that transition before discarding a form to recover.
        let backgrounded = false;
        await register(
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) backgrounded = true;
            else if (backgrounded) {
              backgrounded = false;
              void reconcileSession();
            }
          })
        );
      } else {
        // iOS permission sheets resign active without entering the background.
        await register(App.addListener('resume', () => void reconcileSession()));
      }
      await register(
        App.addListener('backButton', ({ canGoBack }) => {
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          } else if (
            document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement
          ) {
            document.activeElement.blur();
          } else if (pathnameRef.current === '/') void App.minimizeApp();
          // Earlier Session phases redirect to the current one, so traversing
          // their history traps Back. Home preserves participation and Ready.
          else if (/^\/session\/[^/]+(?:\/(?:select|results))?\/?$/.test(pathnameRef.current))
            navigateRef.current('/', { replace: true });
          else if (canGoBack) navigateRef.current(-1);
          else navigateRef.current('/', { replace: true });
        })
      );
      const launch = await App.getLaunchUrl();
      if (launch) await openLink(launch.url);
    })().catch(() => toast.error('Some phone features are unavailable. Try reopening YupCrew.'));
    return () => {
      active = false;
      handles.forEach((handle) => {
        void handle.remove();
      });
      document.removeEventListener('click', external, true);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
    };
    // A cold-start URL is consumed once, not again after every route change.
  }, []);
  return offline ? (
    <p
      role="status"
      className="bg-surface border-b border-line px-4 py-3 text-center text-sm"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      You’re offline. Connect to create or join a session, load lists and save shared changes.
    </p>
  ) : null;
}
