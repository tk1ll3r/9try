-- Live friend map.
-- 1. Sharing starts from a list of friends (user ids) instead of typed usernames.
-- 2. The sharer and the recipients get a realtime event whenever a position, a session or
--    the recipient list changes, so the map moves without waiting for the next reload.
-- 3. A friend can ask to be shown someone's location. That is only a notification;
--    nothing is shared until the other person starts a session.

create or replace function public.start_location_session_for(
  p_duration_minutes integer,
  p_recipient_ids uuid[],
  p_approximate boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid; recipients uuid[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_duration_minutes < 5 or p_duration_minutes > 1440 then raise exception 'invalid duration'; end if;

  select array_agg(p.id) into recipients
  from public.profiles p
  where p.id = any(p_recipient_ids) and private.can_contact(auth.uid(), p.id);
  if recipients is null then raise exception 'no valid recipients'; end if;

  perform private.purge_ended_location_positions();

  insert into public.location_sessions(owner_id, expires_at, approximate)
  values (auth.uid(), now() + make_interval(mins => p_duration_minutes), p_approximate)
  returning id into sid;

  insert into public.location_recipients(session_id, user_id)
  select sid, unnest(recipients);

  return sid;
end $$;

create or replace function public.request_location(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_name text;
begin
  if me is null or not private.can_contact(me, p_user_id) then raise exception 'request unavailable'; end if;

  select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into my_name
  from public.profiles p where p.id = me;

  -- At most one request per pair every ten minutes.
  insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
  values (p_user_id, 'location_request', my_name || ' muốn biết bạn đang ở đâu',
    'Mở bản đồ nếu bạn muốn chia sẻ vị trí.', '/me/location',
    'locreq:' || me::text || ':' || p_user_id::text || ':' || floor(extract(epoch from now()) / 600)::bigint::text)
  on conflict (dedupe_key) do nothing;
end $$;

revoke execute on function public.start_location_session_for(integer, uuid[], boolean) from public, anon;
revoke execute on function public.request_location(uuid) from public, anon;
grant execute on function public.start_location_session_for(integer, uuid[], boolean) to authenticated;
grant execute on function public.request_location(uuid) to authenticated;

create or replace function private.after_location_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if tg_table_name = 'location_sessions' then sid := coalesce(new.id, old.id);
  else sid := coalesce(new.session_id, old.session_id);
  end if;

  perform private.emit(s.owner_id, 'location') from public.location_sessions s where s.id = sid;
  perform private.emit(r.user_id, 'location') from public.location_recipients r where r.session_id = sid;
  -- Someone taken off the list is no longer in it, but their map must drop the marker.
  if tg_table_name = 'location_recipients' and tg_op = 'DELETE' then perform private.emit(old.user_id, 'location'); end if;
  return null;
end $$;

drop trigger if exists location_positions_changed on public.location_positions;
create trigger location_positions_changed after insert or update or delete on public.location_positions
for each row execute function private.after_location_change();

drop trigger if exists location_sessions_changed on public.location_sessions;
create trigger location_sessions_changed after update on public.location_sessions
for each row execute function private.after_location_change();

drop trigger if exists location_recipients_changed on public.location_recipients;
create trigger location_recipients_changed after insert or delete on public.location_recipients
for each row execute function private.after_location_change();
