// The pack-string whitelist parser (#241, #257): only known-good Woolworths
// pack shapes produce a number, everything else is null — the parser never
// guesses. `per 190g` parsed as a 190g pack once turned 600g of chicken thigh
// into a $62 line; variable and range packs are named so the ladder can price
// them from the unit price instead.

export type ParsedPack =
  | { kind: 'fixed'; quantity: number; family: 'mass' | 'volume' } // grams or mL
  | { kind: 'count'; units: number }
  | { kind: 'variable' } // "per 190g", "approx. 170g" — weight varies per item
  | { kind: 'range' }; // "750g - 2.2kg"

const FIXED = /^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$/i;
const MULTI = /^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$/i; // "2 x 400g"
const MULTI_PACK = /^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\s*x\s*(\d+)\s*pack$/i; // "250mL x 4 pack"
const N_PACK = /^(\d+)\s*(?:pack|pk)$/i;
const EACH = /^1?\s*(each|1ea|ea|bunch|punnet|head|bag|loaf)$/i;
const VARIABLE = /^(per|approx)/i;
// "750g - 2.2kg", "1.5-2.5kg" — the first unit is optional, the second is not.
const RANGE = /^\d+(?:\.\d+)?\s*(?:kg|g|ml|l)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l)$/i;

const TO_BASE: Record<string, number> = { kg: 1000, g: 1, l: 1000, ml: 1 };
const FAMILY: Record<string, 'mass' | 'volume'> = {
  kg: 'mass',
  g: 'mass',
  l: 'volume',
  ml: 'volume',
};

export function parsePack(packageSize: string | undefined): ParsedPack | null {
  const size = (packageSize ?? '').trim();
  if (!size) return null;
  if (RANGE.test(size)) return { kind: 'range' };
  if (VARIABLE.test(size)) return { kind: 'variable' };

  let match = FIXED.exec(size);
  if (match) {
    const unit = match[2].toLowerCase();
    return { kind: 'fixed', quantity: Number(match[1]) * TO_BASE[unit], family: FAMILY[unit] };
  }
  match = MULTI.exec(size);
  if (match) {
    const unit = match[3].toLowerCase();
    return {
      kind: 'fixed',
      quantity: Number(match[1]) * Number(match[2]) * TO_BASE[unit],
      family: FAMILY[unit],
    };
  }
  match = MULTI_PACK.exec(size);
  if (match) {
    const unit = match[2].toLowerCase();
    return {
      kind: 'fixed',
      quantity: Number(match[1]) * TO_BASE[unit] * Number(match[3]),
      family: FAMILY[unit],
    };
  }
  match = N_PACK.exec(size);
  if (match) return { kind: 'count', units: Number(match[1]) };
  if (EACH.test(size)) return { kind: 'count', units: 1 };
  return null;
}

const CUP = /\$(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)?\s*(kg|g|ml|l)/i;

/**
 * Cents per gram from a Woolworths unit-price string ("$15.50 / 1KG" → 1.55).
 * Volume denominators fold in at 1 g = 1 mL — sound for the wet goods that
 * carry them. Null when the string isn't a recognised unit price.
 */
export function cupCentsPerGram(cupString: string | undefined): number | null {
  const match = CUP.exec(cupString ?? '');
  if (!match) return null;
  const dollars = Number(match[1]);
  const per = Number(match[2] ?? '1') * TO_BASE[match[3].toLowerCase()];
  return (dollars * 100) / per;
}
