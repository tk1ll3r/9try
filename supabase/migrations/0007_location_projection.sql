-- Location sharing projections and approximate-location option.

drop function if exists public.start_location_session(integer,text[]);

create or replace function public.start_location_session(
  p_duration_minutes integer,
  p_recipient_usernames text[],
  p_approximate boolean default false
) returns uuid
language plpgsql security definer set search_path=public as $$
declare sid uuid; recipient_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_duration_minutes<5 or p_duration_minutes>1440 then raise exception 'invalid duration'; end if;

  select count(*) into recipient_count
  from public.profiles
  where username=any(p_recipient_usernames) and id<>auth.uid();

  if recipient_count=0 then raise exception 'no valid recipients'; end if;

  insert into public.location_sessions(owner_id,expires_at,approximate)
  values(auth.uid(),now()+make_interval(mins=>p_duration_minutes),p_approximate)
  returning id into sid;

  insert into public.location_recipients(session_id,user_id)
  select sid,id
  from public.profiles
  where username=any(p_recipient_usernames) and id<>auth.uid();

  return sid;
end $$;

create or replace function public.list_visible_locations()
returns table(
  session_id uuid,
  owner_id uuid,
  owner_display_name text,
  owner_username text,
  expires_at timestamptz,
  approximate boolean,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  recorded_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select
    s.id,
    s.owner_id,
    p.display_name,
    p.username,
    s.expires_at,
    s.approximate,
    pos.latitude,
    pos.longitude,
    pos.accuracy_m,
    pos.recorded_at
  from public.location_sessions s
  join public.location_recipients r on r.session_id=s.id
  join public.profiles p on p.id=s.owner_id
  left join public.location_positions pos on pos.session_id=s.id
  where r.user_id=auth.uid()
    and s.stopped_at is null
    and s.expires_at>now()
  order by pos.recorded_at desc nulls last
$$;

grant execute on function public.start_location_session(integer,text[],boolean) to authenticated;
grant execute on function public.list_visible_locations() to authenticated;
