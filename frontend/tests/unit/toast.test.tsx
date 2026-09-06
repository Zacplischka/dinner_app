// Toast stack behaviour (#409): a flapping connection with four friends used to
// bury the Submit button under an unbounded stack of identical toasts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast from '../../src/components/Toast/Toast';
import ToastProvider from '../../src/components/Toast/ToastProvider';
import { toast, useToastStore } from '../../src/hooks/useToast';

describe('toast stack (#409)', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('keeps at most three toasts, dropping the oldest', () => {
    toast.info('one');
    toast.info('two');
    toast.info('three');
    toast.info('four');

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['two', 'three', 'four']);
  });

  it('does not stack an identical consecutive message, but refreshes it', () => {
    const first = toast.error('Reconnecting…');
    const again = toast.error('Reconnecting…');

    // A new id means the card remounts and its 5s timer restarts — a second tap
    // must not inherit whatever was left of the first toast's countdown.
    expect(again).not.toBe(first);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].id).toBe(again);
  });

  it('keeps the older toasts when it refreshes a repeat', () => {
    toast.info('one');
    toast.error('Reconnecting…');
    toast.error('Reconnecting…');

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['one', 'Reconnecting…']);
  });

  it('re-adds a repeat that is no longer consecutive', () => {
    toast.error('Reconnecting…');
    toast.success('Back online');
    toast.error('Reconnecting…');

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'Reconnecting…',
      'Back online',
      'Reconnecting…',
    ]);
  });

  it('treats the same message from a different type as a new toast', () => {
    toast.info('Saved');
    toast.error('Saved');

    expect(useToastStore.getState().toasts).toHaveLength(2);
  });
});

describe('Toast announcement role (#409)', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('interrupts for errors only', () => {
    render(
      <Toast
        toast={{ id: '1', type: 'error', message: 'Boom', duration: 10_000 }}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });

  it.each(['success', 'info', 'warning'] as const)('announces %s politely', (type) => {
    render(<ToastProvider>{null}</ToastProvider>);
    // The region has to be in the tree BEFORE the text lands, or a polite
    // announcement is never made — so it must not be the card itself.
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    act(() => void toast[type]('Fine', { duration: 10_000 }));

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Fine');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the polite region alone for an error', () => {
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => void toast.error('Boom', { duration: 10_000 }));

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('pauses auto-dismiss while a finger is down', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      render(
        <Toast
          toast={{ id: '1', type: 'info', message: 'Hold me', duration: 1_000 }}
          onDismiss={onDismiss}
        />
      );
      const card = screen.getByLabelText('Dismiss notification').closest('div')!;

      fireEvent.touchStart(card);
      act(() => void vi.advanceTimersByTime(5_000));
      expect(onDismiss).not.toHaveBeenCalled();

      fireEvent.touchEnd(card);
      act(() => void vi.advanceTimersByTime(1_200));
      expect(onDismiss).toHaveBeenCalledWith('1');
    } finally {
      vi.useRealTimers();
    }
  });
});
