// Lifted verbatim from ComparisonViewPage.tsx — the Group Order menu is the
// third render site for the same cents -> AUD-string format.
export function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(priceCents / 100);
}
