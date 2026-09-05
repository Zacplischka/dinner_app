import { useCallback } from 'react';
import { toast } from './useToast';

/**
 * The share-or-copy fallback behind every Invite Link button (#350) — the
 * lobby's and the Deck header's were byte-identical apart from the success
 * toast, so that string is the one parameter.
 *
 * Native share sheet where the browser has one; otherwise the clipboard plus a
 * toast. Dismissing the sheet is not a failure — no toast, no clipboard write.
 * Any other rejection (NotAllowedError, insecure context, no handler) falls
 * through so the Host still ends up with the link somewhere.
 */
export function useShareInviteLink(
  shareableLink: string | undefined,
  copiedMessage: string
): () => Promise<void> {
  return useCallback(async () => {
    if (!shareableLink) return;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Dinder', url: shareableLink });
        return;
      } catch (err) {
        // navigator.share rejects with a DOMException, which is not `instanceof Error`
        // in every environment (jsdom included) — match on `.name` alone.
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') return;
      }
    }

    await navigator.clipboard
      .writeText(shareableLink)
      .then(() => toast.success(copiedMessage))
      .catch(() => toast.error('Could not copy link'));
  }, [shareableLink, copiedMessage]);
}
