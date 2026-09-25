// The cook view holds the phone awake (#265). The hook takes the lock when
// asked, lets go when its view goes, and takes it again when the tab comes
// back — the browser drops it on every hide.
import { fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from '../../src/hooks/useWakeLock';

function mockWakeLock() {
  const sentinel = {
    released: false,
    release: vi.fn(() => {
      sentinel.released = true;
      return Promise.resolve();
    }),
  };
  const request = vi.fn().mockImplementation(() => {
    sentinel.released = false;
    return Promise.resolve(sentinel);
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return { request, sentinel, release: sentinel.release };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  fireEvent(document, new Event('visibilitychange'));
}

describe('useWakeLock', () => {
  let wakeLock: ReturnType<typeof mockWakeLock>;

  beforeEach(() => {
    wakeLock = mockWakeLock();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
  });

  it('takes the screen lock while enabled and lets go on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledWith('screen'));
    expect(wakeLock.release).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(wakeLock.release).toHaveBeenCalledTimes(1));
  });

  it('asks for nothing until enabled', async () => {
    const { rerender } = renderHook((enabled: boolean) => useWakeLock(enabled), {
      initialProps: false,
    });
    expect(wakeLock.request).not.toHaveBeenCalled();

    rerender(true);
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));
  });

  it('takes the lock again when the tab comes back, not while it is hidden', async () => {
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));

    // What a real browser does when the cook checks a message: drops the lock.
    wakeLock.sentinel.released = true;
    setVisibility('hidden');
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2));
  });

  it('does not stack a second request on a lock it still holds', async () => {
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));

    setVisibility('visible');
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('lets go of a lock that only arrived after the view had gone', async () => {
    let grant!: (held: typeof wakeLock.sentinel) => void;
    wakeLock.request.mockReturnValueOnce(new Promise((resolve) => (grant = resolve)));
    const { unmount } = renderHook(() => useWakeLock(true));
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    unmount();
    grant(wakeLock.sentinel);
    await waitFor(() => expect(wakeLock.release).toHaveBeenCalledTimes(1));
  });

  it('is a no-op in a browser without the API', () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });

    const { unmount } = renderHook(() => useWakeLock(true));
    setVisibility('visible');
    expect(() => unmount()).not.toThrow();
  });

  it('just dims when the browser refuses the lock', async () => {
    wakeLock.request.mockRejectedValueOnce(new Error('NotAllowedError'));

    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));

    unmount();
    expect(wakeLock.release).not.toHaveBeenCalled();
  });
});
