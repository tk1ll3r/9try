-- Photos on the Mode screen ("Khoảnh khắc"): a person posts a photo for their friends, or for the
-- friends they choose, and it is gone after 24 hours.
--
-- This is the first thing the app keeps in Storage. Three things guard a photo:
--   1. The row in `moments` says whose it is, who may see it and until when. The tables have no
--      policies; everything goes through the functions below, which ask on every call.
--   2. The file is readable only through the policy on storage.objects below, which asks the same
--      question about the row that names the file. A file without a row is readable by its owner only.
--   3. After 24 hours the row is refused, then deleted by a scheduled job. The file is removed by
--      the worker (supabase/functions/process-reminders), because a file can only be removed
--      through the Storage API: a row deleted from storage.objects by SQL leaves the file behind.

-- 1. The bucket: private, small JPEG files only. A file's name is '<user id>/<moment id>.jpg'.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 524288, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

-- 2. The rows.
create table public.moments (
  -- Made by the device, as a message's id is, so posting again after a lost answer posts nothing twice.
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  path text not null unique,
  -- The key of the activity the person had on, as activity_modes stores it. The app knows its name.
  mode text check (mode is null or mode ~ '^[a-z][a-z_]{1,29}$'),
  caption text not null default '' check (length(caption) <= 80),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  -- 'friends': every accepted friend. 'selected': the people in moment_viewers.
  audience text not null default 'friends' check (audience in ('friends', 'selected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index moments_by_owner on public.moments(owner_id, created_at desc);
create index moments_by_expiry on public.moments(expires_at);

create table public.moment_viewers (
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (moment_id, user_id)
);
-- Who looked. The owner sees this list; nobody else does.
create table public.moment_views (
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);
create table public.moment_reactions (
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'laugh', 'wow', 'sad', 'fire', 'like')),
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

alter table public.moments enable row level security;
alter table public.moment_viewers enable row level security;
alter table public.moment_views enable row level security;
alter table public.moment_reactions enable row level security;
revoke all on public.moments, public.moment_viewers, public.moment_views, public.moment_reactions from anon, authenticated;

-- 3. Who may see a photo: its owner, and a friend it was posted for, while it is not over and while
-- the two are still friends and neither has blocked the other. Asked on every read, of the row and of the file.
create function private.can_see_moment(p_moment_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.moments m
    where m.id = p_moment_id and m.expires_at > now() and (
      m.owner_id = p_user_id
      or (private.can_contact(m.owner_id, p_user_id)
          and (m.audience = 'friends' or exists(select 1 from public.moment_viewers v where v.moment_id = m.id and v.user_id = p_user_id)))))
$$;

-- The people a photo is shown to right now, without its owner.
create function private.moment_audience(p_moment_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select case when f.requester_id = m.owner_id then f.addressee_id else f.requester_id end
  from public.moments m
  join public.friendships f on f.status = 'accepted' and m.owner_id in (f.requester_id, f.addressee_id)
  where m.id = p_moment_id and m.audience = 'friends' and not private.is_blocked_between(f.requester_id, f.addressee_id)
  union
  select v.user_id from public.moments m join public.moment_viewers v on v.moment_id = m.id
  where m.id = p_moment_id and m.audience = 'selected' and private.can_contact(m.owner_id, v.user_id)
$$;

-- Whether the caller may read a file of the bucket. In `public` because a policy runs as the caller,
-- who has no access to the `private` schema; it answers about the caller only.
create function public.can_read_moment_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    split_part(p_name, '/', 1) = (select auth.uid())::text
    or exists(select 1 from public.moments m where m.path = p_name and private.can_see_moment(m.id, (select auth.uid()))))
$$;

create policy "moments: a person writes under their own id" on storage.objects for insert to authenticated
  with check (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "moments: a person reads what they may see" on storage.objects for select to authenticated
  using (bucket_id = 'moments' and public.can_read_moment_file(name));
create policy "moments: a person removes their own files" on storage.objects for delete to authenticated
  using (bucket_id = 'moments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4. The inbox. A reaction is told in the inbox and pushed only to people who ask for that, like
-- the alerts about a friend's mode: both can be many a day.
create or replace function private.push_allowed(p_user_id uuid, p_category text) returns boolean
language plpgsql stable set search_path = '' as $$
declare pref public.notification_preferences%rowtype; zone text; local_now time;
begin
  select * into pref from public.notification_preferences where user_id = p_user_id;
  if pref.user_id is null or not pref.push_enabled then return false; end if;
  if not coalesce((pref.category_push->>p_category)::boolean, p_category not in ('friend_mode', 'moment_reaction')) then return false; end if;
  if pref.quiet_start is null or pref.quiet_end is null or pref.quiet_start = pref.quiet_end then return true; end if;

  select timezone into zone from public.profiles where id = p_user_id;
  local_now := (now() at time zone coalesce(zone, 'UTC'))::time;
  if pref.quiet_start < pref.quiet_end then return not (local_now >= pref.quiet_start and local_now < pref.quiet_end); end if;
  return not (local_now >= pref.quiet_start or local_now < pref.quiet_end);
end $$;

-- Takes the note "Ảnh mới · …" out of the inboxes of people for whom its poster has no photo left to show them.
create function private.forget_moment_notes() returns void
language sql set search_path = '' as $$
  update public.reminders r set status = 'canceled'
  where r.category = 'moment' and r.status = 'pending'
    and not exists(select 1 from public.moments m
      where r.idempotency_key = 'moment:' || m.owner_id::text || ':' || r.user_id::text and private.can_see_moment(m.id, r.user_id));
  delete from public.notifications n
  where n.category = 'moment'
    and not exists(select 1 from public.moments m
      where n.dedupe_key = 'moment:' || m.owner_id::text || ':' || n.user_id::text and private.can_see_moment(m.id, n.user_id));
$$;

-- 5. The functions.

-- Posts a photo whose file is already in the bucket, under the caller's id and this id. Without
-- `p_viewer_ids` it is for every friend; with them, for those friends only. A list that is empty, or
-- names nobody but the caller, is for nobody: it never turns into "every friend". At most 20 in 24 hours.
create function public.post_moment(p_id uuid, p_width integer, p_height integer, p_mode text default null, p_caption text default '', p_viewer_ids uuid[] default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); file text; chosen uuid[]; recipient uuid; poster text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is null then raise exception 'photo not uploaded'; end if;
  if exists(select 1 from public.moments m where m.id = p_id) then return; end if;
  file := me::text || '/' || p_id::text || '.jpg';
  if not exists(select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = file) then raise exception 'photo not uploaded'; end if;
  if (select count(*) from public.moments m where m.owner_id = me and m.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too many photos';
  end if;
  if p_viewer_ids is not null then
    chosen := coalesce((select array_agg(distinct v) from unnest(p_viewer_ids) v where v <> me), '{}'::uuid[]);
    if exists(select 1 from unnest(chosen) v where not private.can_contact(me, v)) then raise exception 'viewer not a friend'; end if;
  end if;

  insert into public.moments(id, owner_id, path, mode, caption, width, height, audience)
  values (p_id, me, file, nullif(p_mode, ''), left(trim(coalesce(p_caption, '')), 80), p_width, p_height, case when chosen is null then 'friends' else 'selected' end);
  if chosen is not null then
    insert into public.moment_viewers(moment_id, user_id) select p_id, v from unnest(chosen) v;
  end if;

  select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into poster from public.profiles p where p.id = me;
  for recipient in select private.moment_audience(p_id) loop
    perform private.emit(recipient, 'moments');
    -- One note per poster while their photos wait to be looked at. One that was marked read in the
    -- inbox is told again, as a chat message is (migration 0038).
    delete from public.notifications n where n.dedupe_key = 'moment:' || me::text || ':' || recipient::text and n.read_at is not null;
    insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
    values (recipient, 'moment', 'Ảnh mới · ' || poster, '', '/moments/' || me::text, 'moment:' || me::text || ':' || recipient::text)
    on conflict (dedupe_key) do nothing;
  end loop;
  perform private.emit(me, 'moments');
end $$;

-- The photos the caller may see right now, their own among them, newest first. `views` and
-- `reactions` are filled for the caller's own photos only.
create function public.list_moments()
returns table(
  id uuid, owner_id uuid, owner_name text, owner_avatar_url text, path text, mode text, caption text, width integer, height integer,
  created_at timestamptz, expires_at timestamptz, audience text, seen boolean, my_reaction text, views integer, reactions jsonb)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, m.path, m.mode, m.caption, m.width, m.height,
    m.created_at, m.expires_at, m.audience,
    m.owner_id = (select auth.uid()) or exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = (select auth.uid())),
    (select r.reaction from public.moment_reactions r where r.moment_id = m.id and r.user_id = (select auth.uid())),
    case when m.owner_id = (select auth.uid()) then (select count(*)::integer from public.moment_views v where v.moment_id = m.id) end,
    case when m.owner_id = (select auth.uid()) then coalesce((
      select jsonb_object_agg(x.reaction, x.total) from (select r.reaction, count(*) as total from public.moment_reactions r where r.moment_id = m.id group by r.reaction) x), '{}'::jsonb) end
  from public.moments m
  join public.profiles p on p.id = m.owner_id
  where m.expires_at > now() and private.can_see_moment(m.id, (select auth.uid()))
  order by m.created_at desc
$$;

-- The caller looked at a photo. Its owner learns that; when no photo of that person is left to look at,
-- the note in the caller's inbox has done its work.
create function public.see_moment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); owner uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select m.owner_id into owner from public.moments m where m.id = p_id;
  if owner is null or not private.can_see_moment(p_id, me) then raise exception 'photo not found'; end if;
  if owner = me then return; end if;
  insert into public.moment_views(moment_id, user_id) values (p_id, me) on conflict do nothing;
  if found then
    perform private.emit(owner, 'moments');
    perform private.emit(me, 'moments');
  end if;
  if not exists(
    select 1 from public.moments m
    where m.owner_id = owner and private.can_see_moment(m.id, me)
      and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = me)) then
    update public.reminders r set status = 'canceled' where r.idempotency_key = 'moment:' || owner::text || ':' || me::text and r.status = 'pending';
    delete from public.notifications n where n.dedupe_key = 'moment:' || owner::text || ':' || me::text;
    if found then perform private.emit(me, 'notifications'); end if;
  end if;
end $$;

-- One reaction per person per photo. Null takes it back. Reacting counts as having looked.
create function public.react_to_moment(p_id uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); owner uuid; who text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select m.owner_id into owner from public.moments m where m.id = p_id;
  if owner is null or owner = me or not private.can_see_moment(p_id, me) then raise exception 'photo not found'; end if;
  if p_reaction is not null and p_reaction not in ('heart', 'laugh', 'wow', 'sad', 'fire', 'like') then raise exception 'invalid reaction'; end if;

  insert into public.moment_views(moment_id, user_id) values (p_id, me) on conflict do nothing;
  if p_reaction is null then
    delete from public.moment_reactions r where r.moment_id = p_id and r.user_id = me;
  else
    insert into public.moment_reactions(moment_id, user_id, reaction) values (p_id, me, p_reaction)
    on conflict (moment_id, user_id) do update set reaction = excluded.reaction, created_at = now();
    select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into who from public.profiles p where p.id = me;
    perform private.notify(owner, 'moment_reaction', who || ' thả cảm xúc vào ảnh của bạn', '', '/moments/' || owner::text, 'momentreact:' || p_id::text || ':' || me::text);
  end if;
  perform private.emit(owner, 'moments');
  perform private.emit(me, 'moments');
end $$;

-- Removes one's own photo for everyone, now. Returns the file's name, which the caller then removes from the bucket.
create function public.delete_moment(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); file text; shown uuid[]; recipient uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select m.path into file from public.moments m where m.id = p_id and m.owner_id = me;
  if file is null then raise exception 'photo not found'; end if;
  shown := array(select private.moment_audience(p_id));
  delete from public.moments m where m.id = p_id;
  perform private.forget_moment_notes();
  foreach recipient in array shown loop
    perform private.emit(recipient, 'moments');
    perform private.emit(recipient, 'notifications');
  end loop;
  perform private.emit(me, 'moments');
  return file;
end $$;

-- For the owner of a photo: who looked, newest first, and what each one reacted with.
create function public.list_moment_views(p_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, seen_at timestamptz, reaction text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.moments m where m.id = p_id and m.owner_id = (select auth.uid())) then raise exception 'photo not found'; end if;
  return query
  select v.user_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, v.seen_at,
    (select r.reaction from public.moment_reactions r where r.moment_id = v.moment_id and r.user_id = v.user_id)
  from public.moment_views v join public.profiles p on p.id = v.user_id
  where v.moment_id = p_id
  order by v.seen_at desc;
end $$;

-- 6. After 24 hours. The rows go here, every ten minutes; the files go through the worker.
create function private.expire_moments() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.moments m where m.expires_at <= now();
  perform private.forget_moment_notes();
end $$;

do $$
begin
  perform cron.schedule('moments-expire', '*/10 * * * *', 'select private.expire_moments()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Photos that are over then stay stored; they are still refused to everyone but their owner.', sqlerrm;
end $$;

-- Files of the app's buckets that no row names any more: a photo that is over or was deleted, an
-- upload that was never posted. An hour's grace covers an upload that is being posted right now.
-- For the worker only, which removes them through the Storage API.
create function public.orphan_media_files(p_limit integer default 100) returns table(bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id::text, o.name::text from storage.objects o
  where o.bucket_id = 'moments' and o.created_at < now() - interval '1 hour'
    and not exists(select 1 from public.moments m where m.path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_read_moment_file(text)', 'public.post_moment(uuid, integer, integer, text, text, uuid[])', 'public.list_moments()',
    'public.see_moment(uuid)', 'public.react_to_moment(uuid, text)', 'public.delete_moment(uuid)', 'public.list_moment_views(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.orphan_media_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_media_files(integer) to service_role;
