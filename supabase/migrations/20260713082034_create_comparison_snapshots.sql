create table public.comparison_snapshots (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  venue_name text not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);

create index comparison_snapshots_place_id_fetched_at_idx
  on public.comparison_snapshots (place_id, fetched_at desc);

alter table public.comparison_snapshots enable row level security;
