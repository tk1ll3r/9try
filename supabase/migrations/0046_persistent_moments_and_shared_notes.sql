-- Keep every posted photo in a durable archive while the active story feed remains time limited.
-- Sharing an archive never widens the audience that was chosen for its story.

create index if not exists moments_archive_order on public.moments(created_at desc, id desc);

create or replace function private.can_see_moment_archive(p_moment_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment_id and (
      m.owner_id = p_user_id
      or (private.can_contact(m.owner_id, p_user_id)
          and (m.audience = 'friends' or exists (
            select 1 from public.moment_viewers v where v.moment_id = m.id and v.user_id = p_user_id
          )))
    )
  )
$$;

create or replace function public.can_read_moment_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    split_part(p_name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1 from public.moments m
      where m.path = p_name and private.can_see_moment_archive(m.id, (select auth.uid()))
    )
  )
$$;

-- No per-day post cap: the advisory lock remains so retries of the same upload stay idempotent.
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

-- The archive is available as soon as a photo is posted. The story feed still filters at 24 hours.
-- Cursor pagination keeps archive size from increasing the first screen's database and image work.
create function public.list_moment_archive(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 30
)
returns table(
  id uuid, owner_id uuid, owner_name text, owner_avatar_url text, path text, mode text,
  mode_label text, mode_icon text, mode_color text, caption text, width integer, height integer,
  created_at timestamptz, expires_at timestamptz, audience text
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.owner_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url,
    m.path, m.mode, m.mode_label, m.mode_icon, m.mode_color, m.caption, m.width, m.height,
    m.created_at, m.expires_at, m.audience
  from public.moments m join public.profiles p on p.id = m.owner_id
  where private.can_see_moment_archive(m.id, (select auth.uid()))
    and (p_before_created_at is null or (m.created_at, m.id) < (p_before_created_at, p_before_id))
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60)
$$;
revoke all on function public.list_moment_archive(timestamptz,uuid,integer) from public, anon;
grant execute on function public.list_moment_archive(timestamptz,uuid,integer) to authenticated;

-- Expiry only removes a photo from the 24-hour story feed. The row and file remain in the archive.
create or replace function private.expire_moments() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.forget_moment_notes();
end $$;

-- Share grants are explicit; legacy notes remain private until the owner shares them.
create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.personal_notes(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete cascade,
  recipient_group_id uuid references public.groups(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  check ((recipient_user_id is not null) <> (recipient_group_id is not null))
);
create unique index note_shares_user_unique on public.note_shares(note_id, recipient_user_id) where recipient_user_id is not null;
create unique index note_shares_group_unique on public.note_shares(note_id, recipient_group_id) where recipient_group_id is not null;
create index note_shares_user_lookup on public.note_shares(recipient_user_id) where recipient_user_id is not null;
create index note_shares_group_lookup on public.note_shares(recipient_group_id) where recipient_group_id is not null;
alter table public.note_shares enable row level security;
revoke all on public.note_shares from anon, authenticated;

create function private.can_read_note(p_note_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.personal_notes n
    where n.id = p_note_id and (
      n.owner_id = p_user_id
      or exists (
        select 1 from public.note_shares s where s.note_id = n.id and (
          (s.recipient_user_id = p_user_id and private.can_contact(n.owner_id, p_user_id))
          or (s.recipient_group_id is not null and public.is_group_member(s.recipient_group_id, p_user_id)
              and exists(select 1 from public.groups g where g.id = s.recipient_group_id and g.archived_at is null))
        )
      )
    )
  )
$$;

create function private.can_edit_note(p_note_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.personal_notes n
    where n.id = p_note_id and (
      n.owner_id = p_user_id
      or exists (
        select 1 from public.note_shares s where s.note_id = n.id and s.permission = 'edit' and (
          (s.recipient_user_id = p_user_id and private.can_contact(n.owner_id, p_user_id))
          or (s.recipient_group_id is not null and public.is_group_member(s.recipient_group_id, p_user_id)
              and exists(select 1 from public.groups g where g.id = s.recipient_group_id and g.archived_at is null))
        )
      )
    )
  )
$$;

create function public.can_read_shared_note(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.can_read_note(p_note_id, (select auth.uid()))
$$;
create function public.can_edit_shared_note(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.can_edit_note(p_note_id, (select auth.uid()))
$$;
revoke all on function public.can_read_shared_note(uuid) from public, anon;
revoke all on function public.can_edit_shared_note(uuid) from public, anon;
grant execute on function public.can_read_shared_note(uuid) to authenticated;
grant execute on function public.can_edit_shared_note(uuid) to authenticated;

create policy notes_shared_read on public.personal_notes for select to authenticated
  using (public.can_read_shared_note(id));
create policy notes_shared_edit on public.personal_notes for update to authenticated
  using (public.can_edit_shared_note(id)) with check (public.can_edit_shared_note(id));

create function public.list_notes_for_me()
returns table(id uuid, title text, body text, owner_id uuid, owner_name text, owner_avatar_url text, updated_at timestamptz, permission text)
language sql stable security definer set search_path = '' as $$
  select n.id, n.title, n.body, n.owner_id,
    coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, n.updated_at,
    case when n.owner_id = (select auth.uid()) then 'owner'
      when private.can_edit_note(n.id, (select auth.uid())) then 'edit' else 'view' end
  from public.personal_notes n join public.profiles p on p.id = n.owner_id
  where private.can_read_note(n.id, (select auth.uid()))
  order by n.updated_at desc, n.id desc
$$;
revoke all on function public.list_notes_for_me() from public, anon;
grant execute on function public.list_notes_for_me() to authenticated;

create function public.list_note_shares(p_note_id uuid)
returns table(id uuid, target_kind text, target_id uuid, target_name text, avatar_url text, permission text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.personal_notes n where n.id = p_note_id and n.owner_id = (select auth.uid())) then
    raise exception 'note not found';
  end if;
  return query
  select s.id, 'person'::text, s.recipient_user_id,
    coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, s.permission
  from public.note_shares s join public.profiles p on p.id = s.recipient_user_id
  where s.note_id = p_note_id and s.recipient_user_id is not null
  union all
  select s.id, 'group'::text, s.recipient_group_id, g.name, g.avatar_url, s.permission
  from public.note_shares s join public.groups g on g.id = s.recipient_group_id
  where s.note_id = p_note_id and s.recipient_group_id is not null
  order by 3;
end $$;
revoke all on function public.list_note_shares(uuid) from public, anon;
grant execute on function public.list_note_shares(uuid) to authenticated;

create function public.share_note(p_note_id uuid, p_user_ids uuid[], p_group_ids uuid[], p_permission text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); target uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_permission not in ('view', 'edit') then raise exception 'invalid permission'; end if;
  if not exists(select 1 from public.personal_notes n where n.id = p_note_id and n.owner_id = me) then raise exception 'note not found'; end if;
  if coalesce(cardinality(p_user_ids), 0) + coalesce(cardinality(p_group_ids), 0) = 0 then raise exception 'choose a person or group'; end if;
  if exists(select 1 from unnest(coalesce(p_user_ids, '{}'::uuid[])) u where u = me or not private.can_contact(me, u)) then
    raise exception 'recipient is not a friend';
  end if;
  if exists(select 1 from unnest(coalesce(p_group_ids, '{}'::uuid[])) g
    where not public.is_group_member(g, me) or exists(select 1 from public.groups x where x.id = g and x.archived_at is not null)) then
    raise exception 'group is unavailable';
  end if;

  foreach target in array coalesce(p_user_ids, '{}'::uuid[]) loop
    insert into public.note_shares(note_id, recipient_user_id, permission) values (p_note_id, target, p_permission)
    on conflict (note_id, recipient_user_id) where recipient_user_id is not null do update set permission = excluded.permission;
    perform private.emit(target, 'notes');
  end loop;
  foreach target in array coalesce(p_group_ids, '{}'::uuid[]) loop
    insert into public.note_shares(note_id, recipient_group_id, permission) values (p_note_id, target, p_permission)
    on conflict (note_id, recipient_group_id) where recipient_group_id is not null do update set permission = excluded.permission;
    perform private.emit(member.user_id, 'notes') from public.group_memberships member where member.group_id = target;
  end loop;
  perform private.emit(me, 'notes');
end $$;
revoke all on function public.share_note(uuid,uuid[],uuid[],text) from public, anon;
grant execute on function public.share_note(uuid,uuid[],uuid[],text) to authenticated;

create function public.revoke_note_share(p_share_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); note uuid; target_user uuid; target_group uuid;
begin
  select n.id, s.recipient_user_id, s.recipient_group_id into note, target_user, target_group
  from public.note_shares s join public.personal_notes n on n.id = s.note_id
  where s.id = p_share_id and n.owner_id = me;
  if note is null then raise exception 'share not found'; end if;
  delete from public.note_shares where id = p_share_id;
  if target_user is not null then perform private.emit(target_user, 'notes'); end if;
  if target_group is not null then
    perform private.emit(member.user_id, 'notes') from public.group_memberships member where member.group_id = target_group;
  end if;
  perform private.emit(me, 'notes');
end $$;
revoke all on function public.revoke_note_share(uuid) from public, anon;
grant execute on function public.revoke_note_share(uuid) to authenticated;

-- Direct note grants are revoked permanently when either person removes the friendship or blocks the other.
create or replace function private.revoke_relationship_grants(a uuid, b uuid) returns void
language sql set search_path = '' as $$
  delete from public.availability_shares s
  where (s.owner_id = a and s.user_id = b) or (s.owner_id = b and s.user_id = a);

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id = s.id
    and ((s.owner_id = a and r.user_id = b) or (s.owner_id = b and r.user_id = a));

  delete from public.event_shares e
  using public.calendar_events c
  where e.event_id = c.id
    and ((c.owner_id = a and e.user_id = b) or (c.owner_id = b and e.user_id = a));

  delete from public.friend_pins p
  where (p.user_id = a and p.friend_id = b) or (p.user_id = b and p.friend_id = a);

  delete from public.presence_viewers v
  where (v.user_id = a and v.viewer_id = b) or (v.user_id = b and v.viewer_id = a);

  delete from public.schedule_grants g
  where (g.owner_id = a and g.viewer_id = b) or (g.owner_id = b and g.viewer_id = a);

  update public.schedule_requests r set status = 'cancelled', responded_at = now()
  where r.status = 'pending' and ((r.owner_id = a and r.requester_id = b) or (r.owner_id = b and r.requester_id = a));

  delete from public.expense_book_members m
  using public.expense_books k
  where k.id = m.book_id and k.group_id is null and m.role <> 'owner'
    and ((k.owner_id = a and m.user_id = b) or (k.owner_id = b and m.user_id = a));

  delete from public.note_shares s
  using public.personal_notes n
  where s.note_id = n.id and s.recipient_user_id is not null
    and ((n.owner_id = a and s.recipient_user_id = b) or (n.owner_id = b and s.recipient_user_id = a));

  select private.emit(a, 'presence');
  select private.emit(b, 'presence');
  select private.emit(a, 'calendar');
  select private.emit(b, 'calendar');
  select private.emit(a, 'expenses');
  select private.emit(b, 'expenses');
  select private.emit(a, 'features');
  select private.emit(b, 'features');
  select private.emit(a, 'notes');
  select private.emit(b, 'notes');
$$;

create function private.emit_note_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare note_id uuid; owner uuid; recipient uuid;
begin
  if tg_op = 'DELETE' then note_id := old.id; owner := old.owner_id;
  else note_id := new.id; owner := new.owner_id; end if;
  perform private.emit(owner, 'notes');
  for recipient in
    select s.recipient_user_id from public.note_shares s
      where s.note_id = note_id and s.recipient_user_id is not null
    union
    select gm.user_id from public.note_shares s join public.group_memberships gm on gm.group_id = s.recipient_group_id
      where s.note_id = note_id and s.recipient_group_id is not null
  loop
    perform private.emit(recipient, 'notes');
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger personal_notes_realtime after insert or update or delete on public.personal_notes
  for each row execute function private.emit_note_change();

-- Archiving a group revokes group-shared notes immediately and refreshes the owner's group list.
create or replace function public.archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group_id and owner_id = me;
  if not found then raise exception 'owner required'; end if;
  perform private.emit(member.user_id, 'groups') from public.group_memberships member where member.group_id = p_group_id;
  perform private.emit(member.user_id, 'notes') from public.group_memberships member where member.group_id = p_group_id;
end $$;
revoke all on function public.archive_group(uuid) from public, anon;
grant execute on function public.archive_group(uuid) to authenticated;

