// useFocusTrap, driven through the real leave confirmation and Recipe details:
// Tab and Shift+Tab wrap within the dialog, Tab stays put while every button is
// disabled, and the element that had focus before the dialog opened gets it
// back when the dialog closes.
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmLeaveModal from '../../src/components/ConfirmLeaveModal';
import DeckEntryDetails from '../../src/components/DeckEntryDetails';
import { useFocusTrap } from '../../src/hooks/useFocusTrap';

describe('useFocusTrap', () => {
  it('wraps Tab inside the dialog and hands focus back to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<ConfirmLeaveModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close' });
    const leave = screen.getByRole('button', { name: 'Leave session' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stay in session' }));

    leave.focus();
    fireEvent.keyDown(leave, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(leave);

    rerender(<ConfirmLeaveModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('includes the native method summary when cycling inside Owned Recipe details', () => {
    function RecipeDetails() {
      const dialogRef = useRef<HTMLDivElement>(null);
      useFocusTrap(dialogRef, true);
      return (
        <DeckEntryDetails
          dialogRef={dialogRef}
          onClose={vi.fn()}
          entry={{
            kind: 'recipe',
            placeId: 'owned:penne',
            name: 'Penne',
            details: { ingredients: ['500 g penne'], steps: ['Boil the penne.'] },
          }}
        />
      );
    }

    render(<RecipeDetails />);
    const close = screen.getByRole('button', { name: 'Close' });
    const summary = screen.getByText('Preview the method');
    expect(document.activeElement).toBe(close);
    // jsdom doesn't advance native Tab focus; check that the trap lets it
    // advance, then exercise the two boundary wraps it owns directly.
    expect(fireEvent.keyDown(close, { key: 'Tab' })).toBe(true);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  // A dialog that closes because another is taking over (#424) commits both in
  // one pass, and the newcomer's autoFocus runs first: the restore must not
  // drag focus back out of it.
  it('leaves focus where it is when another dialog claimed it during the close', () => {
    const opener = document.createElement('button');
    const takeover = document.createElement('button');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.append(takeover);
    document.body.append(opener, dialog);
    opener.focus();

    const { rerender } = render(<ConfirmLeaveModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    takeover.focus();
    rerender(<ConfirmLeaveModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(document.activeElement).toBe(takeover);
    opener.remove();
    dialog.remove();
  });

  it('restores focus when a backdrop click focused the page wrapper', () => {
    const opener = document.createElement('button');
    const page = document.createElement('div');
    page.tabIndex = -1;
    document.body.append(opener, page);
    opener.focus();
    const { rerender } = render(<ConfirmLeaveModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    page.focus();
    rerender(<ConfirmLeaveModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
    page.remove();
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
