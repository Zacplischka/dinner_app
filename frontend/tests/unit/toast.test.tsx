// Toast stack behaviour (#409): a flapping connection with four friends used to
// bury the Submit button under an unbounded stack of identical toasts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast from '../../src/components/Toast/Toast';
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
  it('interrupts for errors only', () => {
    render(
      <Toast
        toast={{ id: '1', type: 'error', message: 'Boom', duration: 10_000 }}
        onDismiss={vi.fn()}
      />
    );
    const card = screen.getByRole('alert');
    expect(card).toHaveAttribute('aria-live', 'assertive');
  });

  it.each(['success', 'info', 'warning'] as const)('announces %s politely', (type) => {
    render(
      <Toast toast={{ id: '1', type, message: 'Fine', duration: 10_000 }} onDismiss={vi.fn()} />
    );
    const card = screen.getByRole('status');
    expect(card).toHaveAttribute('aria-live', 'polite');
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
      const card = screen.getByRole('status');

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
