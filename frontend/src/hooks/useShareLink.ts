import { useCallback } from 'react';
import { toast } from './useToast';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { copyText } from '../services/device';

/**
 * The share-or-copy fallback behind every share button: the Invite Link in the
 * lobby and the Deck header (#350), and the Top Pick on the Match screen.
 * Native share sheet where the browser has one; otherwise the clipboard plus a
 * toast. Dismissing the sheet is not a failure — no toast, no clipboard write.
 * Any other rejection (NotAllowedError, insecure context, no handler) falls
 * through so the Host still ends up with the link somewhere.
 *
 * `share` is the sheet's title/text — the Top Pick's name and reason; the
 * Invite Link leaves it out. The clipboard only ever gets the URL.
 */
export function useShareLink(
  url: string | undefined,
  copiedMessage: string,
  share?: { title: string; text: string }
): () => Promise<void> {
  return useCallback(async () => {
    if (!url) return;

    if (Capacitor.isNativePlatform() || typeof navigator.share === 'function') {
      try {
        const options = { title: 'Heykeen', ...share, url };
        if (Capacitor.isNativePlatform()) await Share.share(options);
        else await navigator.share(options);
        return;
      } catch (err) {
        // navigator.share rejects with a DOMException, which is not `instanceof Error`
        // in every environment (jsdom included) — match on `.name` alone.
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return;
        if (err instanceof Error && err.message === 'Share canceled') return;
      }
    }

    await copyText(url)
      .then(() => toast.success(copiedMessage))
      .catch(() => toast.error('Could not copy link'));
  }, [url, copiedMessage, share]);
}
