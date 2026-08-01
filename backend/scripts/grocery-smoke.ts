// Live Woolworths smoke check (optional, never CI-gating): one seed plus a
// few polite searches through the real queue. Verifies the endpoint answers,
// the response carries a FulfilmentStoreId (the #245 drift check — anything
// but 1101 reopens the egress decision), and the Matcher lands a real product
// for a dialect term. Run with: npm run grocery:smoke
import { woolworthsQueue } from '../src/services/politenessQueue.js';
import { matchProducts } from '../src/services/productMatcher.js';
import { translateTerm } from '../src/services/usToAuTerms.js';
import { createWoolworthsClient } from '../src/services/woolworthsClient.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const client = createWoolworthsClient();

  for (const term of ['coriander', 'heavy cream']) {
    const searchTerm = translateTerm(term);
    const { storeId, products } = await woolworthsQueue(() => client.search(searchTerm));
    assert(storeId !== null, `no FulfilmentStoreId on the "${searchTerm}" response`);
    assert(products.length > 0, `no products for "${searchTerm}"`);

    const match = matchProducts(products, searchTerm);
    assert(match, `sapcat guard rejected every candidate for "${searchTerm}"`);
    const price = match.match.priceCents;
    assert(price !== undefined && price > 0, `matched "${searchTerm}" has no online price`);

    console.log(
      `✓ ${term} → ${searchTerm} @ store ${storeId}: ${match.match.name} ` +
        `(${match.match.packageSize ?? '?'}, $${(price / 100).toFixed(2)}, ` +
        `${match.runnersUp.length} runner-ups)`
    );
    if (storeId !== 1101) {
      // Expected off-production: the store follows the caller's location.
      // From Railway's egress, anything but 1101 reopens the egress decision.
      console.warn(`! served store ${storeId} ≠ 1101 (fine off-production; drift check is #249)`);
    }
  }
  console.log('Woolworths smoke check passed');
}

main().catch((error) => {
  console.error('Woolworths smoke check failed:', error);
  process.exit(1);
});
