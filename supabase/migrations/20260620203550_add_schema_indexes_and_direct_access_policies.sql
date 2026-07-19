create index friendships_user_status_idx
  on public.friendships (user_id, status);

create index friendships_friend_status_idx
  on public.friendships (friend_id, status);

create index session_invites_inviter_id_idx
  on public.session_invites (inviter_id);

create index session_invites_invitee_status_created_idx
  on public.session_invites (invitee_id, status, created_at desc);

create policy "No direct client access"
  on public.profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client access"
  on public.friendships
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "No direct client access"
  on public.session_invites
  for all
  to anon, authenticated
  using (false)
  with check (false);
