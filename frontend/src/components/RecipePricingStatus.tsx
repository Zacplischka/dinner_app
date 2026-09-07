import type { ShoppingList } from '@dinder/shared/types';
import AnimatedScene from './AnimatedScene';
import { useLoadingAnnouncement } from './Spinner';
import { drawGroceryRun } from './groceryMenuScene';

/** Pricing can fail without taking the useful Recipe away with it. */
export default function RecipePricingStatus({
  status,
  compact = false,
}: {
  status: ShoppingList['pricingStatus'];
  compact?: boolean;
}) {
  useLoadingAnnouncement(
    status === 'pending'
      ? 'Checking Woolworths prices. Your ingredients and method are ready.'
      : status === 'failed'
        ? 'Prices are unavailable. Your ingredients and method are still here.'
        : ''
  );
  if (!status) return null;
  if (status === 'pending') {
    const height = compact ? 96 : 120;
    return (
      <section className="mb-6 rounded-xl border border-line/30 bg-raised p-4 text-sm text-text">
        <AnimatedScene
          draw={(ctx, width, elapsed) => drawGroceryRun(ctx, width, elapsed, height)}
          height={height}
          label="Grocery run"
        />
        <p className="font-bold">Checking Woolworths prices…</p>
        <p className="mt-1 text-muted">
          Your ingredients and method are ready. You can start cooking while we check Woolworths.
        </p>
      </section>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-text">
      <p className="font-bold">Prices are unavailable</p>
      <p className="mt-1 text-muted">
        Your ingredients and method are still here. Use the ingredient links to check Woolworths
        prices directly.
      </p>
    </div>
  );
}
