// The DoorDash Storefront Resolver: everything this Platform's actor requires
// and everything its answers must survive to count as this Venue's Storefront.
import type { MenuItemCapture } from '@dinder/shared/types';
import type { StorefrontResolver } from './ComparisonService.js';
import {
  deliveryAreaAddress,
  distanceMeters,
  emptyCapture,
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
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Record<string, unknown>;
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
      const menu: MenuItemCapture[] = [];
      for (const itemValue of actorMenu.items) {
        if (!itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) continue;
        const item = itemValue as Record<string, unknown>;
        const itemName = string(item.name);
        const price = doorDashPriceCents(item.price);
        if (!itemName || price === undefined) continue;
        const section = string(item.category);
        menu.push({
          name: itemName,
          price_cents: price,
          ...(section ? { section } : {}),
          tags: [],
        });
      }

      return { status: 'resolved', storeUrl, deals: [], menu };
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
  const match = /^(?:\d+\s+for\s+)?A\$(\d+)\.(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number(match[2]);
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
