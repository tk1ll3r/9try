-- Disposable local database only; all fixtures roll back.
-- a = b01 owns the calendar, b = b02 is a friend with a share, c = b03 is a friend without one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000b01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','busy-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000b02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','busy-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000b03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','busy-c@example.invalid');
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-000000000b02','accepted'),
       ('00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-000000000b03','accepted');
insert into public.availability_shares(owner_id, user_id)
values ('00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-000000000b02');

-- A weekly class that started a month ago, with one cancelled date, and a past one-off event.
insert into public.calendar_events(id, owner_id, title, event_kind, start_at, end_at, timezone, recurrence_rule, recurrence_until, category, place)
values ('00000000-0000-4000-8000-000000000bc1','00000000-0000-4000-8000-000000000b01','Cấu trúc dữ liệu','timed',
  now()-interval '28 days',now()-interval '28 days'+interval '2 hours','Asia/Ho_Chi_Minh','weekly',(now()+interval '60 days')::date,'class','B1.02');
insert into public.calendar_event_exceptions(event_id, occurrence_date, canceled)
values ('00000000-0000-4000-8000-000000000bc1',((now()+interval '7 days') at time zone 'Asia/Ho_Chi_Minh')::date,true);
insert into public.calendar_events(owner_id, title, event_kind, start_at, end_at, timezone)
values ('00000000-0000-4000-8000-000000000b01','Cũ','timed',now()-interval '10 days',now()-interval '10 days'+interval '1 hour','UTC');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000b02',true);
select is((select count(*) from public.get_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),0::bigint,'the old function misses the weekly class in the coming weeks');
select is((select count(*) from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),1::bigint,'the new function returns the repeating event');
select is((select recurrence_rule from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),'weekly','with its rule');
select is((select jsonb_array_length(exceptions) from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),1,'and its exceptions');
select is((select exceptions::text like '%title%' from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),false,'without any title');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000b03',true);
select throws_ok($$ select * from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days') $$,'P0001','availability not shared','a friend without a share sees nothing');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000b01',true);
select is((select count(*) from public.list_shared_busy('00000000-0000-4000-8000-000000000b01',now(),now()+interval '14 days')),1::bigint,'the owner sees their own busy times');
reset role;

-- Importing the same event twice is refused by the database.
insert into public.calendar_events(owner_id, title, event_kind, start_at, end_at, timezone, external_uid)
values ('00000000-0000-4000-8000-000000000b01','Imported','timed',now(),now()+interval '1 hour','UTC','uid-1');
select throws_ok($$ insert into public.calendar_events(owner_id, title, event_kind, start_at, end_at, timezone, external_uid)
  values ('00000000-0000-4000-8000-000000000b01','Imported','timed',now(),now()+interval '1 hour','UTC','uid-1') $$,'23505',null,'the same external id cannot be stored twice for one owner');

select * from finish();
rollback;
