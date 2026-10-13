-- Count one story post per local calendar day and show a flame badge from a three-day streak.
create table public.moment_post_days (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_day date not null,
  primary key (owner_id, post_day)
);
create index moment_post_days_recent on public.moment_post_days(owner_id, post_day desc);
alter table public.moment_post_days enable row level security;
revoke all on public.moment_post_days from public, anon, authenticated;

-- Give existing archive posts their historical days so a recent streak is not reset at rollout.
insert into public.moment_post_days(owner_id, post_day)
select m.owner_id, (m.created_at at time zone coalesce(p.timezone, 'UTC'))::date
from public.moments m join public.profiles p on p.id = m.owner_id
on conflict do nothing;

create function private.moment_streak_days(p_owner_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with recursive local_today as (
    select (now() at time zone coalesce(p.timezone, 'UTC'))::date as day
    from public.profiles p where p.id = p_owner_id
  ), latest as (
    select max(d.post_day) as day from public.moment_post_days d where d.owner_id = p_owner_id
  ), anchor as (
    select latest.day from latest, local_today where latest.day >= local_today.day - 1
  ), chain(day, streak_count) as (
    select anchor.day, 1 from anchor
    union all
    select d.post_day, chain.streak_count + 1
    from chain join public.moment_post_days d on d.owner_id = p_owner_id and d.post_day = chain.day - 1
  )
  select coalesce(max(chain.streak_count), 0)::integer from chain
$$;
revoke all on function private.moment_streak_days(uuid) from public, anon, authenticated;

create function public.list_moment_streak_badges()
returns table(user_id uuid, streak_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  with audience as (
    select me as user_id
    union
    select case when f.requester_id = me then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and me in (f.requester_id, f.addressee_id)
      and private.can_contact(me, case when f.requester_id = me then f.addressee_id else f.requester_id end)
  )
  select audience.user_id, private.moment_streak_days(audience.user_id)
  from audience
  where private.moment_streak_days(audience.user_id) >= 3;
end $$;
revoke all on function public.list_moment_streak_badges() from public, anon;
grant execute on function public.list_moment_streak_badges() to authenticated;

-- Posting the story and recording its local day are one transaction. Repeating a post that day adds
-- no extra streak day. Keep every existing validation and notification in the current RPC.
create or replace function public.post_moment(
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

  insert into public.moments(id, owner_id, path, mode, caption, width, height, audience, mode_label, mode_icon, mode_color)
  values (p_id, me, file, nullif(p_mode, ''), left(trim(coalesce(p_caption, '')), 80), p_width, p_height,
    case when chosen is null then 'friends' else 'selected' end, mode_label, mode_icon, mode_color);
  insert into public.moment_post_days(owner_id, post_day)
  select me, (now() at time zone coalesce(p.timezone, 'UTC'))::date from public.profiles p where p.id = me
  on conflict do nothing;
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
revoke all on function public.post_moment(uuid, integer, integer, text, text, uuid[], boolean, integer) from public, anon;
grant execute on function public.post_moment(uuid, integer, integer, text, text, uuid[], boolean, integer) to authenticated;
