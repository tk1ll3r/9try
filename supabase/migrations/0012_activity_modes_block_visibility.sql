-- A friend must not see a blocked user's mode even if friendship data is stale.
-- SECURITY DEFINER is needed to check both block directions (blocks RLS exposes only own blocks).
create or replace function public.can_view_activity_mode(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    p_user_id = auth.uid() or (
      exists (select 1 from public.friendships f where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p_user_id)
          or (f.addressee_id = auth.uid() and f.requester_id = p_user_id)))
      and not exists (select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p_user_id)
           or (b.blocker_id = p_user_id and b.blocked_id = auth.uid()))
    )
  );
$$;
revoke all on function public.can_view_activity_mode(uuid) from public;
grant execute on function public.can_view_activity_mode(uuid) to authenticated;
revoke all on public.activity_modes from anon;
revoke insert, update, delete, truncate, references, trigger on public.activity_modes from authenticated;
grant select on public.activity_modes to authenticated;
drop policy activity_modes_read on public.activity_modes;
create policy activity_modes_read on public.activity_modes for select to authenticated
using (expires_at > now() and public.can_view_activity_mode(user_id));
