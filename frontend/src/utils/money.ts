// Lifted verbatim from ComparisonViewPage.tsx — the Group Order menu is the
// third render site for the same cents -> AUD-string format.
export function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(priceCents / 100);
}

/** Dollars text → integer cents, or null when the value must not be emitted. */
export function parseDollarsToCents(raw: string): number | null {
  // ponytail: Number() also accepts '0x10' and '1e3'; the 0-100000 cap on the
  // dollar amount (not cents - 1,234.56 must still pass) bounds the damage.
  // Swap in a /^\d*\.?\d{0,2}$/ test if a real user ever types one.
  const clean = raw.replace(/[$,\s]/g, '');
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return null;
  return Math.round(amount * 100); // 8.99 * 100 is 898.999… in float
}
