import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import NavigationHeader from '../../src/components/NavigationHeader';
import { useSessionStore } from '../../src/stores/sessionStore';

/**
 * NavigationHeader mobile-safety specs (#78)
 *
 * The focused-flow header must keep a stable back target, a centred title,
 * and push session metadata (code, progress, connection) into a clearly
 * separated secondary region instead of competing for the title row.
 */
describe('NavigationHeader', () => {
  beforeEach(() => {
    useSessionStore.setState({ isConnected: true });
  });

  it('keeps a stable 44px back target that does not shrink for long titles', () => {
    const { rerender } = render(<NavigationHeader title="Join Session" showBackButton />);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.className).toContain('min-h-[44px]');
    expect(back.className).toContain('min-w-[44px]');
    expect(back.className).toContain('shrink-0');

    rerender(
      <NavigationHeader
        title="An extremely long session title that would previously push edge actions away"
        showBackButton
      />
    );
    const backAfter = screen.getByRole('button', { name: 'Back' });
    expect(backAfter.className).toBe(back.className);
  });

  it('centres the title between equal-width edge regions and truncates overflow', () => {
    render(<NavigationHeader title="Join Session" showBackButton />);
    const title = screen.getByRole('heading', { name: 'Join Session' });
    expect(title.className).toContain('truncate');

    const centerCell = title.parentElement;
    const row = centerCell?.parentElement;
    expect(row).toBeTruthy();
    const [leftCell, , rightCell] = Array.from(row!.children);
    // Equal-basis edge cells keep the title optically centred regardless of content.
    expect(leftCell.className).toContain('flex-1');
    expect(leftCell.className).toContain('basis-0');
    expect(rightCell.className).toContain('flex-1');
    expect(rightCell.className).toContain('basis-0');
  });

  it('shows no unrelated navigation actions on focused flows', () => {
    render(<NavigationHeader title="Join Session" showBackButton />);
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('places session code, progress and subtitle in a separated secondary region', () => {
    render(
      <NavigationHeader
        title="Choose Restaurants"
        subtitle="Swipe to vote"
        sessionCode="7K9M2"
        progress={{ current: 3, total: 20 }}
        showBackButton
      />
    );

    const secondary = screen.getByTestId('nav-header-secondary');
    expect(secondary).toHaveTextContent('7K9M2');
    expect(secondary).toHaveTextContent('Swipe to vote');
    expect(secondary).toHaveTextContent('3/20');

    // Title row itself only carries the title text.
    const title = screen.getByRole('heading', { name: 'Choose Restaurants' });
    const titleRow = title.parentElement!.parentElement!;
    expect(titleRow).not.toHaveTextContent('7K9M2');
    expect(titleRow).not.toHaveTextContent('3/20');
  });

  it('omits the secondary region when there is no secondary content', () => {
    render(<NavigationHeader title="Join Session" showBackButton />);
    expect(screen.queryByTestId('nav-header-secondary')).toBeNull();
  });

  it('expresses connection state with readable text, not a bare dot', () => {
    useSessionStore.setState({ isConnected: true });
    const { rerender } = render(<NavigationHeader title="Lobby" showConnectionStatus />);
    expect(screen.getByText('Connected')).toBeInTheDocument();

    useSessionStore.setState({ isConnected: false });
    rerender(<NavigationHeader title="Lobby" showConnectionStatus />);
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  it('renders the session code badge without decorative glow', () => {
    render(<NavigationHeader title="Lobby" sessionCode="7K9M2" />);
    const code = screen.getByText('7K9M2');
    const badge = code.closest('span')!.parentElement as HTMLElement;
    expect(badge.className).not.toContain('shadow-glow-cyan');
  });

  it('keeps page-specific actions in the title row right edge', () => {
    render(
      <NavigationHeader
        title="Match"
        showBackButton
        rightAction={<button aria-label="Share results">share</button>}
      />
    );
    const share = screen.getByRole('button', { name: 'Share results' });
    const title = screen.getByRole('heading', { name: 'Match' });
    const titleRow = title.parentElement!.parentElement!;
    expect(titleRow.contains(share)).toBe(true);
  });
});
