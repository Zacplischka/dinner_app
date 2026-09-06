// The one cents -> AUD-string format, shared by every price render site
// (Comparison View, Group Order, Results, Shopping List).
export function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(priceCents / 100);
}

/**
 * A Places price band, 0-4, as every Restaurant surface draws it (#85): 0 is a
 * genuinely free place, not an unknown one, so it gets a word rather than an
 * empty run of '$'. Unknown is absent from the data, and the caller draws
 * nothing at all for it.
 */
export const formatPriceLevel = (level: number): string =>
  level === 0 ? 'Free' : '$'.repeat(level);

/** A run of '$' needs saying in words; 'Free' already says itself. */
export const priceLevelLabel = (level: number): string | undefined =>
  level === 0 ? undefined : `Price level ${level} of 4`;

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
