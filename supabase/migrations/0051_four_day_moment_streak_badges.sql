-- Start the public flame badge after four consecutive local posting days.
create or replace function public.list_moment_streak_badges()
returns table(user_id uuid, streak_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  with audience as (
    select me as user_id
    union
    select case when f.requester_id = me then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and me in (f.requester_id, f.addressee_id)
      and private.can_contact(me, case when f.requester_id = me then f.addressee_id else f.requester_id end)
  )
  select audience.user_id, private.moment_streak_days(audience.user_id)
  from audience
  where private.moment_streak_days(audience.user_id) >= 4;
end $$;
revoke all on function public.list_moment_streak_badges() from public, anon;
grant execute on function public.list_moment_streak_badges() to authenticated;
