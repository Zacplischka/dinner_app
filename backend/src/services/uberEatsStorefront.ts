// The Uber Eats Storefront Resolver: everything this Platform's actor requires
// and everything its answers must survive to count as this Venue's Storefront.
import type { MenuItemCapture } from '@dinder/shared/types';
import type { StorefrontResolver } from './ComparisonService.js';
import {
  deliveryAreaAddress,
  distanceMeters,
  emptyCapture,
  httpsUrl,
  nameMatches,
  number,
  record,
  string,
} from './storefrontResolution.js';

export const uberEatsStorefront: StorefrontResolver = {
  defaultActorId: 'borderline/uber-eats-scraper-ppr',

  urlInput(storedUrl) {
    return { urls: [storedUrl], locale: 'en-AU', getMenuCustomizations: false };
  },

  searchInput(venue) {
    return {
      address: deliveryAreaAddress(venue.address),
      addressCountry: 'AU',
      query: venue.name,
      storeType: 'RESTAURANTS',
      maxRows: 5,
      locale: 'en-AU',
      getMenuCustomizations: false,
    };
  },

  resolve(output, venue) {
    for (const value of output) {
      const candidate = record(value);
      if (string(candidate.error)) continue;
      const title = string(candidate.title);
      const url = string(candidate.url);
      const storeUrl = url ? normalizeUberEatsUrl(url) : undefined;
      const currencyCode = string(candidate.currencyCode);
      const location = record(candidate.location);
      const latitude = number(location.latitude);
      const longitude = number(location.longitude);
      if (
        !title ||
        !storeUrl ||
        !currencyCode ||
        latitude === undefined ||
        longitude === undefined
      ) {
        throw new Error('Uber Eats returned malformed Storefront details');
      }
      if (!nameMatches(venue.name, title) || distanceMeters(venue, { latitude, longitude }) > 100) {
        continue;
      }
      if (currencyCode !== 'AUD' || !Array.isArray(candidate.menu)) {
        throw new Error('Uber Eats returned an invalid Australian menu');
      }

      const deals: string[] = [];
      const menuById = new Map<string, MenuItemCapture>();
      for (const sectionValue of candidate.menu) {
        const section = record(sectionValue);
        const sectionName = string(section.catalogName);
        if (!Array.isArray(section.catalogItems)) continue;
        for (const itemValue of section.catalogItems) {
          const item = record(itemValue);
          const id = string(item.uuid);
          const name = string(item.title);
          const price = number(item.price);
          if (!id || !name || price === undefined || !Number.isSafeInteger(price) || price < 0)
            continue;

          const actorTags = Array.isArray(item.tags)
            ? item.tags.filter(
                (tag): tag is string => typeof tag === 'string' && Boolean(tag.trim())
              )
            : [];
          const promo = string(item.promo);
          const tags = unique([...actorTags, ...(promo ? [promo] : [])]);
          if (promo && !deals.includes(promo)) deals.push(promo);

          const existing = menuById.get(id);
          if (!existing) {
            menuById.set(id, {
              name,
              price_cents: price,
              ...(sectionName ? { section: sectionName } : {}),
              tags,
            });
            continue;
          }

          existing.tags = unique([...existing.tags, ...tags]);
          if (promotionalSection(existing.section) && !promotionalSection(sectionName)) {
            existing.section = sectionName;
          }
        }
      }

      const imageUrl = httpsUrl(candidate.heroImageUrl);
      return {
        status: 'resolved',
        storeUrl,
        ...(imageUrl ? { imageUrl } : {}),
        deals,
        menu: [...menuById.values()],
      };
    }

    return emptyCapture('not_found');
  },
};

function normalizeUberEatsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return undefined;
    if (url.hostname !== 'www.ubereats.com' && url.hostname !== 'ubereats.com') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function promotionalSection(section?: string): boolean {
  return section === 'Featured items' || section === 'Offers';
}
