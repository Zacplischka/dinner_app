import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Spinner, { LoadingAnnouncer } from '../../src/components/Spinner';

/** The app's shape: the region above the router, a spinner that comes and goes. */
function Shell({ label }: { label?: string }) {
  return (
    <>
      <LoadingAnnouncer />
      {label && <Spinner label={label} />}
    </>
  );
}

describe('Spinner', () => {
  it('is decoration, so it never announces itself', () => {
    const { container } = render(<Spinner label="Loading..." />);

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves a button the name its own text gives it', () => {
    render(
      <button type="button">
        <Spinner size="sm" label="Leaving..." /> Leaving...
      </button>
    );

    expect(screen.getByRole('button')).toHaveAccessibleName('Leaving...');
  });

  it('announces into a region that was already in the DOM, empty', () => {
    const { rerender } = render(<Shell />);

    // The point of the whole arrangement: a live region inserted with its text
    // already in it is not reliably announced, so this node must pre-exist and
    // survive the wait it is reporting.
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');

    rerender(<Shell label="Loading session..." />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('Loading session...');

    rerender(<Shell />);
    expect(region.textContent).toBe('');
  });

  it('says nothing for an unlabelled spinner', () => {
    const { rerender } = render(<Shell />);

    rerender(
      <>
        <LoadingAnnouncer />
        <Spinner />
      </>
    );

    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('inherits the call site colour and keeps the caller class', () => {
    const { container } = render(<Spinner size="xl" className="text-cyan" />);

    const spinner = container.firstElementChild as HTMLElement;
    expect(spinner.className).toContain('border-current');
    expect(spinner.className).toContain('animate-spin');
    expect(spinner.className).toContain('h-10 w-10');
    expect(spinner.className).toContain('text-cyan');
  });
});
