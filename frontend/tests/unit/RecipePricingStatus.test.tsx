import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingAnnouncer } from '../../src/components/Spinner';
import RecipePricingStatus from '../../src/components/RecipePricingStatus';

describe('RecipePricingStatus', () => {
  it.each([undefined, 'failed'] as const)(
    'removes the grocery run immediately when pending settles to %s',
    (status) => {
      const { rerender } = render(<RecipePricingStatus status="pending" />);
      expect(screen.getByRole('group', { name: 'Grocery run' })).toBeInTheDocument();

      rerender(<RecipePricingStatus status={status} />);

      expect(screen.queryByRole('group', { name: 'Grocery run' })).not.toBeInTheDocument();
      expect(screen.queryByText('Checking Woolworths prices…')).not.toBeInTheDocument();
      if (status === 'failed') {
        expect(screen.getByText('Prices are unavailable')).toBeInTheDocument();
        expect(screen.getByText(/ingredient links to check Woolworths/)).toBeInTheDocument();
      }
    }
  );

  it('announces pricing failure through the persistent region after the scene leaves', () => {
    const { rerender } = render(
      <>
        <LoadingAnnouncer />
        <RecipePricingStatus status="pending" />
      </>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Checking Woolworths prices.');
    rerender(
      <>
        <LoadingAnnouncer />
        <RecipePricingStatus status="failed" />
      </>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Prices are unavailable.');
    expect(screen.queryByRole('group', { name: 'Grocery run' })).not.toBeInTheDocument();
  });

  it('shows no loading scene when the list arrives already priced', () => {
    const { container } = render(<RecipePricingStatus status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
