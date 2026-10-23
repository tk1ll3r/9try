-- Private friend-to-friend links and a feedback inbox for the account named tk1ll3r.
create table public.friend_relationship_edges (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null check (length(trim(relationship)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (owner_id <> user_a_id and owner_id <> user_b_id)
);
alter table public.friend_relationship_edges enable row level security;
revoke all on table public.friend_relationship_edges from public, anon, authenticated;

create function public.list_friend_relationships()
returns table(user_a_id uuid, user_b_id uuid, relationship text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select edge.user_a_id, edge.user_b_id, edge.relationship, edge.updated_at
    from public.friend_relationship_edges edge
    where edge.owner_id = me
      and private.can_contact(me, edge.user_a_id)
      and private.can_contact(me, edge.user_b_id)
    order by edge.updated_at desc;
end $$;

create function public.set_friend_relationship(p_user_a_id uuid, p_user_b_id uuid, p_relationship text)
returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); left_id uuid; right_id uuid; label text := trim(coalesce(p_relationship, ''));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user_a_id is null or p_user_b_id is null or p_user_a_id = p_user_b_id then raise exception 'choose two different friends'; end if;
  if length(label) not between 1 and 40 then raise exception 'relationship label must be 1 to 40 characters'; end if;
  if not private.can_contact(me, p_user_a_id) or not private.can_contact(me, p_user_b_id) then raise exception 'both people must be your friends'; end if;

  if p_user_a_id < p_user_b_id then left_id := p_user_a_id; right_id := p_user_b_id;
  else left_id := p_user_b_id; right_id := p_user_a_id; end if;

  insert into public.friend_relationship_edges(owner_id, user_a_id, user_b_id, relationship)
  values (me, left_id, right_id, label)
  on conflict (owner_id, user_a_id, user_b_id) do update
    set relationship = excluded.relationship, updated_at = now();
  perform private.emit(me, 'friends');
end $$;

create function public.remove_friend_relationship(p_user_a_id uuid, p_user_b_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); left_id uuid; right_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_user_a_id is null or p_user_b_id is null or p_user_a_id = p_user_b_id then raise exception 'choose two different friends'; end if;
  if p_user_a_id < p_user_b_id then left_id := p_user_a_id; right_id := p_user_b_id;
  else left_id := p_user_b_id; right_id := p_user_a_id; end if;
  delete from public.friend_relationship_edges edge
  where edge.owner_id = me and edge.user_a_id = left_id and edge.user_b_id = right_id;
  perform private.emit(me, 'friends');
end $$;

create table public.admin_feedback (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 3000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index admin_feedback_recipient_created_idx on public.admin_feedback(recipient_id, created_at desc);
alter table public.admin_feedback enable row level security;
revoke all on table public.admin_feedback from public, anon, authenticated;

create function public.is_feedback_recipient()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select auth.uid()) and lower(profile.username) = 'tk1ll3r'
  )
$$;

create function public.submit_admin_feedback(p_message text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); admin_id uuid; feedback_id uuid; sender_name text; body text := trim(coalesce(p_message, ''));
begin
  if me is null then raise exception 'not authenticated'; end if;
  if length(body) not between 1 and 3000 then raise exception 'feedback must be 1 to 3000 characters'; end if;
  select profile.id into admin_id from public.profiles profile
  where lower(profile.username) = 'tk1ll3r'
  order by profile.id limit 1;
  if admin_id is null then raise exception 'feedback recipient not found'; end if;

  insert into public.admin_feedback(sender_id, recipient_id, message)
  values (me, admin_id, body) returning id into feedback_id;
  select coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng') into sender_name
  from public.profiles profile where profile.id = me;
  perform private.notify(admin_id, 'admin_feedback', 'Góp ý mới', coalesce(sender_name, 'Người dùng'), '/feedback', 'admin-feedback:' || feedback_id::text);
  return feedback_id;
end $$;

create function public.list_admin_feedback()
returns table(id uuid, sender_id uuid, sender_name text, sender_username text, sender_avatar_url text, message text, created_at timestamptz, read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_feedback_recipient() then raise exception 'admin required'; end if;
  return query
    select feedback.id, feedback.sender_id,
      coalesce(nullif(sender.display_name, ''), sender.username, 'Người dùng'), sender.username, sender.avatar_url,
      feedback.message, feedback.created_at, feedback.read_at
    from public.admin_feedback feedback
    join public.profiles sender on sender.id = feedback.sender_id
    where feedback.recipient_id = (select auth.uid())
    order by feedback.created_at desc
    limit 100;
end $$;

create function public.mark_admin_feedback_read(p_feedback_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_feedback_recipient() then raise exception 'admin required'; end if;
  update public.admin_feedback
  set read_at = coalesce(read_at, now())
  where id = p_feedback_id and recipient_id = (select auth.uid());
  if not found then raise exception 'feedback not found'; end if;
end $$;

revoke all on function public.list_friend_relationships() from public, anon;
revoke all on function public.set_friend_relationship(uuid,uuid,text) from public, anon;
revoke all on function public.remove_friend_relationship(uuid,uuid) from public, anon;
revoke all on function public.is_feedback_recipient() from public, anon;
revoke all on function public.submit_admin_feedback(text) from public, anon;
revoke all on function public.list_admin_feedback() from public, anon;
revoke all on function public.mark_admin_feedback_read(uuid) from public, anon;
grant execute on function public.list_friend_relationships() to authenticated;
grant execute on function public.set_friend_relationship(uuid,uuid,text) to authenticated;
grant execute on function public.remove_friend_relationship(uuid,uuid) to authenticated;
grant execute on function public.is_feedback_recipient() to authenticated;
grant execute on function public.submit_admin_feedback(text) to authenticated;
grant execute on function public.list_admin_feedback() to authenticated;
grant execute on function public.mark_admin_feedback_read(uuid) to authenticated;

-- Album filters keep the existing all-photos RPC intact and use separate endpoints for complete per-person pagination.
create function public.list_moment_archive_people()
returns table(owner_id uuid, owner_name text, owner_avatar_url text, photo_count bigint)
language sql stable security definer set search_path = '' as $$
  select m.owner_id, coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng'), profile.avatar_url, count(*)
  from public.moments m
  join public.profiles profile on profile.id = m.owner_id
  where private.can_see_moment_archive(m.id, (select auth.uid()))
  group by m.owner_id, profile.display_name, profile.username, profile.avatar_url
  order by max(m.created_at) desc
$$;

create function public.list_moment_archive_for_owner(
  p_owner_id uuid,
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
  select m.id, m.owner_id, coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng'), profile.avatar_url,
    m.path, m.mode, m.mode_label, m.mode_icon, m.mode_color, m.caption, m.width, m.height,
    m.created_at, m.expires_at, m.audience
  from public.moments m
  join public.profiles profile on profile.id = m.owner_id
  where m.owner_id = p_owner_id
    and private.can_see_moment_archive(m.id, (select auth.uid()))
    and (p_before_created_at is null or (m.created_at, m.id) < (p_before_created_at, p_before_id))
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 60)
$$;
revoke all on function public.list_moment_archive_people() from public, anon;
revoke all on function public.list_moment_archive_for_owner(uuid,timestamptz,uuid,integer) from public, anon;
grant execute on function public.list_moment_archive_people() to authenticated;
grant execute on function public.list_moment_archive_for_owner(uuid,timestamptz,uuid,integer) to authenticated;
