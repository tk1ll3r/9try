-- A private address that other calendar apps read the owner's calendar from (function calendar-feed).
-- The address carries a random token; only its SHA-256 is stored, so a database leak does not open feeds.
create table public.calendar_feeds (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
grant select on public.calendar_feeds to authenticated;

-- The owner may see that a feed exists and since when. Rows change only through the functions below.
create policy calendar_feed_owner_read on public.calendar_feeds
for select to authenticated using (owner_id = (select auth.uid()));

-- Returns a new token. An earlier address of the same user stops working.
create function public.create_calendar_feed() returns text
language plpgsql security definer set search_path = '' as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  insert into public.calendar_feeds(owner_id, token_hash)
  values ((select auth.uid()), encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (owner_id) do update set token_hash = excluded.token_hash, created_at = now();
  return token;
end $$;

create function public.revoke_calendar_feed() returns void
language sql security definer set search_path = '' as $$
  delete from public.calendar_feeds where owner_id = (select auth.uid());
$$;

revoke execute on function public.create_calendar_feed(), public.revoke_calendar_feed() from public, anon;
grant execute on function public.create_calendar_feed(), public.revoke_calendar_feed() to authenticated;
