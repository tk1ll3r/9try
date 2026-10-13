-- Custom activity modes belong to one person. Friends can read their presentation only while the
-- mode is active; photos store a snapshot so a later rename does not rewrite a moment's history.

create table public.custom_activity_modes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text generated always as ('custom_' || replace(id::text, '-', '')) stored unique,
  label text not null check (length(trim(label)) between 1 and 28),
  icon text not null check (icon in ('sparkles','coffee','book','briefcase','game','smile','camera','food')),
  color text not null check (color in ('#22c55e','#3b82f6','#8b5cf6','#a16207','#ec4899','#ef4444','#06b6d4','#d97706')),
  created_at timestamptz not null default now()
);
create unique index custom_activity_modes_name_idx on public.custom_activity_modes(user_id, lower(label));
alter table public.custom_activity_modes enable row level security;
revoke all on public.custom_activity_modes from anon, authenticated;
grant select on public.custom_activity_modes to authenticated;
create policy custom_activity_modes_read on public.custom_activity_modes for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.activity_modes active
    where active.user_id = custom_activity_modes.user_id
      and active.mode = custom_activity_modes.mode
      and active.expires_at > now()
      and public.can_view_activity_mode(custom_activity_modes.user_id)
  )
);

create function public.create_my_custom_activity_mode(p_id uuid, p_label text, p_icon text, p_color text)
returns table(mode text, label text, icon text, color text)
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); clean_label text := left(trim(coalesce(p_label, '')), 28); existing public.custom_activity_modes%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is null or length(clean_label) < 1
     or p_icon not in ('sparkles','coffee','book','briefcase','game','smile','camera','food')
     or p_color not in ('#22c55e','#3b82f6','#8b5cf6','#a16207','#ec4899','#ef4444','#06b6d4','#d97706') then
    raise exception 'invalid custom mode';
  end if;

  -- A retry after a lost response, or two quick submissions from one device, should not create two
  -- catalog rows. A per-user transaction lock also makes the case-insensitive name check race-safe.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 1));
  select * into existing from public.custom_activity_modes c where c.id = p_id;
  if existing.id is not null then
    if existing.user_id <> me or existing.label <> clean_label or existing.icon <> p_icon or existing.color <> p_color then
      raise exception 'custom mode id already used';
    end if;
    return query select existing.mode, existing.label, existing.icon, existing.color;
    return;
  end if;

  select * into existing from public.custom_activity_modes c where c.user_id = me and lower(c.label) = lower(clean_label);
  if existing.id is not null then
    if existing.label <> clean_label or existing.icon <> p_icon or existing.color <> p_color then raise exception 'custom mode name already exists'; end if;
    return query select existing.mode, existing.label, existing.icon, existing.color;
    return;
  end if;

  insert into public.custom_activity_modes(id, user_id, label, icon, color)
  values (p_id, me, clean_label, p_icon, p_color);
  return query select c.mode, c.label, c.icon, c.color from public.custom_activity_modes c where c.id = p_id and c.user_id = me;
end $$;
revoke all on function public.create_my_custom_activity_mode(uuid,text,text,text) from public, anon;
grant execute on function public.create_my_custom_activity_mode(uuid,text,text,text) to authenticated;

-- One read for the current user's modes and accepted friends' active modes, with custom presentation
-- included only when the corresponding mode is currently active.
create function public.list_visible_activity_modes()
returns table(user_id uuid, mode text, updated_at timestamptz, expires_at timestamptz, mode_label text, mode_icon text, mode_color text)
language sql stable security definer set search_path = '' as $$
  select active.user_id, active.mode, active.updated_at, active.expires_at, custom.label, custom.icon, custom.color
  from public.activity_modes active
  left join public.custom_activity_modes custom on custom.user_id = active.user_id and custom.mode = active.mode
  where active.expires_at > now()
    and (active.user_id = (select auth.uid()) or private.can_contact(active.user_id, (select auth.uid())))
$$;
revoke all on function public.list_visible_activity_modes() from public, anon;
grant execute on function public.list_visible_activity_modes() to authenticated;

-- A custom key can only be selected by its owner. Built-in keys retain the app's existing format.
create or replace function public.set_my_activity_mode(p_mode text, p_minutes integer default 120)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_mode is null then
    delete from public.activity_modes where user_id = me;
    return;
  end if;
  if p_mode !~ '^[a-z][a-z0-9_]{1,47}$' or p_minutes is null or p_minutes not in (30, 60, 120, 240, 480)
     or (left(p_mode, 7) = 'custom_' and not exists (
       select 1 from public.custom_activity_modes c where c.user_id = me and c.mode = p_mode
     )) then
    raise exception 'invalid activity mode or duration';
  end if;
  insert into public.activity_modes(user_id, mode, updated_at, expires_at)
  values (me, p_mode, now(), now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update set mode = excluded.mode, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end $$;

-- Keep the existing pinned-friend alert, but use the owner's actual custom label when one is active.
create or replace function private.after_activity_mode_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(new.user_id, old.user_id); custom_label text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications n using public.reminders r
    where n.dedupe_key = r.idempotency_key and r.idempotency_key like 'mode:' || who::text || ':%' and r.status = 'pending';
    update public.reminders r set status = 'canceled' where r.idempotency_key like 'mode:' || who::text || ':%' and r.status = 'pending';
    return null;
  end if;
  if tg_op = 'UPDATE' and old.mode = new.mode and old.expires_at > now() then return null; end if;
  select c.label into custom_label from public.custom_activity_modes c where c.user_id = who and c.mode = new.mode;
  perform private.notify(p.user_id, 'friend_mode', private.display_name_of(who) || ' vừa bật mode', coalesce(custom_label, 'mode:' || new.mode), '/',
    'mode:' || who::text || ':' || p.user_id::text, interval '1 minute')
  from public.friend_pins p
  join public.notification_preferences pref on pref.user_id = p.user_id
  where p.friend_id = who and coalesce((pref.category_push->>'friend_mode')::boolean, false)
    and private.can_contact(who, p.user_id);
  return null;
end $$;

-- Snapshot custom mode presentation on a photo. The mode itself remains the stable key.
alter table public.moments add column mode_label text;
alter table public.moments add column mode_icon text;
alter table public.moments add column mode_color text;
alter table public.moments drop constraint if exists moments_mode_check;
alter table public.moments add constraint moments_mode_check check (mode is null or mode ~ '^[a-z][a-z0-9_]{1,47}$');
alter table public.moments add constraint moments_mode_presentation_check check (
  (mode_label is null and mode_icon is null and mode_color is null)
  or (mode_label is not null and mode_icon is not null and mode_color is not null and length(trim(mode_label)) between 1 and 28
      and mode_icon in ('sparkles','coffee','book','briefcase','game','smile','camera','food')
      and mode_color in ('#22c55e','#3b82f6','#8b5cf6','#a16207','#ec4899','#ef4444','#06b6d4','#d97706'))
);
alter table public.activity_modes drop constraint if exists activity_modes_mode_check;
alter table public.activity_modes add constraint activity_modes_mode_check check (mode ~ '^[a-z][a-z0-9_]{1,47}$');

-- Replace the old signature rather than leave an overload with defaults that makes PostgREST calls
-- ambiguous. Posting and activating a newly selected mode now succeed or fail together.
drop function public.post_moment(uuid,integer,integer,text,text,uuid[]);
create function public.post_moment(
  p_id uuid,
  p_width integer,
  p_height integer,
  p_mode text default null,
  p_caption text default '',
  p_viewer_ids uuid[] default null,
  p_activate_mode boolean default false,
  p_mode_minutes integer default 120
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); file text; chosen uuid[]; recipient uuid; poster text;
  mode_label text; mode_icon text; mode_color text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is null then raise exception 'photo not uploaded'; end if;
  -- Serialize this person's posts before checking the id as well as the daily cap. Two concurrent
  -- retries of the same upload then resolve to the already-created row instead of a unique error.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  if exists(select 1 from public.moments m where m.id = p_id) then return; end if;
  file := me::text || '/' || p_id::text || '.jpg';
  if not exists(select 1 from storage.objects o where o.bucket_id = 'moments' and o.name = file) then raise exception 'photo not uploaded'; end if;
  if p_mode is not null and p_mode !~ '^[a-z][a-z0-9_]{1,47}$' then raise exception 'invalid activity mode'; end if;
  if p_mode is not null and left(p_mode, 7) = 'custom_' then
    select c.label, c.icon, c.color into mode_label, mode_icon, mode_color
    from public.custom_activity_modes c where c.user_id = me and c.mode = p_mode;
    if mode_label is null then raise exception 'invalid activity mode'; end if;
  end if;
  if p_activate_mode and (p_mode is null or p_mode_minutes is null or p_mode_minutes not in (30, 60, 120, 240, 480)) then
    raise exception 'invalid activity mode or duration';
  end if;
  if p_viewer_ids is not null then
    chosen := coalesce((select array_agg(distinct v) from unnest(p_viewer_ids) v where v <> me), '{}'::uuid[]);
    if exists(select 1 from unnest(chosen) v where not private.can_contact(me, v)) then raise exception 'viewer not a friend'; end if;
  end if;

  -- The per-person lock keeps simultaneous posts from passing the daily cap together.
  if (select count(*) from public.moments m where m.owner_id = me and m.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'too many photos';
  end if;

  insert into public.moments(id, owner_id, path, mode, caption, width, height, audience, mode_label, mode_icon, mode_color)
  values (p_id, me, file, nullif(p_mode, ''), left(trim(coalesce(p_caption, '')), 80), p_width, p_height,
    case when chosen is null then 'friends' else 'selected' end, mode_label, mode_icon, mode_color);
  if chosen is not null then insert into public.moment_viewers(moment_id, user_id) select p_id, v from unnest(chosen) v; end if;

  if p_activate_mode then
    insert into public.activity_modes(user_id, mode, updated_at, expires_at)
    values (me, p_mode, now(), now() + make_interval(mins => p_mode_minutes))
    on conflict (user_id) do update set mode = excluded.mode, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
  end if;

  select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into poster from public.profiles p where p.id = me;
  for recipient in select private.moment_audience(p_id) loop
    perform private.emit(recipient, 'moments');
    perform private.notify(recipient, 'moment', 'Ảnh mới · ' || poster, '',
      '/moments/' || me::text || '/' || p_id::text, 'moment:' || p_id::text || ':' || recipient::text);
  end loop;
  perform private.emit(me, 'moments');
end $$;
revoke all on function public.post_moment(uuid,integer,integer,text,text,uuid[],boolean,integer) from public, anon;
grant execute on function public.post_moment(uuid,integer,integer,text,text,uuid[],boolean,integer) to authenticated;

-- The reader returns a mode snapshot with each photo and keeps the same audience/expiry checks.
drop function public.list_moments();
create function public.list_moments()
returns table(
  id uuid, owner_id uuid, owner_name text, owner_avatar_url text, path text, mode text,
  mode_label text, mode_icon text, mode_color text, caption text, width integer, height integer,
  created_at timestamptz, expires_at timestamptz, audience text, seen boolean, my_reaction text,
  views integer, reactions jsonb
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url,
    m.path, m.mode, m.mode_label, m.mode_icon, m.mode_color, m.caption, m.width, m.height,
    m.created_at, m.expires_at, m.audience,
    m.owner_id = (select auth.uid()) or exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = (select auth.uid())),
    (select r.reaction from public.moment_reactions r where r.moment_id = m.id and r.user_id = (select auth.uid())),
    case when m.owner_id = (select auth.uid()) then (select count(*)::integer from public.moment_views v where v.moment_id = m.id) end,
    case when m.owner_id = (select auth.uid()) then coalesce((
      select jsonb_object_agg(x.reaction, x.total)
      from (select r.reaction, count(*) as total from public.moment_reactions r where r.moment_id = m.id group by r.reaction) x
    ), '{}'::jsonb) end
  from public.moments m join public.profiles p on p.id = m.owner_id
  where m.expires_at > now() and private.can_see_moment(m.id, (select auth.uid()))
  order by m.created_at desc
$$;
revoke all on function public.list_moments() from public, anon;
grant execute on function public.list_moments() to authenticated;

-- Move an outstanding grouped notification to the oldest unseen photo it still represents. Keep
-- its existing key so this migration does not create a second inbox row or enqueue another push.
with legacy as (
  select n.id as notification_id, n.dedupe_key, n.user_id, n.category,
    target.owner_id, target.id as moment_id
  from public.notifications n
  join lateral (
    select m.id, m.owner_id
    from public.moments m
    where n.category = 'moment'
      and n.dedupe_key = 'moment:' || m.owner_id::text || ':' || n.user_id::text
      and private.can_see_moment(m.id, n.user_id)
      and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = n.user_id)
    order by m.created_at asc, m.id
    limit 1
  ) target on true
)
update public.notifications n
set action_path = '/moments/' || legacy.owner_id::text || '/' || legacy.moment_id::text
from legacy where n.id = legacy.notification_id;

with legacy as (
  select n.dedupe_key, target.owner_id, target.id as moment_id
  from public.notifications n
  join lateral (
    select m.id, m.owner_id from public.moments m
    where n.category = 'moment'
      and n.dedupe_key = 'moment:' || m.owner_id::text || ':' || n.user_id::text
      and private.can_see_moment(m.id, n.user_id)
      and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = n.user_id)
    order by m.created_at asc, m.id limit 1
  ) target on true
)
update public.reminders r
set payload = jsonb_set(r.payload, '{action_path}', to_jsonb('/moments/' || legacy.owner_id::text || '/' || legacy.moment_id::text), true)
from legacy where r.idempotency_key = legacy.dedupe_key and r.status = 'pending';

-- A photo notification belongs to one photo. Looking at it clears only that notification.
create or replace function private.forget_moment_notes() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reminders r set status = 'canceled'
  where r.category = 'moment' and r.status = 'pending'
    and not exists(select 1 from public.moments m where private.can_see_moment(m.id, r.user_id)
      and r.idempotency_key = 'moment:' || m.id::text || ':' || r.user_id::text)
    and not exists(select 1 from public.moments m where private.can_see_moment(m.id, r.user_id)
      and r.idempotency_key = 'moment:' || m.owner_id::text || ':' || r.user_id::text
      and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = r.user_id));
  delete from public.notifications n
  where n.category = 'moment'
    and not exists(select 1 from public.moments m where private.can_see_moment(m.id, n.user_id)
      and n.dedupe_key = 'moment:' || m.id::text || ':' || n.user_id::text)
    and not exists(select 1 from public.moments m where private.can_see_moment(m.id, n.user_id)
      and n.dedupe_key = 'moment:' || m.owner_id::text || ':' || n.user_id::text
      and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = n.user_id));
  with legacy as (
    select n.id as notification_id, n.dedupe_key, n.user_id, target.owner_id, target.id as moment_id
    from public.notifications n
    join lateral (
      select m.id, m.owner_id from public.moments m
      where n.category = 'moment'
        and n.dedupe_key = 'moment:' || m.owner_id::text || ':' || n.user_id::text
        and private.can_see_moment(m.id, n.user_id)
        and not exists(select 1 from public.moment_views v where v.moment_id = m.id and v.user_id = n.user_id)
      order by m.created_at asc, m.id limit 1
    ) target on true
  )
  update public.notifications n
  set action_path = '/moments/' || legacy.owner_id::text || '/' || legacy.moment_id::text
  from legacy where n.id = legacy.notification_id;
  update public.reminders r set payload = jsonb_set(r.payload, '{action_path}', to_jsonb(n.action_path), true)
  from public.notifications n
  where n.category = 'moment' and r.idempotency_key = n.dedupe_key and r.status = 'pending'
    and n.dedupe_key = 'moment:' || split_part(n.action_path, '/', 3) || ':' || n.user_id::text;
end $$;
select private.forget_moment_notes();

create or replace function public.see_moment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); owner uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select m.owner_id into owner from public.moments m where m.id = p_id;
  if owner is null or not private.can_see_moment(p_id, me) then raise exception 'photo not found'; end if;
  if owner <> me then
    insert into public.moment_views(moment_id, user_id) values (p_id, me) on conflict do nothing;
    if found then
      perform private.emit(owner, 'moments');
      perform private.emit(me, 'moments');
    end if;
    update public.reminders r set status = 'canceled'
    where r.idempotency_key = 'moment:' || p_id::text || ':' || me::text and r.status = 'pending';
    delete from public.notifications n where n.dedupe_key = 'moment:' || p_id::text || ':' || me::text;
    perform private.forget_moment_notes();
    perform private.emit(me, 'notifications');
  end if;
end $$;

create or replace function public.react_to_moment(p_id uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); owner uuid; who text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select m.owner_id into owner from public.moments m where m.id = p_id;
  if owner is null or owner = me or not private.can_see_moment(p_id, me) then raise exception 'photo not found'; end if;
  if p_reaction is not null and p_reaction not in ('heart', 'laugh', 'wow', 'sad', 'fire', 'like') then raise exception 'invalid reaction'; end if;
  insert into public.moment_views(moment_id, user_id) values (p_id, me) on conflict do nothing;
  update public.reminders r set status = 'canceled'
  where r.idempotency_key = 'moment:' || p_id::text || ':' || me::text and r.status = 'pending';
  delete from public.notifications n where n.dedupe_key = 'moment:' || p_id::text || ':' || me::text;
  perform private.forget_moment_notes();
  perform private.emit(me, 'notifications');
  if p_reaction is null then
    delete from public.moment_reactions r where r.moment_id = p_id and r.user_id = me;
  else
    insert into public.moment_reactions(moment_id, user_id, reaction) values (p_id, me, p_reaction)
    on conflict (moment_id, user_id) do update set reaction = excluded.reaction, created_at = now();
    select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into who from public.profiles p where p.id = me;
    perform private.notify(owner, 'moment_reaction', who || ' thả cảm xúc vào ảnh của bạn', '',
      '/moments/' || owner::text || '/' || p_id::text, 'momentreact:' || p_id::text || ':' || me::text);
  end if;
  perform private.emit(owner, 'moments');
  perform private.emit(me, 'moments');
end $$;

revoke all on function public.see_moment(uuid) from public, anon;
grant execute on function public.see_moment(uuid) to authenticated;
revoke all on function public.react_to_moment(uuid,text) from public, anon;
grant execute on function public.react_to_moment(uuid,text) to authenticated;

-- Existing grouped inbox entries were moved to an unseen photo above; new entries and reaction
-- alerts carry the exact photo ID. Existing pushes are not re-sent by this migration.
