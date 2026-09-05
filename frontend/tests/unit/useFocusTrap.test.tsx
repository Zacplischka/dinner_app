// useFocusTrap, driven through the real leave confirmation: Tab and Shift+Tab
// wrap among the dialog's own buttons, Tab stays put while every button is
// disabled, and the element that had focus before the dialog opened gets it
// back when the dialog closes.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmLeaveModal from '../../src/components/ConfirmLeaveModal';

describe('useFocusTrap', () => {
  it('wraps Tab inside the dialog and hands focus back to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<ConfirmLeaveModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close' });
    const leave = screen.getByRole('button', { name: 'Leave Session' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stay in Session' }));

    leave.focus();
    fireEvent.keyDown(leave, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(leave);

    rerender(<ConfirmLeaveModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('holds Tab while every button is disabled', () => {
    render(<ConfirmLeaveModal isOpen isLoading onClose={vi.fn()} onConfirm={vi.fn()} />);
    // jsdom has no focus-fixup; mimic the browser dropping focus to <body>
    // once the focused Stay button goes disabled.
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    // false = preventDefault ran, so the page behind the dialog never gets Tab
    expect(fireEvent.keyDown(document.body, { key: 'Tab' })).toBe(false);
  });
});
