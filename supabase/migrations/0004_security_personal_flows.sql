-- Security hardening and remaining personal/social flows.

drop policy if exists friendships_insert on public.friendships;
drop policy if exists friendships_update on public.friendships;
drop policy if exists meetup_owner_write on public.meetups;

create policy meetup_organizer_update on public.meetups
for update to authenticated
using(organizer_id=auth.uid())
with check(organizer_id=auth.uid());

create policy meetup_organizer_delete on public.meetups
for delete to authenticated
using(organizer_id=auth.uid());

create table public.routine_completions(
  task_id uuid not null references public.personal_tasks(id) on delete cascade,
  completion_date date not null,
  completed_at timestamptz not null default now(),
  primary key(task_id,completion_date)
);

alter table public.routine_completions enable row level security;

create policy routine_completion_owner on public.routine_completions
for select to authenticated
using(exists(
  select 1 from public.personal_tasks t
  where t.id=task_id and t.owner_id=auth.uid()
));

create or replace function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or p_user_id=auth.uid() then raise exception 'invalid user'; end if;

  delete from public.friendships
  where (requester_id=auth.uid() and addressee_id=p_user_id)
     or (requester_id=p_user_id and addressee_id=auth.uid());

  insert into public.blocks(blocker_id,blocked_id)
  values(auth.uid(),p_user_id)
  on conflict do nothing;

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id=s.id
    and (
      (s.owner_id=auth.uid() and r.user_id=p_user_id)
      or (s.owner_id=p_user_id and r.user_id=auth.uid())
    );
end $$;

create or replace function public.unblock_user(p_user_id uuid) returns void
language sql security definer set search_path=public as $$
  delete from public.blocks where blocker_id=auth.uid() and blocked_id=p_user_id
$$;

create or replace function public.leave_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare role_now public.group_role;
begin
  select role into role_now from public.group_memberships
  where group_id=p_group_id and user_id=auth.uid();

  if role_now is null then return; end if;
  if role_now='owner' then raise exception 'transfer ownership first'; end if;

  delete from public.group_memberships where group_id=p_group_id and user_id=auth.uid();
  update public.groups set member_count=greatest(1,member_count-1) where id=p_group_id;
end $$;

create or replace function public.archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.groups
  set archived_at=coalesce(archived_at,now())
  where id=p_group_id and owner_id=auth.uid();
  if not found then raise exception 'owner required'; end if;
end $$;

create or replace function public.cancel_meetup(p_meetup_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare meetup_title text;
begin
  select title into meetup_title
  from public.meetups
  where id=p_meetup_id and organizer_id=auth.uid() and status<>'completed'
  for update;

  if meetup_title is null then raise exception 'organizer required'; end if;

  update public.meetups set status='canceled' where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Hoạt động đã hủy',meetup_title,'/meetups'
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;

create or replace function public.post_meetup_comment(p_meetup_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
  if length(trim(p_body))<1 or length(trim(p_body))>4000 then raise exception 'invalid comment'; end if;
  if not exists(
    select 1 from public.meetups m
    where m.id=p_meetup_id
      and (
        m.organizer_id=auth.uid()
        or exists(select 1 from public.meetup_invitees i where i.meetup_id=m.id and i.user_id=auth.uid())
      )
  ) then raise exception 'not invited'; end if;

  insert into public.meetup_comments(meetup_id,author_id,body)
  values(p_meetup_id,auth.uid(),trim(p_body))
  returning id into cid;
  return cid;
end $$;

create or replace function public.complete_routine(p_task_id uuid) returns date
language plpgsql security definer set search_path=public as $$
declare tz text; local_day date;
begin
  select p.timezone into tz from public.profiles p where p.id=auth.uid();
  tz:=coalesce(tz,'UTC');
  local_day:=(now() at time zone tz)::date;

  if not exists(
    select 1 from public.personal_tasks t
    where t.id=p_task_id and t.owner_id=auth.uid() and t.recurrence in ('daily','weekly')
  ) then raise exception 'routine not found'; end if;

  insert into public.routine_completions(task_id,completion_date)
  values(p_task_id,local_day)
  on conflict do nothing;

  return local_day;
end $$;

create or replace function public.schedule_personal_reminder(
  p_due_at timestamptz,
  p_title text,
  p_body text default '',
  p_action_path text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_due_at<=now() then raise exception 'reminder must be in the future'; end if;

  insert into public.reminders(user_id,category,due_at,payload,idempotency_key)
  values(
    auth.uid(),
    'personal_reminder',
    p_due_at,
    jsonb_build_object('title',trim(p_title),'body',coalesce(p_body,''),'action_path',p_action_path),
    encode(digest(auth.uid()::text||'|'||p_due_at::text||'|'||trim(p_title),'sha256'),'hex')
  )
  returning id into rid;

  return rid;
end $$;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path=public as $$
select jsonb_build_object(
  'exported_at',now(),
  'profile',(select to_jsonb(p) from public.profiles p where p.id=auth.uid()),
  'friendships',coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where auth.uid() in (f.requester_id,f.addressee_id)),'[]'::jsonb),
  'blocks',coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id=auth.uid()),'[]'::jsonb),
  'group_memberships',coalesce((select jsonb_agg(to_jsonb(gm)) from public.group_memberships gm where gm.user_id=auth.uid()),'[]'::jsonb),
  'meetup_invitations',coalesce((select jsonb_agg(to_jsonb(mi)) from public.meetup_invitees mi where mi.user_id=auth.uid()),'[]'::jsonb),
  'calendar_events',coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_events e where e.owner_id=auth.uid()),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.personal_tasks t where t.owner_id=auth.uid()),'[]'::jsonb),
  'routine_completions',coalesce((select jsonb_agg(to_jsonb(rc)) from public.routine_completions rc join public.personal_tasks t on t.id=rc.task_id where t.owner_id=auth.uid()),'[]'::jsonb),
  'notes',coalesce((select jsonb_agg(to_jsonb(n)) from public.personal_notes n where n.owner_id=auth.uid()),'[]'::jsonb),
  'notifications',coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.user_id=auth.uid()),'[]'::jsonb),
  'location_sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.location_sessions s where s.owner_id=auth.uid()),'[]'::jsonb)
)
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.archive_group(uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.post_meetup_comment(uuid,text) to authenticated;
grant execute on function public.complete_routine(uuid) to authenticated;
grant execute on function public.schedule_personal_reminder(timestamptz,text,text,text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
