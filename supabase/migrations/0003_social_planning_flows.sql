-- Harden social/planning writes behind narrow RPCs and add atomic flows.

create unique index if not exists profiles_username_ci_unique
on public.profiles(lower(username)) where username is not null;

drop policy if exists memberships_admin_write on public.group_memberships;
drop policy if exists invitee_self_update on public.meetup_invitees;
drop policy if exists votes_self on public.meetup_votes;
drop policy if exists comments_write on public.meetup_comments;

create policy meetup_votes_read on public.meetup_votes for select to authenticated using(
  exists(
    select 1
    from public.meetup_time_options o
    join public.meetups m on m.id=o.meetup_id
    where o.id=option_id
      and (
        m.organizer_id=auth.uid()
        or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid())
      )
  )
);

create policy comments_write on public.meetup_comments for insert to authenticated with check(
  author_id=auth.uid()
  and exists(
    select 1 from public.meetups m
    where m.id=meetup_id
      and (
        m.organizer_id=auth.uid()
        or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid())
      )
  )
);

create or replace function public.find_profile_by_username(p_username text)
returns table(id uuid, display_name text, username text, avatar_url text)
language sql stable security definer set search_path=public as $$
  select p.id,p.display_name,p.username,p.avatar_url
  from public.profiles p
  where p.username is not null
    and lower(p.username)=lower(trim(p_username))
    and p.id<>auth.uid()
    and not exists(
      select 1 from public.blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=p.id)
         or (b.blocker_id=p.id and b.blocked_id=auth.uid())
    )
  limit 1
$$;

create or replace function public.list_friend_connections()
returns table(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  direction text,
  status public.friendship_status,
  created_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select
    case when f.requester_id=auth.uid() then f.addressee_id else f.requester_id end,
    p.display_name,p.username,p.avatar_url,
    case when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end,
    f.status,f.created_at
  from public.friendships f
  join public.profiles p
    on p.id=case when f.requester_id=auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id,f.addressee_id)
    and not exists(
      select 1 from public.blocks b
      where (b.blocker_id=auth.uid() and b.blocked_id=p.id)
         or (b.blocker_id=p.id and b.blocked_id=auth.uid())
    )
  order by f.created_at desc
$$;

create or replace function public.send_friend_request(p_username text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select p.id into target from public.profiles p
  where p.username is not null and lower(p.username)=lower(trim(p_username)) and p.id<>auth.uid()
  limit 1;
  if target is null then raise exception 'user not found'; end if;

  if exists(select 1 from public.blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=target)
    or (b.blocker_id=target and b.blocked_id=auth.uid()))
  then raise exception 'request unavailable'; end if;

  if exists(select 1 from public.friendships f where
    (f.requester_id=auth.uid() and f.addressee_id=target)
    or (f.requester_id=target and f.addressee_id=auth.uid()))
  then raise exception 'friendship already exists'; end if;

  insert into public.friendships(requester_id,addressee_id,status)
  values(auth.uid(),target,'pending');

  insert into public.notifications(user_id,category,title,body,action_path)
  values(target,'friend_request','Lời mời kết bạn','Có người muốn kết nối với bạn.','/me/friends');

  return target;
end $$;

create or replace function public.respond_friend_request(p_requester_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path=public as $$
declare next_status public.friendship_status;
begin
  next_status:=case when p_accept then 'accepted'::public.friendship_status else 'declined'::public.friendship_status end;

  update public.friendships
  set status=next_status,responded_at=now()
  where requester_id=p_requester_id and addressee_id=auth.uid() and status='pending';

  if not found then raise exception 'pending request not found'; end if;

  if p_accept then
    insert into public.notifications(user_id,category,title,body,action_path)
    values(auth.uid(),'friend_request','Đã kết bạn','Hai bạn đã có thể lên kế hoạch cùng nhau.','/me/friends');
    insert into public.notifications(user_id,category,title,body,action_path)
    values(p_requester_id,'friend_request','Lời mời đã được chấp nhận','Hai bạn đã kết nối.','/me/friends');
  end if;
end $$;

create or replace function public.remove_friend(p_other_id uuid) returns void
language sql security definer set search_path=public as $$
  delete from public.friendships
  where status='accepted' and (
    (requester_id=auth.uid() and addressee_id=p_other_id)
    or (requester_id=p_other_id and addressee_id=auth.uid())
  )
$$;

create or replace function public.create_group_invite(
  p_group_id uuid,
  p_expires_minutes integer default 10080,
  p_max_uses integer default 1
)
returns table(token text,expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare raw_token text; expiry timestamptz;
begin
  if not public.is_group_admin(p_group_id,auth.uid()) then raise exception 'admin required'; end if;
  if p_expires_minutes<5 or p_expires_minutes>43200 then raise exception 'invalid expiry'; end if;
  if p_max_uses<1 or p_max_uses>100 then raise exception 'invalid max uses'; end if;

  raw_token:=encode(gen_random_bytes(24),'hex');
  expiry:=now()+make_interval(mins=>p_expires_minutes);

  insert into public.group_invites(group_id,created_by,token_hash,max_uses,expires_at)
  values(p_group_id,auth.uid(),encode(digest(raw_token,'sha256'),'hex'),p_max_uses,expiry);

  return query select raw_token,expiry;
end $$;

create or replace function public.claim_group_invite(p_token text) returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.group_invites%rowtype; inserted_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into inv
  from public.group_invites
  where token_hash=encode(digest(trim(p_token),'sha256'),'hex')
  for update;

  if inv.id is null then raise exception 'invite not found'; end if;
  if inv.revoked_at is not null then raise exception 'invite revoked'; end if;
  if inv.expires_at<=now() then raise exception 'invite expired'; end if;
  if inv.use_count>=inv.max_uses then raise exception 'invite exhausted'; end if;

  insert into public.group_memberships(group_id,user_id,role)
  values(inv.group_id,auth.uid(),'member')
  on conflict do nothing;
  get diagnostics inserted_count=row_count;

  if inserted_count>0 then
    update public.group_invites set use_count=use_count+1 where id=inv.id;
    update public.groups set member_count=member_count+1 where id=inv.group_id;
  end if;

  return inv.group_id;
end $$;

create or replace function public.revoke_group_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare gid uuid;
begin
  select group_id into gid from public.group_invites where id=p_invite_id;
  if gid is null or not public.is_group_admin(gid,auth.uid()) then raise exception 'admin required'; end if;
  update public.group_invites set revoked_at=coalesce(revoked_at,now()) where id=p_invite_id;
end $$;

create or replace function public.transfer_group_ownership(p_group_id uuid,p_new_owner_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.groups where id=p_group_id and owner_id=auth.uid()) then raise exception 'owner required'; end if;
  if not public.is_group_member(p_group_id,p_new_owner_id) then raise exception 'new owner must be a member'; end if;

  update public.group_memberships set role='admin' where group_id=p_group_id and user_id=auth.uid();
  update public.group_memberships set role='owner' where group_id=p_group_id and user_id=p_new_owner_id;
  update public.groups set owner_id=p_new_owner_id where id=p_group_id;
end $$;

create or replace function public.remove_group_member(p_group_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare actor_role public.group_role; target_role public.group_role;
begin
  select role into actor_role from public.group_memberships where group_id=p_group_id and user_id=auth.uid();
  select role into target_role from public.group_memberships where group_id=p_group_id and user_id=p_user_id;
  if actor_role not in ('owner','admin') then raise exception 'admin required'; end if;
  if target_role='owner' then raise exception 'transfer ownership first'; end if;
  if actor_role='admin' and target_role='admin' then raise exception 'owner required'; end if;

  delete from public.group_memberships where group_id=p_group_id and user_id=p_user_id;
  if found then update public.groups set member_count=greatest(1,member_count-1) where id=p_group_id; end if;
end $$;

create or replace function public.create_meetup(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_capacity integer default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id,auth.uid()) then raise exception 'group membership required'; end if;
  if p_capacity is not null and p_capacity<1 then raise exception 'invalid capacity'; end if;

  insert into public.meetups(group_id,organizer_id,title,description,status,timezone,capacity)
  values(p_group_id,auth.uid(),trim(p_title),coalesce(p_description,''),'proposed',p_timezone,p_capacity)
  returning id into mid;

  insert into public.meetup_invitees(meetup_id,user_id,rsvp_status,responded_at)
  values(mid,auth.uid(),'going',now());

  return mid;
end $$;

create or replace function public.invite_to_meetup(p_meetup_id uuid,p_username text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid; meetup_title text;
begin
  select title into meetup_title from public.meetups where id=p_meetup_id and organizer_id=auth.uid();
  if meetup_title is null then raise exception 'organizer required'; end if;

  select id into target from public.profiles
  where username is not null and lower(username)=lower(trim(p_username)) and id<>auth.uid()
  limit 1;
  if target is null then raise exception 'user not found'; end if;

  if exists(select 1 from public.blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=target)
    or (b.blocker_id=target and b.blocked_id=auth.uid()))
  then raise exception 'invite unavailable'; end if;

  insert into public.meetup_invitees(meetup_id,user_id,rsvp_status)
  values(p_meetup_id,target,'pending')
  on conflict do nothing;

  insert into public.notifications(user_id,category,title,body,action_path)
  values(target,'meetup_invite','Lời mời hoạt động',meetup_title,'/meetups');

  return target;
end $$;

create or replace function public.create_meetup_time_option(
  p_meetup_id uuid,p_starts_at timestamptz,p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path=public as $$
declare oid uuid;
begin
  if p_ends_at<=p_starts_at then raise exception 'invalid time range'; end if;
  if not exists(select 1 from public.meetups where id=p_meetup_id and organizer_id=auth.uid() and status not in ('canceled','completed'))
  then raise exception 'organizer required'; end if;

  insert into public.meetup_time_options(meetup_id,starts_at,ends_at)
  values(p_meetup_id,p_starts_at,p_ends_at) returning id into oid;
  return oid;
end $$;

create or replace function public.vote_meetup_time(p_option_id uuid,p_available boolean) returns void
language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
  select meetup_id into mid from public.meetup_time_options where id=p_option_id;
  if mid is null or not exists(
    select 1 from public.meetups m
    where m.id=mid and (
      m.organizer_id=auth.uid()
      or exists(select 1 from public.meetup_invitees i where i.meetup_id=mid and i.user_id=auth.uid())
    )
  ) then raise exception 'not invited'; end if;

  insert into public.meetup_votes(option_id,user_id,available)
  values(p_option_id,auth.uid(),p_available)
  on conflict(option_id,user_id) do update set available=excluded.available;
end $$;

create or replace function public.get_meetup_poll_summary(p_meetup_id uuid)
returns table(option_id uuid,starts_at timestamptz,ends_at timestamptz,available_count bigint,total_votes bigint,my_vote boolean)
language sql stable security definer set search_path=public as $$
  select o.id,o.starts_at,o.ends_at,
    count(v.*) filter(where v.available),
    count(v.*),
    max(v.available::int) filter(where v.user_id=auth.uid())::boolean
  from public.meetup_time_options o
  left join public.meetup_votes v on v.option_id=o.id
  where o.meetup_id=p_meetup_id
    and exists(
      select 1 from public.meetups m
      where m.id=p_meetup_id and (
        m.organizer_id=auth.uid()
        or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid())
      )
    )
  group by o.id,o.starts_at,o.ends_at
  order by o.starts_at
$$;

create or replace function public.respond_meetup_rsvp(p_meetup_id uuid,p_response text) returns void
language plpgsql security definer set search_path=public as $$
declare cap integer; mstatus public.meetup_status; current_rsvp public.rsvp_status; going_count integer; organizer uuid; meetup_title text;
begin
  if p_response not in ('going','maybe','declined') then raise exception 'invalid response'; end if;

  select capacity,status,organizer_id,title into cap,mstatus,organizer,meetup_title
  from public.meetups where id=p_meetup_id for update;
  if mstatus is null then raise exception 'meetup not found'; end if;
  if mstatus in ('canceled','completed') then raise exception 'meetup closed'; end if;

  select rsvp_status into current_rsvp
  from public.meetup_invitees where meetup_id=p_meetup_id and user_id=auth.uid()
  for update;
  if current_rsvp is null then raise exception 'not invited'; end if;

  if p_response='going' and current_rsvp<>'going' and cap is not null then
    select count(*) into going_count from public.meetup_invitees where meetup_id=p_meetup_id and rsvp_status='going';
    if going_count>=cap then raise exception 'capacity reached'; end if;
  end if;

  update public.meetup_invitees
  set rsvp_status=p_response::public.rsvp_status,responded_at=now()
  where meetup_id=p_meetup_id and user_id=auth.uid();

  if organizer<>auth.uid() then
    insert into public.notifications(user_id,category,title,body,action_path)
    values(organizer,'rsvp_update','Cập nhật tham gia',meetup_title,'/meetups');
  end if;
end $$;

create or replace function public.confirm_meetup_time(p_meetup_id uuid,p_option_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s timestamptz; e timestamptz; meetup_title text;
begin
  select title into meetup_title from public.meetups where id=p_meetup_id and organizer_id=auth.uid();
  if meetup_title is null then raise exception 'organizer required'; end if;
  select starts_at,ends_at into s,e from public.meetup_time_options where id=p_option_id and meetup_id=p_meetup_id;
  if s is null then raise exception 'option not found'; end if;

  update public.meetups set start_at=s,end_at=e,status='confirmed' where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Đã chốt thời gian',meetup_title,'/meetups'
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;

create or replace function public.stop_location_session(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.location_sessions
  set stopped_at=coalesce(stopped_at,now())
  where id=p_session_id and owner_id=auth.uid();
  if found then delete from public.location_positions where session_id=p_session_id; end if;
end $$;

grant execute on function public.find_profile_by_username(text) to authenticated;
grant execute on function public.list_friend_connections() to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.create_group_invite(uuid,integer,integer) to authenticated;
grant execute on function public.claim_group_invite(text) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid,uuid) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.create_meetup(uuid,text,text,text,integer) to authenticated;
grant execute on function public.invite_to_meetup(uuid,text) to authenticated;
grant execute on function public.create_meetup_time_option(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.vote_meetup_time(uuid,boolean) to authenticated;
grant execute on function public.get_meetup_poll_summary(uuid) to authenticated;
grant execute on function public.respond_meetup_rsvp(uuid,text) to authenticated;
grant execute on function public.confirm_meetup_time(uuid,uuid) to authenticated;
