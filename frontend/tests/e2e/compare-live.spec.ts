import { createClient } from '@supabase/supabase-js';
import { test, expect } from './fixtures';

interface SnapshotRow {
  place_id?: string;
  fetched_at: string;
  payload: {
    ubereats?: { status?: string };
    doordash?: { status?: string };
  };
}

function snapshotIsFresh(snapshot: SnapshotRow | null): boolean {
  if (!snapshot) return false;
  const hasFailure = [snapshot.payload.ubereats, snapshot.payload.doordash]
    .some((storefront) => storefront?.status === 'failed');
  const maxAgeMs = hasFailure ? 2 * 60_000 : 20 * 60_000;
  const ageMs = Date.now() - Date.parse(snapshot.fetched_at);
  return ageMs >= 0 && ageMs < maxAgeMs;
}

test.describe('live delivery comparison', () => {
  test.skip(
    process.env.RUN_LIVE_COMPARE !== '1',
    'Set RUN_LIVE_COMPARE=1 to allow paid live calls'
  );

  test('compares one real Melbourne Venue and persists its Snapshot', async ({ page, context }) => {
    test.setTimeout(600_000);
    const baseUrl = test.info().project.use.baseURL || 'http://localhost:3000';
    const venueName = process.env.COMPARE_VENUE_NAME || '11 Inch Pizza';
    const latitude = Number(process.env.COMPARE_LATITUDE || -37.8156);
    const longitude = Number(process.env.COMPARE_LONGITUDE || 144.9631);
    expect(Number.isFinite(latitude), 'COMPARE_LATITUDE must be numeric').toBe(true);
    expect(Number.isFinite(longitude), 'COMPARE_LONGITUDE must be numeric').toBe(true);
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseUrl, 'SUPABASE_URL must be set for the live gate').toBeTruthy();
    expect(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY must be set for the live gate').toBeTruthy();
    const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await context.grantPermissions(['geolocation'], { origin: new URL(baseUrl).origin });
    await context.setGeolocation({ latitude, longitude });
    await page.goto('/compare');
    await page.getByRole('button', { name: 'Use my location' }).click();

    const compareButton = page.getByRole('button', {
      name: new RegExp(`Compare ${venueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    });
    await expect(compareButton).toBeVisible({ timeout: 30_000 });
    const placeId = await compareButton.getAttribute('data-place-id');
    expect(placeId, 'Compare action must expose its Venue place ID').toBeTruthy();
    const before = await supabase
      .from('comparison_snapshots')
      .select('fetched_at, payload', { count: 'exact' })
      .eq('place_id', placeId!)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle<SnapshotRow>();
    expect(before.error).toBeNull();
    expect(
      snapshotIsFresh(before.data),
      'Selected Venue already has a fresh Snapshot; choose an uncached or stale COMPARE_PLACE_ID/COMPARE_VENUE_NAME so this gate exercises live credentials.'
    ).toBe(false);
    const beforeCount = before.count || 0;

    await compareButton.click();

    await expect(page.getByRole('heading', { name: venueName })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Fetched (just now|\d+ mins? ago)$/)).toBeVisible({
      timeout: 600_000,
    });
    await expect(page.getByRole('link', { name: 'Open in Uber Eats' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open in DoorDash' }).first()).toBeVisible();

    expect(decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) || '')).toBe(placeId);
    await expect.poll(async () => {
      const result = await supabase
        .from('comparison_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('place_id', placeId!);
      if (result.error) throw result.error;
      return result.count || 0;
    }, { timeout: 30_000 }).toBe(beforeCount + 1);

    const { data, error } = await supabase
      .from('comparison_snapshots')
      .select('place_id, fetched_at, payload')
      .eq('place_id', placeId)
      .order('fetched_at', { ascending: false })
      .limit(1)
      .single();

    expect(error).toBeNull();
    expect(data?.place_id).toBe(placeId);
    expect(data?.payload).toMatchObject({
      ubereats: { status: 'resolved' },
      doordash: { status: 'resolved' },
    });
  });
});
