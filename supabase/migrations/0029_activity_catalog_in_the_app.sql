-- The list of activities leaves the database. The app holds the catalog (name, icon, color), so adding
-- an activity is a change in one file and needs no migration. The server checks only the shape of the
-- key: a lower-case word of 2 to 30 letters and underscores. The key is never shown as text; an app
-- that does not know a key shows "doing something else".
alter table public.activity_modes drop constraint activity_modes_mode_check;
alter table public.activity_modes add constraint activity_modes_mode_check check (mode ~ '^[a-z][a-z_]{1,29}$');

create or replace function public.set_my_activity_mode(p_mode text, p_minutes integer default 120)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  if p_mode is null then
    delete from public.activity_modes where user_id = (select auth.uid());
    return;
  end if;
  if p_mode !~ '^[a-z][a-z_]{1,29}$' or p_minutes not in (30, 60, 120, 240, 480) then
    raise exception 'invalid activity mode or duration';
  end if;
  insert into public.activity_modes(user_id, mode, updated_at, expires_at)
  values ((select auth.uid()), p_mode, now(), now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update set
    mode = excluded.mode, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end $$;
