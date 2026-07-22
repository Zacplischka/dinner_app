// The DoorDash Storefront Resolver: everything this Platform's actor requires
// and everything its answers must survive to count as this Venue's Storefront.
import type { MenuItemCapture } from '@dinder/shared/types';
import type { StorefrontResolver } from './ComparisonService.js';
import {
  deliveryAreaAddress,
  distanceMeters,
  emptyCapture,
  httpsUrl,
  isRecord,
  nameMatches,
  number,
  record,
  string,
} from './storefrontResolution.js';

export const doorDashStorefront: StorefrontResolver = {
  defaultActorId: 'abotapi/doordash-scraper',

  urlInput(storedUrl) {
    return doorDashInput({ mode: 'url', urls: [storedUrl] });
  },

  searchInput(venue) {
    return doorDashInput({
      mode: 'search',
      search: [venue.name],
      location: deliveryAreaAddress(venue.address),
      storeType: 'restaurant',
      maxPages: 1,
    });
  },

  resolve(output, venue) {
    for (const value of output) {
      if (!isRecord(value)) continue;
      const candidate = value;
      const name = string(candidate.name);
      const url = string(candidate.url);
      const currency = string(candidate.currency);
      const latitude = number(candidate.latitude);
      const longitude = number(candidate.longitude);
      if (!name || !url || !currency || latitude === undefined || longitude === undefined) {
        continue;
      }

      const storeUrl = normalizeDoorDashUrl(url);
      if (!storeUrl || currency !== 'AUD') continue;
      if (!nameMatches(venue.name, name)) continue;
      if (distanceMeters(venue, { latitude, longitude }) > 100) continue;
      const actorMenu = record(candidate.menu);
      if (!Array.isArray(actorMenu.items)) throw new Error('DoorDash returned an invalid menu');
      const menuById = new Map<string, MenuItemCapture>();
      for (const itemValue of actorMenu.items) {
        if (!isRecord(itemValue)) continue;
        const item = itemValue;
        const itemName = string(item.name);
        const price = doorDashPriceCents(item.price);
        if (!itemName || price === undefined) continue;
        const section = string(item.category);
        // ponytail: fall back to name+price when the actor omits an id, rather than dropping a
        // priced row the way the Uber Eats block does.
        const id = string(item.id) ?? `${itemName} ${price}`;

        const existing = menuById.get(id);
        if (!existing) {
          menuById.set(id, {
            name: itemName,
            price_cents: price,
            ...(section ? { section } : {}),
            tags: [],
          });
          continue;
        }
        if (existing.section === 'Most Ordered' && section && section !== 'Most Ordered') {
          existing.section = section;
        }
      }

      // The actor leaves some cover variants null per store; take the first present.
      const imageUrl =
        httpsUrl(candidate.coverImageUrl) ??
        httpsUrl(candidate.businessHeaderImageUrl) ??
        httpsUrl(candidate.coverSquareImageUrl);
      return {
        status: 'resolved',
        storeUrl,
        ...(imageUrl ? { imageUrl } : {}),
        deals: [],
        menu: [...menuById.values()],
      };
    }

    return emptyCapture('not_found');
  },
};

function doorDashInput(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    maxStores: 1,
    includeMenu: true,
    includeBusiness: false,
    includeReviews: false,
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
      apifyProxyCountry: 'AU',
    },
  };
}

function doorDashPriceCents(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(?:(\d+)\s+for\s+)?A\$(\d+)\.(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  // ponytail: a multi-buy row ("2 for A$7.00") becomes a rounded-up unit price. Ceiling: this
  // under-states a single-unit purchase by the bundle discount. Upgrade path is a real per-unit
  // price, which the actor does not expose. Dropping the row instead loses the drinks entirely.
  const cents = Math.ceil((Number(match[2]) * 100 + Number(match[3])) / (Number(match[1]) || 1));
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function normalizeDoorDashUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname !== 'www.doordash.com' && url.hostname !== 'doordash.com') return undefined;
    if (!url.pathname.startsWith('/store/')) return undefined;
    return `https://www.doordash.com${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return undefined;
  }
}
