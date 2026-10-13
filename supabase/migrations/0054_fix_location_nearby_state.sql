-- The nearby state updater in 0053 refers to `state` in its conflict clause without
-- defining that table alias. It runs during share creation and position updates, so a
-- missing reciprocal share could also make ordinary location sharing fail.
create or replace function private.set_location_nearby_state(
  p_user_id uuid,
  p_friend_id uuid,
  p_inside boolean,
  p_repeat_minutes integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  checked_at timestamptz := clock_timestamp();
  should_notify boolean;
begin
  insert into public.location_nearby_state as state
    (user_id, friend_id, inside, entered_at, last_notified_at)
  values (
    p_user_id,
    p_friend_id,
    p_inside,
    case when p_inside then checked_at else null end,
    case when p_inside then checked_at else null end
  )
  on conflict (user_id, friend_id) do update
    set inside = excluded.inside,
        entered_at = case
          when excluded.inside and not state.inside then checked_at
          when excluded.inside then state.entered_at
          else null
        end,
        last_notified_at = case
          when excluded.inside and (
            state.last_notified_at is null
            or state.last_notified_at <= checked_at - make_interval(mins => p_repeat_minutes)
          ) then checked_at
          else state.last_notified_at
        end
    where state.inside is distinct from excluded.inside
      or (excluded.inside and (
        state.last_notified_at is null
        or state.last_notified_at <= checked_at - make_interval(mins => p_repeat_minutes)
      ))
  returning state.inside and state.last_notified_at = checked_at into should_notify;
  return coalesce(should_notify, false) and p_inside;
end $$;
revoke all on function private.set_location_nearby_state(uuid, uuid, boolean, integer) from public, anon, authenticated;
