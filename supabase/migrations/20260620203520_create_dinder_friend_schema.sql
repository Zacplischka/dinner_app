create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self check (user_id <> friend_id)
);

create unique index friendships_unique_pair
  on public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

create table public.session_invites (
  id uuid primary key default gen_random_uuid(),
  session_code text not null,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  constraint session_invites_session_inviter_invitee_unique unique (session_code, inviter_id, invitee_id),
  constraint session_invites_no_self check (inviter_id <> invitee_id)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.session_invites enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.friendships to service_role;
grant select, insert, update, delete on public.session_invites to service_role;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
