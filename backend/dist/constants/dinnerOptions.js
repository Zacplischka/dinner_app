export const DINNER_OPTIONS = [
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
export function validateDinnerOptions() {
    const optionIds = DINNER_OPTIONS.map((opt) => opt.optionId);
    const uniqueIds = new Set(optionIds);
    if (optionIds.length !== uniqueIds.size) {
        const duplicates = optionIds.filter((id, index) => optionIds.indexOf(id) !== index);
        throw new Error(`Duplicate optionIds detected in DINNER_OPTIONS: ${duplicates.join(', ')}`);
    }
}
export function getDinnerOptionById(optionId) {
    return DINNER_OPTIONS.find((opt) => opt.optionId === optionId);
}
export function validateOptionIds(optionIds) {
    return optionIds.every((id) => DINNER_OPTIONS.some((opt) => opt.optionId === id));
}
//# sourceMappingURL=dinnerOptions.js.map