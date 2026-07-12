import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorBoundary from '../../src/components/ErrorBoundary';

function Bomb(): React.ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders the fallback UI instead of a white screen when a child throws', () => {
    // React logs caught render errors; keep test output clean
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });
});
