-- Disposable local database only; all fixtures roll back.
-- a = 701 (owner), b = 702 (friend), c = 703 (stranger), d = 704 (sent a request that is still pending).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000701','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pin-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000702','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pin-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000703','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pin-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000704','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pin-d@example.invalid');
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000702','accepted'),
  ('00000000-0000-4000-8000-000000000704','00000000-0000-4000-8000-000000000701','pending');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
select lives_ok($$select public.set_friend_pin('00000000-0000-4000-8000-000000000702', true)$$, 'a friend can be pinned');
select lives_ok($$select public.set_friend_pin('00000000-0000-4000-8000-000000000702', true)$$, 'pinning twice is harmless');
select is((select count(*) from public.friend_pins), 1::bigint, 'and leaves one pin');
select throws_ok($$select public.set_friend_pin('00000000-0000-4000-8000-000000000703', true)$$, 'P0001', 'not friends', 'a stranger cannot be pinned');
select throws_ok($$select public.set_friend_pin('00000000-0000-4000-8000-000000000704', true)$$, 'P0001', 'not friends', 'nor someone whose request is still pending');
select throws_ok($$insert into public.friend_pins(user_id, friend_id) values ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000703')$$, '42501', null, 'a client cannot write a pin itself');

-- The friend pins back, and cannot see the owner's pin.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
select is((select count(*) from public.friend_pins), 0::bigint, 'a pin is private to the one who set it');
select public.set_friend_pin('00000000-0000-4000-8000-000000000701', true);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
select public.set_friend_pin('00000000-0000-4000-8000-000000000702', false);
select is((select count(*) from public.friend_pins), 0::bigint, 'the owner takes a pin back');
select public.set_friend_pin('00000000-0000-4000-8000-000000000702', true);
select public.remove_friend('00000000-0000-4000-8000-000000000702');
reset role;
select is((select count(*) from public.friend_pins), 0::bigint, 'unfriending removes the pins in both directions');

-- Friends again, pinned again, then blocked.
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000702','accepted');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
select public.set_friend_pin('00000000-0000-4000-8000-000000000701', true);
select is((select count(*) from public.friend_pins), 1::bigint, 'a new friendship can be pinned again');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
select public.block_user('00000000-0000-4000-8000-000000000702');
reset role;
select is((select count(*) from public.friend_pins), 0::bigint, 'blocking removes the other person''s pin too');
select * from finish();
rollback;
