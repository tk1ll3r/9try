create extension if not exists pgcrypto;

create type public.group_role as enum ('owner','admin','member');
create type public.friendship_status as enum ('pending','accepted','declined','canceled');
create type public.meetup_status as enum ('draft','proposed','confirmed','canceled','completed');
create type public.rsvp_status as enum ('pending','going','maybe','declined');
create type public.visibility_mode as enum ('only_me','selected_friends','group','public');
create type public.task_priority as enum ('low','medium','high');

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  username text unique,
  avatar_url text,
  bio text,
  birthday date,
  interests text[] not null default '{}',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  profile_visibility jsonb not null default '{"birthday":"private","bio":"friends","interests":"friends"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friendships(
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key(requester_id,addressee_id),
  check(requester_id<>addressee_id)
);

create table public.blocks(
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id<>blocked_id)
);

create table public.groups(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '',
  avatar_url text,
  archived_at timestamptz,
  member_count integer not null default 1 check(member_count>=1),
  created_at timestamptz not null default now()
);

create table public.group_memberships(
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null,
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);

create table public.group_invites(
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  token_hash text not null unique,
  max_uses integer not null default 1 check(max_uses>=1),
  use_count integer not null default 0 check(use_count>=0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(use_count<=max_uses)
);

create table public.meetups(
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  organizer_id uuid not null references public.profiles(id),
  title text not null check(length(trim(title)) between 1 and 160),
  description text not null default '',
  status public.meetup_status not null default 'draft',
  timezone text not null,
  start_at timestamptz,
  end_at timestamptz,
  location_name text,
  location_address text,
  meeting_url text,
  capacity integer check(capacity is null or capacity>0),
  response_deadline timestamptz,
  created_at timestamptz not null default now(),
  check(end_at is null or start_at is null or end_at>start_at)
);

create table public.meetup_invitees(
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rsvp_status public.rsvp_status not null default 'pending',
  responded_at timestamptz,
  primary key(meetup_id,user_id)
);

create table public.meetup_time_options(
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check(ends_at>starts_at)
);

create table public.meetup_votes(
  option_id uuid not null references public.meetup_time_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  available boolean not null,
  created_at timestamptz not null default now(),
  primary key(option_id,user_id)
);

create table public.meetup_comments(
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check(length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.calendar_events(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  title text not null check(length(trim(title)) between 1 and 240),
  description text not null default '',
  event_kind text not null check(event_kind in ('timed','all_day')),
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end_exclusive date,
  timezone text not null,
  visibility public.visibility_mode not null default 'only_me',
  exact_address text,
  private_notes text,
  recurrence_rule text,
  created_at timestamptz not null default now(),
  check((event_kind='timed' and start_at is not null and end_at is not null and end_at>start_at and all_day_start is null and all_day_end_exclusive is null)
     or (event_kind='all_day' and all_day_start is not null and all_day_end_exclusive>all_day_start and start_at is null and end_at is null))
);

create table public.event_shares(
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  free_busy_only boolean not null default false,
  primary key(event_id,user_id,group_id),
  check((user_id is not null)::int + (group_id is not null)::int = 1)
);

create table public.personal_tasks(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 300),
  priority public.task_priority not null default 'medium',
  due_at timestamptz,
  tags text[] not null default '{}',
  recurrence text not null default 'none' check(recurrence in ('none','daily','weekly')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.personal_notes(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null default '',
  action_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reminders(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  related_id uuid,
  due_at timestamptz not null,
  payload jsonb not null default '{}',
  idempotency_key text not null unique,
  status text not null default 'pending' check(status in ('pending','processing','delivered','canceled','failed')),
  attempts integer not null default 0,
  delivered_at timestamptz
);

create table public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table public.location_sessions(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  meetup_id uuid references public.meetups(id) on delete set null,
  expires_at timestamptz not null,
  stopped_at timestamptz,
  approximate boolean not null default false,
  created_at timestamptz not null default now(),
  check(expires_at>created_at)
);

create table public.location_recipients(
  session_id uuid not null references public.location_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(session_id,user_id)
);

create table public.location_positions(
  session_id uuid primary key references public.location_sessions(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m double precision,
  recorded_at timestamptz not null default now()
);

create index idx_membership_user on public.group_memberships(user_id);
create index idx_invitee_user on public.meetup_invitees(user_id);
create index idx_event_owner_start on public.calendar_events(owner_id,start_at);
create index idx_task_owner_due on public.personal_tasks(owner_id,due_at);
create index idx_notifications_user_created on public.notifications(user_id,created_at desc);
create index idx_reminders_due on public.reminders(status,due_at);
create index idx_location_recipient on public.location_recipients(user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name,timezone)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name',''),coalesce(new.raw_user_meta_data->>'timezone','Asia/Ho_Chi_Minh'));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_group_member(g uuid, u uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.group_memberships where group_id=g and user_id=u)
$$;

create or replace function public.is_group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.group_memberships where group_id=g and user_id=u and role in ('owner','admin'))
$$;

create or replace function public.create_group(p_name text,p_description text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.groups(owner_id,name,description) values(auth.uid(),trim(p_name),coalesce(p_description,'')) returning id into gid;
  insert into public.group_memberships(group_id,user_id,role) values(gid,auth.uid(),'owner');
  return gid;
end $$;

create or replace function public.start_location_session(p_duration_minutes integer,p_recipient_usernames text[]) returns uuid
language plpgsql security definer set search_path=public as $$
declare sid uuid; recipient_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_duration_minutes<5 or p_duration_minutes>1440 then raise exception 'invalid duration'; end if;
  select count(*) into recipient_count from public.profiles where username=any(p_recipient_usernames) and id<>auth.uid();
  if recipient_count=0 then raise exception 'no valid recipients'; end if;
  insert into public.location_sessions(owner_id,expires_at) values(auth.uid(),now()+make_interval(mins=>p_duration_minutes)) returning id into sid;
  insert into public.location_recipients(session_id,user_id) select sid,id from public.profiles where username=any(p_recipient_usernames) and id<>auth.uid();
  return sid;
end $$;

create or replace function public.stop_location_session(p_session_id uuid) returns void
language sql security definer set search_path=public as $$
  update public.location_sessions set stopped_at=coalesce(stopped_at,now()) where id=p_session_id and owner_id=auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invites enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_invitees enable row level security;
alter table public.meetup_time_options enable row level security;
alter table public.meetup_votes enable row level security;
alter table public.meetup_comments enable row level security;
alter table public.calendar_events enable row level security;
alter table public.event_shares enable row level security;
alter table public.personal_tasks enable row level security;
alter table public.personal_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.location_sessions enable row level security;
alter table public.location_recipients enable row level security;
alter table public.location_positions enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(
  id=auth.uid() or exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=auth.uid() and f.addressee_id=id) or (f.addressee_id=auth.uid() and f.requester_id=id)))
);
create policy profiles_update_self on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create policy friendships_participants on public.friendships for select to authenticated using(auth.uid() in (requester_id,addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated with check(requester_id=auth.uid());
create policy friendships_update on public.friendships for update to authenticated using(auth.uid() in (requester_id,addressee_id));

create policy blocks_self on public.blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());

create policy groups_member_read on public.groups for select to authenticated using(public.is_group_member(id,auth.uid()));
create policy groups_admin_update on public.groups for update to authenticated using(public.is_group_admin(id,auth.uid()));
create policy memberships_member_read on public.group_memberships for select to authenticated using(public.is_group_member(group_id,auth.uid()));
create policy memberships_admin_write on public.group_memberships for all to authenticated using(public.is_group_admin(group_id,auth.uid())) with check(public.is_group_admin(group_id,auth.uid()));

create policy invites_admin on public.group_invites for all to authenticated using(public.is_group_admin(group_id,auth.uid())) with check(public.is_group_admin(group_id,auth.uid()));

create policy meetup_read on public.meetups for select to authenticated using(
  organizer_id=auth.uid() or (group_id is not null and public.is_group_member(group_id,auth.uid())) or exists(select 1 from public.meetup_invitees i where i.meetup_id=id and i.user_id=auth.uid())
);
create policy meetup_owner_write on public.meetups for all to authenticated using(organizer_id=auth.uid()) with check(organizer_id=auth.uid());
create policy invitee_self_read on public.meetup_invitees for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.meetups m where m.id=meetup_id and m.organizer_id=auth.uid()));
create policy invitee_self_update on public.meetup_invitees for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy time_options_invited on public.meetup_time_options for select to authenticated using(exists(select 1 from public.meetups m where m.id=meetup_id and (m.organizer_id=auth.uid() or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid()))));
create policy votes_self on public.meetup_votes for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy comments_read on public.meetup_comments for select to authenticated using(exists(select 1 from public.meetups m where m.id=meetup_id and (m.organizer_id=auth.uid() or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid()))));
create policy comments_write on public.meetup_comments for insert to authenticated with check(author_id=auth.uid());

create policy events_owner on public.calendar_events for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy event_shares_owner on public.event_shares for all to authenticated using(exists(select 1 from public.calendar_events e where e.id=event_id and e.owner_id=auth.uid())) with check(exists(select 1 from public.calendar_events e where e.id=event_id and e.owner_id=auth.uid()));

create policy tasks_owner on public.personal_tasks for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy notes_owner on public.personal_notes for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy notifications_owner on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_owner_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy push_owner on public.push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy location_sessions_owner on public.location_sessions for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy location_sessions_recipient_read on public.location_sessions for select to authenticated using(
  stopped_at is null and expires_at>now() and exists(select 1 from public.location_recipients r where r.session_id=id and r.user_id=auth.uid())
);
create policy location_recipients_owner on public.location_recipients for all to authenticated using(exists(select 1 from public.location_sessions s where s.id=session_id and s.owner_id=auth.uid())) with check(exists(select 1 from public.location_sessions s where s.id=session_id and s.owner_id=auth.uid()));
create policy location_positions_owner_write on public.location_positions for all to authenticated using(exists(select 1 from public.location_sessions s where s.id=session_id and s.owner_id=auth.uid() and s.stopped_at is null and s.expires_at>now())) with check(exists(select 1 from public.location_sessions s where s.id=session_id and s.owner_id=auth.uid() and s.stopped_at is null and s.expires_at>now()));
create policy location_positions_recipient_read on public.location_positions for select to authenticated using(exists(select 1 from public.location_sessions s join public.location_recipients r on r.session_id=s.id where s.id=session_id and r.user_id=auth.uid() and s.stopped_at is null and s.expires_at>now()));

grant execute on function public.create_group(text,text) to authenticated;
grant execute on function public.start_location_session(integer,text[]) to authenticated;
grant execute on function public.stop_location_session(uuid) to authenticated;
