import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from '../../src/hooks/usePrefersReducedMotion';

describe('usePrefersReducedMotion', () => {
  it('reads the query once, follows its change events, and unsubscribes on unmount', () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    const removeEventListener = vi.fn();
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, fn: typeof listener) => {
            listener = fn;
          },
          removeEventListener,
        }) as never
    );

    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');

    act(() => listener?.({ matches: true }));
    expect(result.current).toBe(true);

    act(() => listener?.({ matches: false }));
    expect(result.current).toBe(false);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('is false when matchMedia is not available', () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { writable: true, value: undefined });
    try {
      expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', { writable: true, value: original });
    }
  });
});
