-- Friend request lifecycle, privacy-preserving availability, and safe meetup discussion projections.

create or replace function public.send_friend_request(p_username text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid; existing_status public.friendship_status;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select p.id into target
  from public.profiles p
  where p.username is not null
    and lower(p.username)=lower(trim(p_username))
    and p.id<>auth.uid()
  limit 1;

  if target is null then raise exception 'user not found'; end if;
  if exists(
    select 1 from public.blocks b
    where (b.blocker_id=auth.uid() and b.blocked_id=target)
       or (b.blocker_id=target and b.blocked_id=auth.uid())
  ) then raise exception 'request unavailable'; end if;

  select f.status into existing_status
  from public.friendships f
  where (f.requester_id=auth.uid() and f.addressee_id=target)
     or (f.requester_id=target and f.addressee_id=auth.uid())
  limit 1;

  if existing_status in ('pending','accepted') then raise exception 'friendship already exists'; end if;

  delete from public.friendships
  where (requester_id=auth.uid() and addressee_id=target)
     or (requester_id=target and addressee_id=auth.uid());

  insert into public.friendships(requester_id,addressee_id,status)
  values(auth.uid(),target,'pending');

  insert into public.notifications(user_id,category,title,body,action_path)
  values(target,'friend_request','Lời mời kết bạn','Có người muốn kết nối với bạn.','/me/friends');

  return target;
end $$;

create or replace function public.cancel_friend_request(p_addressee_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.friendships
  set status='canceled',responded_at=now()
  where requester_id=auth.uid()
    and addressee_id=p_addressee_id
    and status='pending';

  if not found then raise exception 'pending request not found'; end if;
end $$;

create table public.availability_shares(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  check((user_id is not null)::int + (group_id is not null)::int = 1)
);

create unique index availability_share_user_unique
on public.availability_shares(owner_id,user_id)
where user_id is not null;

create unique index availability_share_group_unique
on public.availability_shares(owner_id,group_id)
where group_id is not null;

alter table public.availability_shares enable row level security;

create policy availability_owner_manage on public.availability_shares
for all to authenticated
using(owner_id=auth.uid())
with check(owner_id=auth.uid());

create or replace function public.set_user_availability_share(p_user_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.friendships f
    where f.status='accepted'
      and (
        (f.requester_id=auth.uid() and f.addressee_id=p_user_id)
        or (f.requester_id=p_user_id and f.addressee_id=auth.uid())
      )
  ) then raise exception 'friendship required'; end if;

  if p_enabled then
    insert into public.availability_shares(owner_id,user_id)
    values(auth.uid(),p_user_id)
    on conflict(owner_id,user_id) where user_id is not null do nothing;
  else
    delete from public.availability_shares
    where owner_id=auth.uid() and user_id=p_user_id;
  end if;
end $$;

create or replace function public.set_group_availability_share(p_group_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.is_group_member(p_group_id,auth.uid()) then raise exception 'group membership required'; end if;

  if p_enabled then
    insert into public.availability_shares(owner_id,group_id)
    values(auth.uid(),p_group_id)
    on conflict(owner_id,group_id) where group_id is not null do nothing;
  else
    delete from public.availability_shares
    where owner_id=auth.uid() and group_id=p_group_id;
  end if;
end $$;

create or replace function public.get_shared_busy(
  p_owner_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  event_kind text,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end_exclusive date
)
language plpgsql stable security definer set search_path=public as $$
begin
  if p_to<=p_from or p_to>p_from+interval '90 days' then raise exception 'invalid range'; end if;

  if p_owner_id<>auth.uid()
    and not exists(
      select 1
      from public.availability_shares s
      where s.owner_id=p_owner_id
        and (
          s.user_id=auth.uid()
          or (
            s.group_id is not null
            and public.is_group_member(s.group_id,auth.uid())
            and public.is_group_member(s.group_id,p_owner_id)
          )
        )
    )
  then raise exception 'availability not shared'; end if;

  return query
  select e.event_kind,e.start_at,e.end_at,e.all_day_start,e.all_day_end_exclusive
  from public.calendar_events e
  where e.owner_id=p_owner_id
    and (
      (e.event_kind='timed' and e.start_at<p_to and e.end_at>p_from)
      or
      (e.event_kind='all_day' and e.all_day_start<p_to::date and e.all_day_end_exclusive>p_from::date)
    )
  order by coalesce(e.start_at,e.all_day_start::timestamptz);
end $$;

create or replace function public.list_meetup_comments(p_meetup_id uuid)
returns table(
  id uuid,
  body text,
  created_at timestamptz,
  author_id uuid,
  author_display_name text,
  author_username text,
  author_avatar_url text
)
language sql stable security definer set search_path=public as $$
  select c.id,c.body,c.created_at,p.id,p.display_name,p.username,p.avatar_url
  from public.meetup_comments c
  join public.profiles p on p.id=c.author_id
  where c.meetup_id=p_meetup_id
    and exists(
      select 1 from public.meetups m
      where m.id=p_meetup_id
        and (
          m.organizer_id=auth.uid()
          or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid())
        )
    )
  order by c.created_at asc
$$;

create or replace function public.update_meetup_details(
  p_meetup_id uuid,
  p_title text,
  p_description text,
  p_location_name text default null,
  p_meeting_url text default null,
  p_capacity integer default null
) returns void
language plpgsql security definer set search_path=public as $$
declare old_title text;
begin
  select title into old_title
  from public.meetups
  where id=p_meetup_id
    and organizer_id=auth.uid()
    and status not in ('canceled','completed')
  for update;

  if old_title is null then raise exception 'organizer required'; end if;
  if length(trim(p_title))<1 or length(trim(p_title))>160 then raise exception 'invalid title'; end if;
  if p_capacity is not null and p_capacity<1 then raise exception 'invalid capacity'; end if;

  update public.meetups
  set title=trim(p_title),
      description=coalesce(p_description,''),
      location_name=nullif(trim(coalesce(p_location_name,'')),''),
      meeting_url=nullif(trim(coalesce(p_meeting_url,'')),''),
      capacity=p_capacity
  where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Hoạt động có thay đổi',trim(p_title),'/meetups'
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;

grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.set_user_availability_share(uuid,boolean) to authenticated;
grant execute on function public.set_group_availability_share(uuid,boolean) to authenticated;
grant execute on function public.get_shared_busy(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.list_meetup_comments(uuid) to authenticated;
grant execute on function public.update_meetup_details(uuid,text,text,text,text,integer) to authenticated;
