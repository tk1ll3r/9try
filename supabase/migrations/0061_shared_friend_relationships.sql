-- A shared relationship exists only after both friends agree to the same proposal.
create table public.friend_relationship_invites (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null check (length(trim(relationship)) between 1 and 40),
  status text not null default 'pending' check (status in ('pending','accepted','declined','canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
create index friend_relationship_invites_inbox on public.friend_relationship_invites(recipient_id, created_at desc) where status = 'pending';
create index friend_relationship_invites_outbox on public.friend_relationship_invites(requester_id, created_at desc) where status = 'pending';
create unique index friend_relationship_invites_one_pending_pair
  on public.friend_relationship_invites(least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status = 'pending';

create table public.friend_relationships (
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null check (length(trim(relationship)) between 1 and 40),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (created_by in (user_a_id, user_b_id))
);
alter table public.friend_relationship_invites enable row level security;
alter table public.friend_relationships enable row level security;
revoke all on table public.friend_relationship_invites, public.friend_relationships from public, anon, authenticated;

create function public.send_friend_relationship_invite(p_friend_id uuid, p_relationship text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  invite_id uuid;
  label text := trim(coalesce(p_relationship, ''));
  friend_name text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_friend_id is null or p_friend_id = me then raise exception 'choose a different friend'; end if;
  if length(label) not between 1 and 40 then raise exception 'relationship label must be 1 to 40 characters'; end if;
  if not private.can_contact(me, p_friend_id) then raise exception 'both people must be your friends'; end if;
  if exists (
    select 1 from public.friend_relationships relationship
    where relationship.user_a_id = least(me, p_friend_id) and relationship.user_b_id = greatest(me, p_friend_id)
  ) then raise exception 'relationship already exists'; end if;
  if exists (
    select 1 from public.friend_relationship_invites invite
    where invite.status = 'pending'
      and least(invite.requester_id, invite.recipient_id) = least(me, p_friend_id)
      and greatest(invite.requester_id, invite.recipient_id) = greatest(me, p_friend_id)
  ) then raise exception 'relationship invite already pending'; end if;

  insert into public.friend_relationship_invites(requester_id, recipient_id, relationship)
  values (me, p_friend_id, label) returning id into invite_id;
  select private.display_name_of(me) into friend_name;
  perform private.notify(p_friend_id, 'friend_request', coalesce(friend_name, 'Một người bạn') || ' đề nghị quan hệ', label,
    '/me/relationships?invite=' || invite_id::text, 'relationship-invite:' || invite_id::text);
  perform private.emit(p_friend_id, 'friends');
  perform private.emit(me, 'friends');
  return invite_id;
end $$;

create function public.list_friend_relationship_invites()
returns table(id uuid, other_user_id uuid, other_name text, other_avatar_url text, direction text, relationship text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select invite.id,
      case when invite.recipient_id = me then invite.requester_id else invite.recipient_id end,
      coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng'), profile.avatar_url,
      case when invite.recipient_id = me then 'incoming' else 'outgoing' end,
      invite.relationship, invite.created_at
    from public.friend_relationship_invites invite
    join public.profiles profile on profile.id = case when invite.recipient_id = me then invite.requester_id else invite.recipient_id end
    where me in (invite.requester_id, invite.recipient_id)
      and invite.status = 'pending'
      and private.can_contact(me, case when invite.recipient_id = me then invite.requester_id else invite.recipient_id end)
    order by invite.created_at desc;
end $$;

create function public.respond_friend_relationship_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  proposal public.friend_relationship_invites%rowtype;
  next_status text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into proposal from public.friend_relationship_invites invite
  where invite.id = p_invite_id and invite.recipient_id = me and invite.status = 'pending' for update;
  if proposal.id is null then raise exception 'relationship invitation not found'; end if;
  if not private.can_contact(me, proposal.requester_id) then raise exception 'both people must be your friends'; end if;

  if p_accept then
    insert into public.friend_relationships(user_a_id, user_b_id, relationship, created_by)
    values (least(me, proposal.requester_id), greatest(me, proposal.requester_id), proposal.relationship, proposal.requester_id);
    next_status := 'accepted';
  else
    next_status := 'declined';
  end if;
  update public.friend_relationship_invites set status = next_status, responded_at = now() where id = proposal.id;
  if p_accept then
    perform private.notify(proposal.requester_id, 'friend_request', 'Đã đồng ý lời mời quan hệ', proposal.relationship,
      '/me/relationships', 'relationship-accepted:' || proposal.id::text);
  else
    perform private.notify(proposal.requester_id, 'friend_request', 'Lời mời quan hệ bị từ chối', '',
      '/me/relationships', 'relationship-declined:' || proposal.id::text);
  end if;
  perform private.emit(proposal.requester_id, 'friends');
  perform private.emit(me, 'friends');
end $$;

create function public.cancel_friend_relationship_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); other_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.friend_relationship_invites invite set status = 'canceled', responded_at = now()
  where invite.id = p_invite_id and invite.requester_id = me and invite.status = 'pending'
  returning invite.recipient_id into other_id;
  if not found then raise exception 'relationship invitation not found'; end if;
  perform private.emit(other_id, 'friends');
  perform private.emit(me, 'friends');
end $$;

create function public.list_my_friend_relationships()
returns table(friend_id uuid, friend_name text, friend_avatar_url text, relationship text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    select case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end,
      coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng'), profile.avatar_url,
      relationship.relationship, relationship.created_at
    from public.friend_relationships relationship
    join public.profiles profile on profile.id = case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end
    where me in (relationship.user_a_id, relationship.user_b_id)
      and private.can_contact(me, case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end)
    order by relationship.created_at desc;
end $$;

revoke all on function public.send_friend_relationship_invite(uuid,text) from public, anon;
revoke all on function public.list_friend_relationship_invites() from public, anon;
revoke all on function public.respond_friend_relationship_invite(uuid,boolean) from public, anon;
revoke all on function public.cancel_friend_relationship_invite(uuid) from public, anon;
revoke all on function public.list_my_friend_relationships() from public, anon;
grant execute on function public.send_friend_relationship_invite(uuid,text) to authenticated;
grant execute on function public.list_friend_relationship_invites() to authenticated;
grant execute on function public.respond_friend_relationship_invite(uuid,boolean) to authenticated;
grant execute on function public.cancel_friend_relationship_invite(uuid) to authenticated;
grant execute on function public.list_my_friend_relationships() to authenticated;
