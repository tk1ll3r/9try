-- Event sharing never grants direct table reads. Viewers receive a safe projection only.

drop policy if exists event_shares_owner on public.event_shares;

create policy event_shares_owner_read
on public.event_shares
for select to authenticated
using(exists(
  select 1 from public.calendar_events e
  where e.id=event_id and e.owner_id=auth.uid()
));

create or replace function public.set_calendar_event_audience(
  p_event_id uuid,
  p_user_ids uuid[] default '{}'::uuid[],
  p_group_id uuid default null
) returns void
language plpgsql security definer set search_path=public as $$
declare mode public.visibility_mode;
begin
  select visibility into mode
  from public.calendar_events
  where id=p_event_id and owner_id=auth.uid();

  if mode is null then raise exception 'event not found'; end if;

  delete from public.event_shares where event_id=p_event_id;

  if mode='selected_friends' then
    if coalesce(array_length(p_user_ids,1),0)=0 then
      raise exception 'select at least one friend';
    end if;

    if exists(
      select 1
      from unnest(p_user_ids) selected(user_id)
      where not exists(
        select 1 from public.friendships f
        where f.status='accepted'
          and (
            (f.requester_id=auth.uid() and f.addressee_id=selected.user_id)
            or (f.requester_id=selected.user_id and f.addressee_id=auth.uid())
          )
      )
    ) then raise exception 'all selected users must be friends'; end if;

    insert into public.event_shares(event_id,user_id)
    select p_event_id,user_id from unnest(p_user_ids) selected(user_id)
    on conflict do nothing;

  elsif mode='group' then
    if p_group_id is null or not public.is_group_member(p_group_id,auth.uid()) then
      raise exception 'group membership required';
    end if;

    update public.calendar_events set group_id=p_group_id where id=p_event_id;
    insert into public.event_shares(event_id,group_id)
    values(p_event_id,p_group_id)
    on conflict do nothing;

  elsif mode in ('only_me','public') then
    update public.calendar_events set group_id=null where id=p_event_id;
  end if;
end $$;

create or replace function public.list_shared_calendar_events(
  p_owner_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  id uuid,
  owner_id uuid,
  owner_display_name text,
  owner_username text,
  title text,
  description text,
  event_kind text,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end_exclusive date,
  timezone text,
  visibility public.visibility_mode,
  recurrence_rule text,
  recurrence_until date,
  exceptions jsonb
)
language plpgsql stable security definer set search_path=public as $$
begin
  if p_to<=p_from or p_to>p_from+interval '180 days' then
    raise exception 'invalid range';
  end if;

  return query
  select
    e.id,
    e.owner_id,
    p.display_name,
    p.username,
    e.title,
    e.description,
    e.event_kind,
    e.start_at,
    e.end_at,
    e.all_day_start,
    e.all_day_end_exclusive,
    e.timezone,
    e.visibility,
    e.recurrence_rule,
    e.recurrence_until,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurrence_date',x.occurrence_date,
        'canceled',x.canceled,
        'override_title',x.override_title,
        'override_start_at',x.override_start_at,
        'override_end_at',x.override_end_at,
        'override_all_day_start',x.override_all_day_start,
        'override_all_day_end_exclusive',x.override_all_day_end_exclusive
      ))
      from public.calendar_event_exceptions x
      where x.event_id=e.id
    ),'[]'::jsonb)
  from public.calendar_events e
  join public.profiles p on p.id=e.owner_id
  where e.owner_id=p_owner_id
    and e.owner_id<>auth.uid()
    and (
      e.visibility='public'
      or (
        e.visibility='selected_friends'
        and exists(
          select 1 from public.event_shares s
          where s.event_id=e.id and s.user_id=auth.uid()
        )
        and exists(
          select 1 from public.friendships f
          where f.status='accepted'
            and (
              (f.requester_id=e.owner_id and f.addressee_id=auth.uid())
              or (f.requester_id=auth.uid() and f.addressee_id=e.owner_id)
            )
        )
      )
      or (
        e.visibility='group'
        and exists(
          select 1 from public.event_shares s
          where s.event_id=e.id
            and s.group_id is not null
            and public.is_group_member(s.group_id,auth.uid())
            and public.is_group_member(s.group_id,e.owner_id)
        )
      )
    )
    and (
      (
        e.recurrence_rule is null
        and (
          (e.event_kind='timed' and e.start_at<p_to and e.end_at>p_from)
          or
          (e.event_kind='all_day' and e.all_day_start<p_to::date and e.all_day_end_exclusive>p_from::date)
        )
      )
      or (
        e.recurrence_rule is not null
        and (e.recurrence_until is null or e.recurrence_until>=p_from::date)
        and coalesce(e.all_day_start,(e.start_at at time zone e.timezone)::date)<=p_to::date
      )
    )
  order by coalesce(e.start_at,e.all_day_start::timestamptz);
end $$;

grant execute on function public.set_calendar_event_audience(uuid,uuid[],uuid) to authenticated;
grant execute on function public.list_shared_calendar_events(uuid,timestamptz,timestamptz) to authenticated;
