-- Break the location_sessions <-> location_recipients SELECT-policy recursion.
-- Prior behavior: the session recipient SELECT policy queries recipients, whose
-- owner SELECT policy queries sessions. Even owner position writes can trigger it.
-- This narrowly scoped helper only answers whether the current user is a
-- recipient of the given session. Its owner must bypass RLS for this table.
create or replace function public.is_location_recipient(p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.location_recipients r
    where r.session_id = p_session_id and r.user_id = auth.uid()
  )
$$;

revoke all on function public.is_location_recipient(uuid) from public, anon;
grant execute on function public.is_location_recipient(uuid) to authenticated;

-- Preserve stopped/expiry semantics; no broadening of location data visibility.
drop policy if exists location_sessions_recipient_read on public.location_sessions;
create policy location_sessions_recipient_read on public.location_sessions
for select to authenticated
using (
  stopped_at is null and expires_at > now()
  and public.is_location_recipient(id)
);
