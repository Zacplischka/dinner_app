import { useCallback } from 'react';
import type { SnapshotPayload } from '@dinder/shared/types';
import AnimatedScene from './AnimatedScene';
import { drawPricePatrol } from './pricePatrolScene';

export default function PricePatrol({ storefronts }: { storefronts: Partial<SnapshotPayload> }) {
  const uberEats = storefronts.ubereats?.status;
  const doorDash = storefronts.doordash?.status;
  const status =
    !uberEats && !doorDash
      ? 'Checking Uber Eats and DoorDash…'
      : !uberEats
        ? 'Still checking Uber Eats…'
        : !doorDash
          ? 'Still checking DoorDash…'
          : 'Putting your comparison together…';

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, elapsed: number) =>
      drawPricePatrol(ctx, width, elapsed, uberEats, doorDash),
    [uberEats, doorDash]
  );

  return (
    <section
      aria-label="Fetching delivery prices"
      className="relative overflow-hidden rounded-2xl border border-line/30 bg-raised px-3 pb-6 pt-3 shadow-card sm:px-5"
    >
      <div className="relative mx-auto h-[245px] max-w-[600px]">
        <AnimatedScene draw={draw} height={245} label="Price Patrol animation" />
        <span
          aria-hidden="true"
          className="absolute left-[19%] top-[77px] -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-tight text-lime sm:text-sm"
        >
          Uber Eats
        </span>
        <span
          aria-hidden="true"
          className="absolute left-[81%] top-[77px] -translate-x-1/2 whitespace-nowrap text-xs font-semibold tracking-tight text-coral-strong sm:text-sm"
        >
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
