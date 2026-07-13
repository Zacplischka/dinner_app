import type {
  Comparison,
  MatchedItem,
  MenuItemCapture,
  Snapshot,
} from '@dinder/shared/types';

export function deriveComparison(snapshot: Snapshot): Comparison {
  const uberEatsMenu = snapshot.payload.ubereats?.status === 'resolved'
    ? snapshot.payload.ubereats.menu
    : [];
  const doorDashMenu = snapshot.payload.doordash?.status === 'resolved'
    ? snapshot.payload.doordash.menu
    : [];
  const matchedDoorDashIndexes = new Set<number>();
  const matchedItems: MatchedItem[] = [];
  const unmatchedUberEats: MenuItemCapture[] = [];

  for (const uberEatsItem of uberEatsMenu) {
    const normalizedName = normalizeComparisonName(uberEatsItem.name);
    const doorDashIndex = doorDashMenu.findIndex(
      (item, index) => !matchedDoorDashIndexes.has(index)
        && normalizeComparisonName(item.name) === normalizedName
    );
    if (doorDashIndex < 0) {
      unmatchedUberEats.push(uberEatsItem);
      continue;
    }

    matchedDoorDashIndexes.add(doorDashIndex);
    matchedItems.push({
      name: uberEatsItem.name,
      ubereats: uberEatsItem,
      doordash: doorDashMenu[doorDashIndex],
    });
  }

  return {
    placeId: snapshot.placeId,
    venueName: snapshot.venueName,
    fetchedAt: snapshot.fetchedAt,
    storefronts: snapshot.payload,
    matchedItems,
    unmatched: {
      ubereats: unmatchedUberEats,
      doordash: doorDashMenu.filter((_item, index) => !matchedDoorDashIndexes.has(index)),
    },
    ...cheaperMenu(matchedItems),
  };
}

export function normalizeComparisonName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cheaperMenu(matchedItems: MatchedItem[]): Pick<Comparison, 'cheaperMenu'> {
  if (matchedItems.length < 3) return {};

  const differences = matchedItems.map(({ ubereats, doordash }) => {
    if (ubereats.price_cents === doordash.price_cents) return 0;
    const higherPrice = Math.max(ubereats.price_cents, doordash.price_cents);
    const percent = Math.abs(ubereats.price_cents - doordash.price_cents) / higherPrice * 100;
    return ubereats.price_cents < doordash.price_cents ? percent : -percent;
  }).sort((left, right) => left - right);
  const middle = Math.floor(differences.length / 2);
  const median = differences.length % 2
    ? differences[middle]
    : (differences[middle - 1] + differences[middle]) / 2;
  const percent = Math.round(Math.abs(median));
  if (percent === 0) return {};

  return {
    cheaperMenu: {
      platform: median > 0 ? 'ubereats' : 'doordash',
      percent,
    },
  };
}
