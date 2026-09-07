import { useEffect, useRef, useState } from 'react';
import type { SnapshotPayload } from '@dinder/shared/types';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { drawPricePatrol } from './pricePatrolScene';

export default function PricePatrol({ storefronts }: { storefronts: Partial<SnapshotPayload> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const uberEats = storefronts.ubereats?.status;
  const doorDash = storefronts.doordash?.status;
  const playing = !paused && !reducedMotion;
  const status =
    !uberEats && !doorDash
      ? 'Checking Uber Eats and DoorDash…'
      : !uberEats
        ? 'Still checking Uber Eats…'
        : !doorDash
          ? 'Still checking DoorDash…'
          : 'Putting your comparison together…';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let previousTime = 0;
    let context: CanvasRenderingContext2D | null = null;
    let width = 0;

    const draw = () => {
      if (context) drawPricePatrol(context, width, elapsed.current, uberEats, doorDash);
    };
    const resize = () => {
      width = canvas.clientWidth;
      if (!width) return;
      context = canvas.getContext('2d');
      if (!context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = 245 * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const tick = (time: number) => {
      if (previousTime && !document.hidden) {
        elapsed.current += Math.min((time - previousTime) / 1000, 0.06);
      }
      previousTime = time;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (playing) frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [uberEats, doorDash, playing]);

  return (
    <section
      aria-label="Fetching delivery prices"
      className="relative overflow-hidden rounded-2xl border border-line/30 bg-raised px-3 pb-6 pt-3 shadow-card sm:px-5"
    >
      {!reducedMotion && (
        <button
          type="button"
          aria-label={paused ? 'Play animation' : 'Pause animation'}
          aria-pressed={paused}
          onClick={() => setPaused((current) => !current)}
          className="absolute right-3 top-3 z-10 min-h-[44px] rounded-full border border-line/40 bg-ink px-3 text-xs text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      )}
      <div className="relative mx-auto h-[245px] max-w-[600px]" aria-hidden="true">
        <canvas ref={canvasRef} className="block h-[245px] w-full" />
        <span className="absolute left-[19%] top-[77px] -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-tight text-[#9df3bd] sm:text-sm">
          Uber Eats
        </span>
        <span className="absolute left-[81%] top-[77px] -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-tight text-[#ffa89b] sm:text-sm">
          DoorDash
        </span>
      </div>
      <h2 className="mt-1 text-center font-display text-2xl font-semibold tracking-tight">
        On the prowl for prices.
      </h2>
      <p role="status" className="mt-2 text-center text-sm text-muted">
        {status}
      </p>
    </section>
  );
}
