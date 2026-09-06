// The "Current location / Suburb or postcode" selector shared by Create
// Session and Venue discovery: a labelled group of two pressed-state buttons.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LocationModeToggle from '../../src/components/LocationModeToggle';

describe('LocationModeToggle', () => {
  it('offers both ways to set a location inside a group named for screen readers', () => {
    render(<LocationModeToggle mode="current" onSelect={vi.fn()} ariaLabel="Location method" />);

    const group = screen.getByRole('group', { name: 'Location method' });
    expect(group).toContainElement(screen.getByRole('button', { name: 'Current location' }));
    expect(group).toContainElement(screen.getByRole('button', { name: 'Suburb or postcode' }));
  });

  it.each([
    ['current', 'Current location', 'Suburb or postcode'],
    ['manual', 'Suburb or postcode', 'Current location'],
  ] as const)('shows %s as the pressed option', (mode, pressed, other) => {
    render(<LocationModeToggle mode={mode} onSelect={vi.fn()} ariaLabel="Location method" />);

    expect(screen.getByRole('button', { name: pressed })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: other })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the tapped option and leaves the choice to its owner', () => {
    const onSelect = vi.fn();
    render(<LocationModeToggle mode="current" onSelect={onSelect} ariaLabel="Location method" />);

    fireEvent.click(screen.getByRole('button', { name: 'Suburb or postcode' }));
    expect(onSelect).toHaveBeenCalledWith('manual');

    fireEvent.click(screen.getByRole('button', { name: 'Current location' }));
    expect(onSelect).toHaveBeenCalledWith('current');
    // Controlled: nothing moves until the owner changes `mode`.
    expect(screen.getByRole('button', { name: 'Current location' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('takes no taps while disabled', () => {
    const onSelect = vi.fn();
    render(
      <LocationModeToggle mode="current" onSelect={onSelect} disabled ariaLabel="Location method" />
    );

    for (const name of ['Current location', 'Suburb or postcode']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});
