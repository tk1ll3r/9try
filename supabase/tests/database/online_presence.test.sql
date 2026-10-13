-- Disposable local database only; all fixtures roll back.
-- a = 901 (the person), b = 902 and c = 903 (friends of a), d = 904 (stranger).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000901','00000000-0000-0000-0000-000000000000','authenticated','authenticated','on-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000902','00000000-0000-0000-0000-000000000000','authenticated','authenticated','on-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000903','00000000-0000-0000-0000-000000000000','authenticated','authenticated','on-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000904','00000000-0000-0000-0000-000000000000','authenticated','authenticated','on-d@example.invalid');
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','accepted'),
  ('00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000901','accepted');
delete from realtime.messages;

-- Nobody is shown until they choose to be, and nothing is stored about them.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select is(public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1'), false, 'a person who has not chosen to share is told to stop calling');
reset role;
select is((select count(*) from public.presence_sessions), 0::bigint, 'and no session is stored for them');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select count(*) from public.list_friend_presence()), 0::bigint, 'a friend sees no status of someone who does not share');

-- Shared with every friend.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.set_presence_sharing('friends');
select is(public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1'), true, 'with sharing on, the session counts');
select throws_ok($$select * from public.presence_sessions$$, '42501', null, 'a client cannot read the sessions table');
select throws_ok($$insert into public.presence_settings(user_id, audience) values ('00000000-0000-4000-8000-000000000901', 'friends')$$, '42501', null, 'nor write the settings itself');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select state from public.list_friend_presence() where user_id = '00000000-0000-4000-8000-000000000901'), 'active', 'a friend sees the person as active');
select is((select last_active_at from public.list_friend_presence() where user_id = '00000000-0000-4000-8000-000000000901'), null, 'without the time they were last seen, which was not offered');
select is((select count(*) from public.presence_settings), 0::bigint, 'a friend cannot read the person''s settings');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
select is((select count(*) from public.list_friend_presence()), 0::bigint, 'a stranger sees nothing');
reset role;
select is((select count(*) from realtime.messages where event = 'presence' and topic = 'user:00000000-0000-4000-8000-000000000902'), 2::bigint, 'the friend was told when sharing began and when the person appeared');
select is((select count(*) from realtime.messages where event = 'presence' and topic = 'user:00000000-0000-4000-8000-000000000904'), 0::bigint, 'the stranger heard nothing');
select is((select last_active_at from public.presence_settings where user_id = '00000000-0000-4000-8000-000000000901'), null, 'the time of last activity is not kept unless it is shown');

-- A second beat tells nobody. A second tab keeps the person active when the first one closes.
delete from realtime.messages;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1');
select public.presence_heartbeat('00000000-0000-4000-8000-0000000009a2');
select public.presence_leave('00000000-0000-4000-8000-0000000009a1');
reset role;
select is((select count(*) from realtime.messages where event = 'presence'), 0::bigint, 'beats and a closed tab are no news while another tab is open');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select state from public.list_friend_presence()), 'active', 'the person is still active through the second tab');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.presence_leave('00000000-0000-4000-8000-0000000009a2');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select state from public.list_friend_presence()), 'recent', 'after the last tab closed the person was recently active');
reset role;
select is((select count(*) from realtime.messages where event = 'presence' and topic = 'user:00000000-0000-4000-8000-000000000902'), 1::bigint, 'and the friend was told once');

-- A session that stops calling lapses by itself: after 90 seconds it is not active, after 15 minutes it is gone.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1');
reset role;
update public.presence_sessions set seen_at = now() - interval '2 minutes';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select state from public.list_friend_presence()), 'recent', 'no sign of life for two minutes: recently active');
reset role;
update public.presence_sessions set seen_at = now() - interval '20 minutes';
select private.purge_stale_presence();
select is((select count(*) from public.presence_sessions), 0::bigint, 'a session without a sign of life for 15 minutes is removed');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select state from public.list_friend_presence()), 'idle', 'and the person is idle');

-- The time of last activity is kept only while its owner shows it.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.set_presence_sharing('friends', '{}', true);
select public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select isnt((select last_active_at from public.list_friend_presence()), null, 'a friend sees the time once its owner shows it');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.set_presence_sharing('friends', '{}', false);
reset role;
select is((select last_active_at from public.presence_settings where user_id = '00000000-0000-4000-8000-000000000901'), null, 'turning that off forgets the time');

-- Only the chosen friends. A stranger cannot be chosen, and a friend who is dropped is told to let go.
delete from realtime.messages;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select throws_ok($$select public.set_presence_sharing('selected', array['00000000-0000-4000-8000-000000000904']::uuid[])$$, 'P0001', 'no valid recipients', 'a stranger cannot be chosen as a viewer');
select public.set_presence_sharing('selected', array['00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000904']::uuid[]);
select is((select array_agg(viewer_id::text) from public.presence_viewers), array['00000000-0000-4000-8000-000000000902'], 'of a friend and a stranger, only the friend is kept');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
select is((select count(*) from public.list_friend_presence()), 0::bigint, 'a friend who was not chosen sees nothing any more');
reset role;
select is((select count(*) from realtime.messages where event = 'presence' and topic = 'user:00000000-0000-4000-8000-000000000903'), 1::bigint, 'and their screen was told to reload');

-- Unfriending ends it at once, in the data and on the screen.
delete from realtime.messages;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.remove_friend('00000000-0000-4000-8000-000000000902');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select count(*) from public.list_friend_presence()), 0::bigint, 'an ex-friend sees nothing');
reset role;
select is((select count(*) from public.presence_viewers), 0::bigint, 'and is no longer on the list of viewers');
select is((select count(*) from realtime.messages where event = 'presence' and topic = 'user:00000000-0000-4000-8000-000000000902'), 1::bigint, 'their screen was told to reload');

-- Turning sharing off forgets the open sessions.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.set_presence_sharing('nobody');
reset role;
select is((select count(*) from public.presence_sessions), 0::bigint, 'sharing with nobody removes the sessions');
set local role anon;
select throws_ok($$select public.presence_heartbeat('00000000-0000-4000-8000-0000000009a1')$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;
