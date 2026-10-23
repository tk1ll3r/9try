-- A story may show a mutual relationship label, saved as a snapshot so later edits do not rewrite it.
alter table public.moments
  add column relationship_user_id uuid references public.profiles(id) on delete set null,
  add column relationship_label text,
  add constraint moments_relationship_tag_check check (
    (relationship_user_id is null and relationship_label is null)
    or (relationship_user_id is not null and relationship_label is not null and length(trim(relationship_label)) between 1 and 40)
  );

-- Replace the latest posting function so the relationship tag is validated in the same transaction.
drop function public.post_moment(uuid,integer,integer,text,text,uuid[],boolean,integer);
create function public.post_moment(
  p_id uuid,
  p_width integer,
  p_height integer,
  p_mode text default null,
  p_caption text default '',
  p_viewer_ids uuid[] default null,
  p_activate_mode boolean default false,
  p_mode_minutes integer default 120,
  p_relationship_user_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); file text; chosen uuid[]; recipient uuid; poster text;
  mode_label text; mode_icon text; mode_color text; relationship_label text;
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
  if p_relationship_user_id is not null then
    select relationship.relationship into relationship_label
    from public.friend_relationships relationship
    where relationship.user_a_id = least(me, p_relationship_user_id)
      and relationship.user_b_id = greatest(me, p_relationship_user_id)
      and private.can_contact(me, p_relationship_user_id);
    if relationship_label is null then raise exception 'relationship unavailable'; end if;
    if chosen is not null and not (p_relationship_user_id = any(chosen)) then
      raise exception 'relationship person must see the photo';
    end if;
  end if;

  insert into public.moments(id, owner_id, path, mode, caption, width, height, audience, mode_label, mode_icon, mode_color, relationship_user_id, relationship_label)
  values (p_id, me, file, nullif(p_mode, ''), left(trim(coalesce(p_caption, '')), 80), p_width, p_height,
    case when chosen is null then 'friends' else 'selected' end, mode_label, mode_icon, mode_color, p_relationship_user_id, relationship_label);
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
revoke all on function public.post_moment(uuid,integer,integer,text,text,uuid[],boolean,integer,uuid) from public, anon;
grant execute on function public.post_moment(uuid,integer,integer,text,text,uuid[],boolean,integer,uuid) to authenticated;

create function public.list_moment_relationship_tags(p_moment_ids uuid[])
returns table(moment_id uuid, partner_id uuid, partner_name text, relationship text)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select moment.id, moment.relationship_user_id,
      coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng'), moment.relationship_label
    from public.moments moment
    join public.profiles profile on profile.id = moment.relationship_user_id
    where moment.id = any(coalesce(p_moment_ids, '{}'::uuid[]))
      and moment.relationship_user_id is not null
      and private.can_see_moment_archive(moment.id, me);
end $$;
revoke all on function public.list_moment_relationship_tags(uuid[]) from public, anon;
grant execute on function public.list_moment_relationship_tags(uuid[]) to authenticated;
