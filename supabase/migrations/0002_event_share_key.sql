alter table public.event_shares drop constraint event_shares_pkey;
alter table public.event_shares alter column user_id drop not null;
alter table public.event_shares alter column group_id drop not null;
alter table public.event_shares add column id uuid not null default gen_random_uuid() primary key;
create unique index event_shares_user_unique on public.event_shares(event_id,user_id) where user_id is not null;
create unique index event_shares_group_unique on public.event_shares(event_id,group_id) where group_id is not null;
