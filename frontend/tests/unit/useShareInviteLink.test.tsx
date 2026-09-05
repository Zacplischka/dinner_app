import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useShareInviteLink } from '../../src/hooks/useShareInviteLink';
import { useToastStore } from '../../src/hooks/useToast';

const LINK = 'http://localhost:3000/join?code=AB123';

describe('useShareInviteLink (#350)', () => {
  beforeEach(() => {
    // The global afterEach's vi.restoreAllMocks() drops setup.ts's mockResolvedValue — re-arm it.
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    delete (navigator as { share?: unknown }).share;
  });

  it('opens the native share sheet when the browser has one and leaves the clipboard alone', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { result } = renderHook(() => useShareInviteLink(LINK, 'Invite link copied!'));

    await act(() => result.current());

    expect(share).toHaveBeenCalledWith({ title: 'Dinder', url: LINK });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('copies to the clipboard and toasts the given message when there is no share sheet', async () => {
    const { result } = renderHook(() => useShareInviteLink(LINK, 'Invite link copied!'));

    await act(() => result.current());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK);
    expect(useToastStore.getState().toasts).toContainEqual(
      expect.objectContaining({ type: 'success', message: 'Invite link copied!' })
    );
  });

  it('stays silent when the sheet is dismissed (AbortError)', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const { result } = renderHook(() => useShareInviteLink(LINK, 'Invite link copied!'));

    await act(() => result.current());

    expect(share).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
