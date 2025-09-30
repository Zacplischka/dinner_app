// Static hardcoded dinner options list (FR-018)
// Based on: specs/001-dinner-decider-enables/data-model.md

export interface DinnerOption {
  optionId: string;
  displayName: string;
  description?: string;
}

export const DINNER_OPTIONS: DinnerOption[] = [
  {
    optionId: 'pizza-palace',
    displayName: 'Pizza Palace',
    description: 'Italian cuisine, delivery available',
  },
  {
    optionId: 'sushi-spot',
    displayName: 'Sushi Spot',
    description: 'Japanese cuisine, dine-in and takeout',
  },
  {
    optionId: 'thai-kitchen',
    displayName: 'Thai Kitchen',
    description: 'Authentic Thai cuisine',
  },
  {
    optionId: 'mexican-grill',
    displayName: 'Mexican Grill',
    description: 'Tex-Mex favorites and margaritas',
  },
  {
    optionId: 'indian-curry',
    displayName: 'Indian Curry House',
    description: 'Traditional Indian curries and naan',
  },
  {
    optionId: 'burger-joint',
    displayName: 'Burger Joint',
    description: 'Classic American burgers and fries',
  },
  {
    optionId: 'chinese-garden',
    displayName: 'Chinese Garden',
    description: 'Cantonese and Szechuan dishes',
  },
  {
    optionId: 'steakhouse',
    displayName: 'The Steakhouse',
    description: 'Premium cuts and wine selection',
  },
  {
    optionId: 'vegan-cafe',
    displayName: 'Vegan Cafe',
    description: 'Plant-based meals and smoothies',
  },
  {
    optionId: 'ramen-bar',
    displayName: 'Ramen Bar',
    description: 'Authentic Japanese ramen bowls',
  },
  {
    optionId: 'greek-taverna',
    displayName: 'Greek Taverna',
    description: 'Mediterranean classics and mezze',
  },
  {
    optionId: 'bbq-shack',
    displayName: 'BBQ Shack',
    description: 'Smoked meats and southern sides',
  },
  {
    optionId: 'seafood-market',
    displayName: 'Seafood Market',
    description: 'Fresh catch and oyster bar',
  },
  {
    optionId: 'french-bistro',
    displayName: 'French Bistro',
    description: 'Classic French cuisine',
  },
  {
    optionId: 'korean-bbq',
    displayName: 'Korean BBQ',
    description: 'Table-top grilling experience',
  },
];

// Validation: Check for duplicate optionIds at startup
export function validateDinnerOptions(): void {
  const optionIds = DINNER_OPTIONS.map((opt) => opt.optionId);
  const uniqueIds = new Set(optionIds);

  if (optionIds.length !== uniqueIds.size) {
    const duplicates = optionIds.filter((id, index) => optionIds.indexOf(id) !== index);
    throw new Error(
      `Duplicate optionIds detected in DINNER_OPTIONS: ${duplicates.join(', ')}`
    );
  }
}

// Get option by ID
export function getDinnerOptionById(optionId: string): DinnerOption | undefined {
  return DINNER_OPTIONS.find((opt) => opt.optionId === optionId);
}

// Validate that all optionIds exist
export function validateOptionIds(optionIds: string[]): boolean {
  return optionIds.every((id) => DINNER_OPTIONS.some((opt) => opt.optionId === id));
}