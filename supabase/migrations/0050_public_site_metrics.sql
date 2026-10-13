-- Keep the public counters cheap to read: profile changes update the member total,
-- while public page views update only the single counter row.
-- Supabase applies this migration without an implicit transaction. Keep the
-- initial count and its profile-change trigger installation atomic.
begin;

lock table public.profiles in share row exclusive mode;

create table public.public_site_metrics (
  singleton boolean primary key default true check (singleton),
  total_users bigint not null check (total_users >= 0),
  landing_page_views bigint not null default 0 check (landing_page_views >= 0)
);

insert into public.public_site_metrics(singleton, total_users, landing_page_views)
-- Historical estimate from Cloudflare Web Analytics for requestHost=9try.gnouht.space,
-- requestPath=/, from the first deployment (2026-10-08 02:16:40 UTC) through
-- 2026-10-12 04:57:40 UTC. Cloudflare's adaptive sample estimated 286 page views;
-- the summed per-day 95% confidence bounds were 253–319.
select true, count(*)::bigint, 286 from public.profiles;

alter table public.public_site_metrics enable row level security;
revoke all on public.public_site_metrics from public, anon, authenticated;

create function private.update_public_site_user_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.public_site_metrics as metrics
  set total_users = greatest(0, metrics.total_users + case when tg_op = 'INSERT' then 1 else -1 end)
  where metrics.singleton;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.update_public_site_user_count() from public, anon, authenticated;

create trigger profiles_update_public_site_user_count
after insert or delete on public.profiles
for each row execute function private.update_public_site_user_count();

create function public.get_public_site_metrics()
returns table(total_users bigint, total_visits bigint)
language sql stable security definer set search_path = '' as $$
  select metrics.total_users, metrics.landing_page_views
  from public.public_site_metrics as metrics
  where metrics.singleton
$$;
revoke all on function public.get_public_site_metrics() from public, anon, authenticated;
grant execute on function public.get_public_site_metrics() to anon;

-- One call per public landing-page opening. The update is atomic across concurrent visitors.
create function public.record_public_landing_view()
returns table(total_users bigint, total_visits bigint)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.public_site_metrics as metrics
  set landing_page_views = metrics.landing_page_views + 1
  where metrics.singleton
  returning metrics.total_users, metrics.landing_page_views into total_users, total_visits;
  if not found then raise exception 'public site metrics are not initialized'; end if;
  return next;
end $$;
revoke all on function public.record_public_landing_view() from public, anon, authenticated;
grant execute on function public.record_public_landing_view() to anon;

commit;
