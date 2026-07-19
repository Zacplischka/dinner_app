import { isSnapshotPayload, type Snapshot, type SnapshotPayload } from '@dinder/shared/types';
import { logger } from '../logger.js';
import { DomainError } from '../services/DomainError.js';
import { supabase, type Database, type Json } from '../services/supabase.js';

const snapshotSelect = 'id, place_id, venue_name, fetched_at, payload';

type ComparisonSnapshotRow = Database['public']['Tables']['comparison_snapshots']['Row'];

function toSnapshot(row: ComparisonSnapshotRow): Snapshot {
  // The payload column is flexible jsonb: generated types expose it as `Json`, so a
  // static type is not proof it matches the actor shape. Validate with the shared
  // guard (single source of truth) before it becomes a domain Snapshot (#102/#28).
  if (!isSnapshotPayload(row.payload)) {
    logger.error(
      { snapshotId: row.id, placeId: row.place_id },
      'Malformed comparison snapshot payload'
    );
    throw new DomainError('database_error', 'Malformed comparison snapshot payload');
  }
  return {
    id: row.id,
    placeId: row.place_id,
    venueName: row.venue_name,
    fetchedAt: row.fetched_at,
    payload: row.payload,
  };
}

export async function getLatest(placeId: string): Promise<Snapshot | null> {
  const { data, error } = await supabase
    .from('comparison_snapshots')
    .select(snapshotSelect)
    .eq('place_id', placeId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error({ err: error }, 'Error fetching comparison snapshot');
    throw new DomainError('database_error', 'Failed to fetch comparison snapshot');
  }

  return data ? toSnapshot(data) : null;
}

export async function insert(input: {
  placeId: string;
  venueName: string;
  payload: SnapshotPayload;
}): Promise<Snapshot> {
  const { data, error } = await supabase
    .from('comparison_snapshots')
    .insert({
      place_id: input.placeId,
      venue_name: input.venueName,
      // SnapshotPayload is a concrete object; widen to the column's Json type.
      payload: input.payload as unknown as Json,
    })
    .select(snapshotSelect)
    .single();

  if (error) {
    logger.error({ err: error }, 'Error inserting comparison snapshot');
    throw new DomainError('database_error', 'Failed to insert comparison snapshot');
  }

  return toSnapshot(data);
}
