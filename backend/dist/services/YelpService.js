import { config } from '../config/index.js';
function parseAddress(fullAddress) {
    let address1 = '';
    let city = '';
    let state = '';
    const country = 'US';
    if (!fullAddress) {
        return { address1, city, state, country };
    }
    const parts = fullAddress.split(',').map(p => p.trim());
    if (parts.length >= 1) {
        address1 = parts[0];
    }
    if (parts.length >= 2) {
        city = parts[1];
    }
    if (parts.length >= 3) {
        const stateZipMatch = parts[2].match(/^([A-Z]{2})\s*\d*/);
        if (stateZipMatch) {
            state = stateZipMatch[1];
        }
        else {
            state = parts[2].split(' ')[0];
        }
    }
    return { address1, city, state, country };
}
export async function matchBusinessToYelp(name, address) {
    const apiKey = config.yelp.apiKey;
    if (!apiKey) {
        console.warn('Yelp API key not configured, skipping Yelp enrichment');
        return {};
    }
    const { address1, city, state, country } = parseAddress(address);
    if (!city) {
        console.warn(`Could not parse city from address: ${address}`);
        return {};
    }
    try {
        const matchUrl = new URL(`${config.yelp.apiUrl}/businesses/matches`);
        matchUrl.searchParams.append('name', name);
        matchUrl.searchParams.append('address1', address1);
        matchUrl.searchParams.append('city', city);
        matchUrl.searchParams.append('state', state);
        matchUrl.searchParams.append('country', country);
        const matchResponse = await fetch(matchUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        });
        if (matchResponse.ok) {
            const data = await matchResponse.json();
            if (data.businesses && data.businesses.length > 0) {
                const business = data.businesses[0];
                return {
                    yelpUrl: business.url,
                    yelpId: business.id,
                };
            }
        }
        const searchUrl = new URL(`${config.yelp.apiUrl}/businesses/search`);
        searchUrl.searchParams.append('term', name);
        searchUrl.searchParams.append('location', `${city}, ${state}`);
        searchUrl.searchParams.append('categories', 'restaurants');
        searchUrl.searchParams.append('limit', '1');
        const searchResponse = await fetch(searchUrl.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        });
        if (searchResponse.ok) {
            const data = await searchResponse.json();
            if (data.businesses && data.businesses.length > 0) {
                const business = data.businesses[0];
                const nameSimilarity = calculateNameSimilarity(name, business.name);
                if (nameSimilarity > 0.6) {
                    return {
                        yelpUrl: business.url,
                        yelpId: business.id,
                    };
                }
            }
        }
        return {};
    }
    catch (error) {
        console.error(`Error matching business "${name}" to Yelp:`, error);
        return {};
    }
}
function calculateNameSimilarity(name1, name2) {
    const normalize = (s) => s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
    const words1 = new Set(normalize(name1));
    const words2 = new Set(normalize(name2));
    if (words1.size === 0 || words2.size === 0)
        return 0;
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}
export async function enrichRestaurantsWithYelp(restaurants) {
    const results = new Map();
    if (!config.yelp.apiKey) {
        console.warn('Yelp API key not configured, skipping enrichment');
        return results;
    }
    const batchSize = 5;
    const delayBetweenBatches = 200;
    for (let i = 0; i < restaurants.length; i += batchSize) {
        const batch = restaurants.slice(i, i + batchSize);
        const batchPromises = batch.map(async (restaurant) => {
            if (!restaurant.address) {
                return { name: restaurant.name, result: {} };
            }
            const result = await matchBusinessToYelp(restaurant.name, restaurant.address);
            return { name: restaurant.name, result };
        });
        const batchResults = await Promise.all(batchPromises);
        for (const { name, result } of batchResults) {
            results.set(name, result);
        }
        if (i + batchSize < restaurants.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }
    return results;
}
//# sourceMappingURL=YelpService.js.map