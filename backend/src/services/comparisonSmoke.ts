import type { ComparisonStreamEvent, Snapshot, Venue } from '@dinder/shared/types';
import {
  isComparisonStreamEventName,
  parseComparisonStreamEvent,
  SNAPSHOT_FAILURE_FRESHNESS_MS,
  SNAPSHOT_FRESHNESS_MS,
} from '@dinder/shared/types';

export function selectSmokeVenue(
  venues: Venue[],
  targetName: string,
  requestedPlaceId?: string
): Venue | undefined {
  if (requestedPlaceId) {
    return (
      venues.find((venue) => venue.placeId === requestedPlaceId) || {
        placeId: requestedPlaceId,
        name: targetName,
        distanceMiles: 0,
      }
    );
  }
  const normalizedTarget = targetName.toLowerCase();
  return (
    venues.find((venue) => venue.name.toLowerCase() === normalizedTarget) ||
    venues.find((venue) => venue.name.toLowerCase().includes(normalizedTarget))
  );
}

export function parseComparisonSse(body: string): ComparisonStreamEvent[] {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n');
      const type = lines.find((line) => line.startsWith('event: '))?.slice(7);
      if (!isComparisonStreamEventName(type)) {
        throw new Error(`Unknown comparison SSE event: ${type || 'missing'}`);
      }
      const dataText = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      let data: unknown;
      try {
        data = JSON.parse(dataText);
      } catch {
        throw new Error('Invalid comparison SSE data');
      }
      const event = parseComparisonStreamEvent(type, data);
      if (!event) throw new Error('Invalid comparison SSE data');
      return event;
    });
}

export function assertResolvedStorefronts(events: ComparisonStreamEvent[]): void {
  for (const [platform, label] of [
    ['ubereats', 'Uber Eats'],
    ['doordash', 'DoorDash'],
  ] as const) {
    const event = events.find(
      (candidate) => candidate.type === 'storefront' && candidate.platform === platform
    );
    if (!event || event.type !== 'storefront') {
      throw new Error(`Comparison stream omitted the ${label} Storefront`);
    }
    if (event.storefront.status !== 'resolved') {
      throw new Error(`${label} Storefront settled as ${event.storefront.status}`);
    }
  }
}

export function assertColdSnapshot(snapshot: Snapshot | null, now = Date.now()): void {
  if (!snapshot) return;
  const hasFailure = [snapshot.payload.ubereats, snapshot.payload.doordash].some(
    (storefront) => storefront.status === 'failed'
  );
  const maxAgeMs = hasFailure ? SNAPSHOT_FAILURE_FRESHNESS_MS : SNAPSHOT_FRESHNESS_MS;
  const ageMs = now - Date.parse(snapshot.fetchedAt);
  if (ageMs >= 0 && ageMs < maxAgeMs) {
    throw new Error(
      'Selected Venue already has a fresh Snapshot; choose an uncached or stale ' +
        'COMPARE_PLACE_ID/COMPARE_VENUE_NAME so this gate exercises live credentials.'
    );
  }
}

export async function latestActorRunIds(
  actorIds: string[],
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  return Promise.all(
    actorIds.map(async (actorId) => {
      const actorPath = actorId.replace('/', '~');
      const response = await fetchImpl(
        `https://api.apify.com/v2/acts/${actorPath}/runs?limit=1&desc=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error(`Could not inspect ${actorId} runs`);
      const output = (await response.json()) as { data?: { items?: Array<{ id?: unknown }> } };
      const runId = output.data?.items?.[0]?.id;
      if (typeof runId !== 'string') throw new Error(`No run marker returned for ${actorId}`);
      return runId;
    })
  );
}

export function assertActorRunIdsUnchanged(before: string[], after: string[]): void {
  if (before.length !== after.length || before.some((runId, index) => runId !== after[index])) {
    throw new Error('Fresh replay started an unexpected actor run');
  }
}
