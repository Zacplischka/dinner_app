import {
  isVenueSearchResponse,
  type ComparisonStreamEvent,
  type Venue,
} from '@dinder/shared/types';
import { getLatest } from '../src/store/comparisonSnapshotStore.js';
import {
  assertActorRunIdsUnchanged,
  assertColdSnapshot,
  assertResolvedStorefronts,
  latestActorRunIds,
  parseComparisonSse,
  selectSmokeVenue,
} from '../src/services/comparisonSmoke.js';
import { config } from '../src/config/index.js';
import { supabase } from '../src/services/supabase.js';

const baseUrl = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const targetName = process.env.COMPARE_VENUE_NAME || '11 Inch Pizza';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function snapshotCount(placeId: string) {
  const { count, error } = await supabase
    .from('comparison_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('place_id', placeId);
  if (error) throw new Error(`Could not count comparison Snapshots: ${error.message}`);
  return count || 0;
}

async function findVenue(): Promise<Venue> {
  const query = new URLSearchParams({
    latitude: '-37.8156',
    longitude: '144.9631',
    radiusMiles: '2',
  });
  const response = await fetch(`${baseUrl}/api/comparison/venues?${query}`);
  assert(response.ok, `Venue search failed with status ${response.status}`);
  const output: unknown = await response.json();
  assert(isVenueSearchResponse(output), 'Venue search returned an invalid body');

  const requestedPlaceId = process.env.COMPARE_PLACE_ID;
  const venue = selectSmokeVenue(output.venues, targetName, requestedPlaceId);
  assert(
    venue,
    `Could not find ${requestedPlaceId || targetName} in nearby Venues: ${output.venues.map((candidate) => candidate.name).join(', ')}`
  );
  return venue;
}

async function streamComparison(placeId: string): Promise<ComparisonStreamEvent[]> {
  const response = await fetch(`${baseUrl}/api/comparison/${encodeURIComponent(placeId)}/stream`, {
    headers: { Accept: 'text/event-stream' },
  });
  assert(response.ok, `Comparison stream failed with status ${response.status}`);
  assert(
    response.headers.get('content-type')?.includes('text/event-stream'),
    'Comparison endpoint did not return SSE'
  );
  const events = parseComparisonSse(await response.text());
  const terminal = events.at(-1);
  if (terminal?.type === 'error') throw new Error(`${terminal.code}: ${terminal.message}`);
  assert(terminal?.type === 'comparison', 'Comparison stream did not end in a Comparison');

  assertResolvedStorefronts(events);
  return events;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run compare:smoke [BASE_URL=...] [COMPARE_VENUE_NAME=...]');
    return;
  }

  const venue = await findVenue();
  const beforeSnapshot = await getLatest(venue.placeId);
  assertColdSnapshot(beforeSnapshot);
  const beforeCount = await snapshotCount(venue.placeId);

  await streamComparison(venue.placeId);
  const afterFirstCount = await snapshotCount(venue.placeId);
  assert(
    afterFirstCount === beforeCount + 1,
    `Expected 1 new Snapshot on cold compare, got ${afterFirstCount - beforeCount}`
  );

  assert(config.apify.token, 'APIFY_TOKEN must be set for actor-run verification');
  const actorIds = [config.apify.uberEatsActorId, config.apify.doorDashActorId];
  const beforeReplayActorRunIds = await latestActorRunIds(actorIds, config.apify.token);
  await streamComparison(venue.placeId);
  const afterSecondCount = await snapshotCount(venue.placeId);
  const afterReplayActorRunIds = await latestActorRunIds(actorIds, config.apify.token);
  assertActorRunIdsUnchanged(beforeReplayActorRunIds, afterReplayActorRunIds);
  assert(
    afterSecondCount === afterFirstCount,
    `Fresh compare inserted ${afterSecondCount - afterFirstCount} unexpected Snapshot(s)`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        venue: venue.name,
        placeId: venue.placeId,
        firstCompareSnapshotDelta: 1,
        freshCompareSnapshotDelta: 0,
        freshCompareActorRunDelta: 0,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
