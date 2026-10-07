-- Presence is opt-in, short-lived and visible only to accepted, unblocked friends.
create table public.activity_modes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('studying','school','gaming','billiards','drinks','sleeping')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint activity_modes_expiry check (expires_at > updated_at and expires_at <= updated_at + interval '24 hours')
);
create index activity_modes_expiry_idx on public.activity_modes(expires_at);
alter table public.activity_modes enable row level security;

create policy activity_modes_read on public.activity_modes for select to authenticated
using (
  expires_at > now()
  and (
    user_id = (select auth.uid())
    or (
      exists (select 1 from public.friendships f
        where f.status = 'accepted'
          and ((f.requester_id = (select auth.uid()) and f.addressee_id = user_id)
            or (f.addressee_id = (select auth.uid()) and f.requester_id = user_id)))
      and not exists (select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
           or (b.blocked_id = (select auth.uid()) and b.blocker_id = user_id))
    )
  )
);
-- Update timestamps/expiry only through RPC, never trust client-supplied expiry.
create or replace function public.set_my_activity_mode(p_mode text, p_minutes integer default 120)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_mode is null then
    delete from public.activity_modes where user_id = auth.uid();
    return;
  end if;
  if p_mode not in ('studying','school','gaming','billiards','drinks','sleeping')
     or p_minutes not in (30, 60, 120, 240, 480) then
    raise exception 'invalid activity mode or duration';
  end if;
  insert into public.activity_modes(user_id,mode,updated_at,expires_at)
  values (auth.uid(),p_mode,now(),now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update set
    mode = excluded.mode, updated_at = excluded.updated_at, expires_at = excluded.expires_at;
end $$;
revoke all on function public.set_my_activity_mode(text,integer) from public;
grant execute on function public.set_my_activity_mode(text,integer) to authenticated;
grant select on public.activity_modes to authenticated;
