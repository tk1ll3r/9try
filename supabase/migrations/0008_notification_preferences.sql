alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications
  add constraint notifications_dedupe_key_unique unique(dedupe_key);

alter table public.reminders add column if not exists processing_started_at timestamptz;

create table public.notification_preferences(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  quiet_start time,
  quiet_end time,
  category_push jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy notification_preferences_owner on public.notification_preferences
for all to authenticated
using(user_id=auth.uid())
with check(user_id=auth.uid());

create or replace function public.can_send_push(p_user_id uuid,p_category text)
returns boolean
language plpgsql stable security definer set search_path=public as $$
declare
  pref public.notification_preferences%rowtype;
  tz text;
  local_now time;
  category_allowed boolean;
  in_quiet boolean := false;
begin
  select * into pref from public.notification_preferences where user_id=p_user_id;
  if pref.user_id is null or not pref.push_enabled then return false; end if;

  category_allowed:=coalesce((pref.category_push->>p_category)::boolean,true);
  if not category_allowed then return false; end if;

  if pref.quiet_start is null or pref.quiet_end is null then return true; end if;

  select timezone into tz from public.profiles where id=p_user_id;
  local_now:=(now() at time zone coalesce(tz,'UTC'))::time;

  if pref.quiet_start=pref.quiet_end then
    in_quiet:=false;
  elsif pref.quiet_start<pref.quiet_end then
    in_quiet:=local_now>=pref.quiet_start and local_now<pref.quiet_end;
  else
    in_quiet:=local_now>=pref.quiet_start or local_now<pref.quiet_end;
  end if;

  return not in_quiet;
end $$;

grant execute on function public.can_send_push(uuid,text) to service_role;
