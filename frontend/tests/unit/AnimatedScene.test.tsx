import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnimatedScene from '../../src/components/AnimatedScene';
import { LoadingAnnouncer } from '../../src/components/Spinner';

describe('AnimatedScene motion lifecycle', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let resize: ResizeObserverCallback;
  let disconnect: ReturnType<typeof vi.fn>;
  const advance = (time: number) =>
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(time));
    });
  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.set(++nextFrame, cb);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    disconnect = vi.fn();
    vi.spyOn(window, 'ResizeObserver').mockImplementation(function (callback) {
      resize = callback;
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect };
    });
  });

  it('pauses motion without losing data redraws; stops hidden and cleans up on unmount', () => {
    const draw = vi.fn();
    const view = render(
      <>
        <LoadingAnnouncer />
        <AnimatedScene draw={draw} height={120} label="Cat" loadingLabel="Fetching menu…" />
      </>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Fetching menu…');
    advance(0);
    advance(50);
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 320, 0.05);
    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
    expect(frames.size).toBe(0);
    const updated = vi.fn();
    view.rerender(
      <>
        <LoadingAnnouncer />
        <AnimatedScene
          draw={updated}
          height={120}
          label="Cat"
          loadingLabel="Waiting for one menu…"
        />
      </>
    );
    expect(updated).toHaveBeenLastCalledWith(expect.anything(), 320, 0.05);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for one menu…');
    act(() => resize([], {} as ResizeObserver));
    expect(updated).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Play animation' }));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(frames.size).toBe(1);
    advance(10000);
    expect(updated).toHaveBeenLastCalledWith(expect.anything(), 320, 0.05);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });

  it('finishes a reveal once and renders its final pose immediately with reduced motion', () => {
    const draw = vi.fn();
    const view = render(<AnimatedScene draw={draw} height={120} label="Reveal" duration={0.1} />);
    advance(0);
    advance(60);
    advance(120);
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 320, 0.1);
    expect(frames.size).toBe(0);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.unmount();
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    render(<AnimatedScene draw={draw} height={120} label="Reveal" duration={3} />);
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 320, 3);
    expect(frames.size).toBe(0);
  });
});
