# Route performance evidence

`frontend/scripts/benchmark-pages.mjs` is the single measurement path for issue #147. It always runs the existing nine routes in Playwright Chromium at 1280x720 with no throttling and records exactly 30 new-context cold samples plus 30 reloads per route.

The direct-Railway baseline has no excluded prime. A post-cutover run requires one fresh-context `MISS` prime per route and excludes it from statistics. Every recorded cold response must then be `HIT`; every warm response must be `HIT` or `REVALIDATED`; and the prime, cold, and warm responses must all come from the same POP. Any other cache status or POP change fails the route batch without dropping samples.

Run from the repository root after proving that the supplied deployment belongs to the supplied commit:

```sh
npm run benchmark:pages --workspace=frontend -- \
  --mode=baseline \
  --base-url=https://frontend-production-bdfc.up.railway.app \
  --commit=<full-deployed-sha> \
  --deployment=<railway-deployment-id-or-url> \
  --runner-location="Melbourne, Australia" \
  --output=../docs/evidence/route-performance/pre-cutover-direct-railway.json
```

After cutover and the required cache purge, use the same machine and installed Chromium version:

```sh
npm run benchmark:pages --workspace=frontend -- \
  --mode=post-cutover \
  --base-url=https://www.dinder.it.com \
  --commit=<full-deployed-sha> \
  --deployment=<railway-deployment-id-or-url> \
  --runner-location="Melbourne, Australia" \
  --baseline=../docs/evidence/route-performance/pre-cutover-direct-railway.json \
  --output=../docs/evidence/route-performance/post-cutover-cloudflare.json
```

The artifact defines median as the mean of the two middle sorted values (positions 15 and 16 for 30 samples), p95 as nearest-rank, and document TTFB as `PerformanceNavigationTiming.responseStart - requestStart`. Post-cutover thresholds and same-route baseline comparisons use inclusive `<=` checks.

GitHub-hosted CI is rejected by this command and cannot claim the Melbourne performance gate. Hosted CI may verify deterministic headers, cache, purge, route, and health contracts; a performance claim requires this fixed Melbourne runner unless a dedicated fixed runner is added later.
