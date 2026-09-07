import type { ShoppingList } from '@dinder/shared/types';

/** Pricing can fail without taking the useful Recipe away with it. */
export default function RecipePricingStatus({ status }: { status: ShoppingList['pricingStatus'] }) {
  if (!status) return null;
  return (
    <div
      role="status"
      className="mb-6 rounded-xl border border-amber/30 bg-amber/10 p-4 text-sm text-text"
    >
      <p className="font-bold">
        {status === 'pending' ? 'Prices are still loading' : 'Prices are unavailable'}
      </p>
      <p className="mt-1 text-muted">
        {status === 'pending'
          ? 'Your ingredients and method are ready. You can start cooking while we check Woolworths.'
          : 'Your ingredients and method are still here. Use the ingredient links to check Woolworths prices directly.'}
      </p>
    </div>
  );
}
