-- Disposable local Supabase Postgres ONLY. No cloud-linked reset or production use.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000401','00000000-0000-0000-0000-000000000000','authenticated','authenticated','feed-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000402','00000000-0000-0000-0000-000000000000','authenticated','authenticated','feed-other@example.invalid');
create temporary table seen(step text primary key, token text) on commit drop;
grant all on seen to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
insert into seen values ('first', public.create_calendar_feed());
select ok((select token ~ '^[0-9a-f]{64}$' from seen where step='first'), 'the token is 64 hex characters');
select is((select token_hash from public.calendar_feeds), (select encode(sha256(convert_to(token,'UTF8')),'hex') from seen where step='first'), 'only the hash of the token is stored');

insert into seen values ('second', public.create_calendar_feed());
select isnt((select token from seen where step='second'), (select token from seen where step='first'), 'asking again gives a new token');
select is((select count(*) from public.calendar_feeds where token_hash=(select encode(sha256(convert_to(token,'UTF8')),'hex') from seen where step='first')), 0::bigint, 'the earlier address stops working');
select throws_ok($$insert into public.calendar_feeds(owner_id,token_hash) values ('00000000-0000-4000-8000-000000000401','x')$$, '42501', null, 'a client cannot write a feed row itself');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
select is((select count(*) from public.calendar_feeds), 0::bigint, 'another user sees no feed of the owner');
select lives_ok($$select public.revoke_calendar_feed()$$, 'revoking without a feed is harmless');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
select is((select count(*) from public.calendar_feeds), 1::bigint, 'the other user''s revoke left the owner''s feed alone');
select public.revoke_calendar_feed();
select is((select count(*) from public.calendar_feeds), 0::bigint, 'the owner revokes the feed');
reset role;
select * from finish();
rollback;
