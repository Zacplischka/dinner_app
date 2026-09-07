import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useLoadingAnnouncement } from './Spinner';

interface AnimatedSceneProps {
  draw: (context: CanvasRenderingContext2D, width: number, elapsed: number) => void;
  height: number;
  label: string;
  loadingLabel?: string;
  /** Seconds until a short reveal holds its final frame. Omit for a waiting loop. */
  duration?: number;
}

export default function AnimatedScene({
  draw,
  height,
  label,
  loadingLabel = '',
  duration,
}: AnimatedSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const playing = !paused && !reducedMotion;
  useLoadingAnnouncement(loadingLabel);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let previousTime: number | undefined;
    let context: CanvasRenderingContext2D | null = null;
    let width = 0;
    const paint = () => {
      if (context) draw(context, width, reducedMotion ? (duration ?? 0) : elapsed.current);
    };
    const resize = () => {
      width = canvas.clientWidth;
      if (!width) return;
      context = canvas.getContext('2d');
      if (!context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    };
    const schedule = () => {
      if (playing && !document.hidden && elapsed.current < (duration ?? Infinity)) {
        frame = requestAnimationFrame(tick);
      }
    };
    const tick = (time: number) => {
      if (previousTime !== undefined) {
        elapsed.current = Math.min(
          elapsed.current + Math.min((time - previousTime) / 1000, 0.06),
          duration ?? Infinity
        );
      }
      previousTime = time;
      paint();
      schedule();
    };
    const visibilityChanged = () => {
      cancelAnimationFrame(frame);
      previousTime = undefined;
      schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    schedule();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [draw, height, duration, playing, reducedMotion]);

  return (
    <div role="group" aria-label={label} className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
      {!reducedMotion && duration === undefined && (
        <button
          type="button"
          aria-label={paused ? 'Play animation' : 'Pause animation'}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
          className="absolute bottom-0 right-0 z-10 min-h-[44px] rounded-full border border-line/40 bg-ink px-3 text-xs text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      )}
    </div>
  );
}
