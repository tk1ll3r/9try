-- Disposable local database only; all fixtures roll back.
-- a = d01 posts photos. b = d02 and c = d03 are friends of a. d = d04 is a friend who is then unfriended,
-- e = d05 a friend who is then blocked, s = d06 a stranger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

insert into auth.users(id, instance_id, aud, role, email)
select ('00000000-0000-4000-8000-000000000d0' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'moment-' || n || '@example.invalid'
from generate_series(1, 6) n;
update public.profiles set display_name = 'An' where id = '00000000-0000-4000-8000-000000000d01';
update public.profiles set display_name = 'Bình' where id = '00000000-0000-4000-8000-000000000d02';
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000d01','00000000-0000-4000-8000-000000000d02','accepted'),
  ('00000000-0000-4000-8000-000000000d03','00000000-0000-4000-8000-000000000d01','accepted'),
  ('00000000-0000-4000-8000-000000000d04','00000000-0000-4000-8000-000000000d01','accepted'),
  ('00000000-0000-4000-8000-000000000d01','00000000-0000-4000-8000-000000000d05','accepted');
insert into public.notification_preferences(user_id, push_enabled) values ('00000000-0000-4000-8000-000000000d01', true);
delete from realtime.messages;

-- A file in the bucket, as the Storage service stores an upload.
create function pg_temp.upload(p_owner text, p_id text) returns void language sql as $$
  insert into storage.objects(bucket_id, name, owner_id) values ('moments', p_owner || '/' || p_id || '.jpg', p_owner)
$$;
-- How many files of the bucket the signed-in person can read, of those with this name.
create function pg_temp.readable(p_name text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = 'moments' and name = p_name
$$;
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, true) $$;
select pg_temp.upload('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-0000000000f1');

select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'moments:%'), 3::bigint, 'the bucket has its three rules: write, read, remove');

-- Posting.
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select throws_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f9', 1080, 1350)$$, 'P0001', 'photo not uploaded', 'a photo without its file is not posted');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f1', 1080, 1350, 'coffee', '  Sáng nay  ')$$, 'a photo whose file is there is posted, for every friend');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f1', 1080, 1350, 'coffee', 'lần hai')$$, 'posting it again after a lost answer is no error');
select is((select count(*) || ' ' || max(caption) || ' ' || max(mode) || ' ' || bool_and(seen)::text from public.list_moments()), '1 Sáng nay coffee true', 'and makes no second photo; the owner sees it, trimmed, with its mode');
select is((select owner_name || ' ' || photo_count from public.list_moment_archive_people()), 'An 1', 'the archive groups the owner''s photos with a count');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id) values ('moments', '00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f2.jpg', '00000000-0000-4000-8000-000000000d01')$$,
  'a person writes a file under their own id');
select throws_ok($$insert into storage.objects(bucket_id, name, owner_id) values ('moments', '00000000-0000-4000-8000-000000000d02/x.jpg', '00000000-0000-4000-8000-000000000d01')$$,
  '42501', null, 'and not under someone else''s');
select throws_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f2', 1080, 810, null, '', array['00000000-0000-4000-8000-000000000d06']::uuid[])$$,
  'P0001', 'viewer not a friend', 'a photo cannot be posted for a stranger');
select lives_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c001', 'Đi dạo', 'camera', '#22c55e')$$,
  'the photo owner can save a custom mode');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f2', 1080, 810, 'custom_0000000000004000800000000000c001', '', array['00000000-0000-4000-8000-000000000d03']::uuid[], true, 60)$$,
  'a second photo can snapshot and activate a custom mode in the same transaction');
select is((select mode || ' ' || mode_label from public.list_moments() where id = '00000000-0000-4000-8000-0000000000f2'), 'custom_0000000000004000800000000000c001 Đi dạo', 'the owner sees the custom mode snapshot on the photo');
select is((select mode from public.activity_modes where user_id = '00000000-0000-4000-8000-000000000d01'), 'custom_0000000000004000800000000000c001', 'posting activated the selected custom mode atomically');
select throws_ok($$select * from public.moments$$, '42501', null, 'nobody reads the table itself');

-- A friend it was posted for.
select pg_temp.as('00000000-0000-4000-8000-000000000d02');
select is((select count(*) || ' ' || bool_or(seen)::text || ' ' || coalesce(max(views)::text, '-') || ' ' || max(owner_name) from public.list_moments()), '1 false - An',
  'a friend sees the photo for all friends, not yet looked at, without the owner''s counts');
select is((select owner_name || ' ' || photo_count from public.list_moment_archive_people()), 'An 1', 'a friend sees the archive album they may access');
select is(pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 1::bigint, 'and reads its file');
select is(pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f2.jpg'), 0::bigint, 'the file of the photo for someone else is not theirs to read');
select throws_ok($$select public.see_moment('00000000-0000-4000-8000-0000000000f2')$$, 'P0001', 'photo not found', 'nor can they mark it as looked at');
select is((select count(*) from public.notifications where category = 'moment' and title = 'Ảnh mới · An' and action_path = '/moments/00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1'), 1::bigint,
  'the friend has one note that opens the exact photo');
select lives_ok($$select public.see_moment('00000000-0000-4000-8000-0000000000f1')$$, 'the friend looks at the photo');
select is((select bool_and(seen) from public.list_moments()), true, 'which is then marked as looked at');
select is((select count(*) from public.notifications where category = 'moment'), 0::bigint, 'and the note leaves the inbox, with nothing left to look at');
select throws_ok($$select public.react_to_moment('00000000-0000-4000-8000-0000000000f1', 'thumbsdown')$$, 'P0001', 'invalid reaction', 'a reaction outside the six is refused');
select lives_ok($$select public.react_to_moment('00000000-0000-4000-8000-0000000000f1', 'heart')$$, 'the friend reacts');
select lives_ok($$select public.react_to_moment('00000000-0000-4000-8000-0000000000f1', 'fire')$$, 'and changes the reaction');
select is((select my_reaction from public.list_moments()), 'fire', 'one reaction per person: the last one');
select throws_ok($$select * from public.list_moment_views('00000000-0000-4000-8000-0000000000f1')$$, 'P0001', 'photo not found', 'who looked is not for a viewer to read');
select throws_ok($$select public.delete_moment('00000000-0000-4000-8000-0000000000f1')$$, 'P0001', 'photo not found', 'and a viewer cannot delete the photo');

-- The chosen friend sees both.
select pg_temp.as('00000000-0000-4000-8000-000000000d03');
select is((select count(*) from public.list_moments()), 2::bigint, 'the chosen friend sees both photos');
select is((select photo_count from public.list_moment_archive_people() where owner_id='00000000-0000-4000-8000-000000000d01'), 2::bigint, 'the album count includes the owner''s older photo');
select is((select count(*) from public.list_moment_archive_for_owner('00000000-0000-4000-8000-000000000d01')), 2::bigint, 'the per-person archive endpoint returns that full album');
select is((select mode_label || ' ' || mode_icon || ' ' || mode_color from public.list_moments() where id = '00000000-0000-4000-8000-0000000000f2'), 'Đi dạo camera #22c55e', 'a friend sees the custom mode while viewing its photo');
select is((select count(*) from public.notifications where category = 'moment' and user_id = '00000000-0000-4000-8000-000000000d03' and action_path = '/moments/00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f2'), 1::bigint, 'each photo has its own exact notification target');
select is(pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f2.jpg'), 1::bigint, 'and reads the file posted for them');

-- The owner.
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select is((select views || ' ' || reactions::text from public.list_moments() where id = '00000000-0000-4000-8000-0000000000f1'), '1 {"fire": 1}', 'the owner sees how many looked and what they reacted with');
select is((select display_name || ' ' || reaction from public.list_moment_views('00000000-0000-4000-8000-0000000000f1')), 'Bình fire', 'and who');
select throws_ok($$select public.react_to_moment('00000000-0000-4000-8000-0000000000f1', 'heart')$$, 'P0001', 'photo not found', 'nobody reacts to their own photo');
select is((select count(*) from public.notifications where category = 'moment_reaction' and title = 'Bình thả cảm xúc vào ảnh của bạn'), 1::bigint, 'a reaction is one note in the owner''s inbox, however often it changes');
reset role;
select is(private.push_allowed('00000000-0000-4000-8000-000000000d01', 'moment_reaction'), false, 'a reaction is not pushed unless the person asks for that');
select is(private.push_allowed('00000000-0000-4000-8000-000000000d01', 'moment'), true, 'a new photo is');
select is((select count(*) from realtime.messages where topic = 'user:00000000-0000-4000-8000-000000000d02' and event = 'moments') > 0, true, 'the friend''s screen was told about the photo');

-- A stranger, an ex-friend, a blocked person.
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d06');
select is((select count(*) from public.list_moments()) + pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 0::bigint, 'a stranger sees no photo and reads no file');
select is((select count(*) from public.list_moment_archive_for_owner('00000000-0000-4000-8000-000000000d01')), 0::bigint, 'a person cannot filter the archive to bypass its audience');
select pg_temp.as('00000000-0000-4000-8000-000000000d04');
select is((select count(*) from public.list_moments()), 1::bigint, 'a friend sees the photo while they are friends');
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select public.remove_friend('00000000-0000-4000-8000-000000000d04');
select public.block_user('00000000-0000-4000-8000-000000000d05');
select pg_temp.as('00000000-0000-4000-8000-000000000d04');
select is((select count(*) from public.list_moments()) + pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 0::bigint, 'after the friendship ended they see nothing and read no file');
select pg_temp.as('00000000-0000-4000-8000-000000000d05');
select is((select count(*) from public.list_moments()) + pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 0::bigint, 'a blocked person sees nothing and reads no file');

-- The 24th hour.
reset role;
update public.moments set expires_at = now() - interval '1 minute' where id = '00000000-0000-4000-8000-0000000000f1';
insert into public.notifications(user_id, category, title, action_path, dedupe_key)
values ('00000000-0000-4000-8000-000000000d02', 'moment', 'Ảnh mới · An', '/moments/00000000-0000-4000-8000-000000000d01', 'moment:00000000-0000-4000-8000-000000000d01:00000000-0000-4000-8000-000000000d02');
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d02');
select is((select count(*) from public.list_moments()) + pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 1::bigint, 'an expired photo leaves the active story feed but stays readable in the archive');
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select is(pg_temp.readable('00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f1.jpg'), 1::bigint, 'its owner still reaches the file, to remove it');
reset role;
select private.expire_moments();
select is((select count(*) from public.moments where id = '00000000-0000-4000-8000-0000000000f1'), 1::bigint, 'the scheduled job preserves the archived row');
select is((select count(*) from public.notifications where category = 'moment' and user_id = '00000000-0000-4000-8000-000000000d02'), 0::bigint, 'and the note about it');

-- What the worker removes: files that no row names, an hour after they were written.
update storage.objects set created_at = now() - interval '2 hours' where name like '%0000000000f1.jpg';
select pg_temp.upload('00000000-0000-4000-8000-000000000d02', '00000000-0000-4000-8000-0000000000f7');
set local role service_role;
select is((select count(*) from public.orphan_media_files()), 0::bigint, 'the worker keeps files that still belong to an archived photo and ignores a recent upload');
reset role;
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d02');
select throws_ok($$select * from public.orphan_media_files()$$, '42501', null, 'that list is for the worker only');

-- Twenty photos in 24 hours, and deleting one's own.
reset role;
insert into public.moments(id, owner_id, path, width, height)
select gen_random_uuid(), '00000000-0000-4000-8000-000000000d02', 'filler/' || n, 10, 10 from generate_series(1, 20) n;
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d02');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f7', 1080, 1080)$$, 'the archive accepts more than twenty photos in a day');
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select is(public.delete_moment('00000000-0000-4000-8000-0000000000f2'), '00000000-0000-4000-8000-000000000d01/00000000-0000-4000-8000-0000000000f2.jpg', 'deleting one''s photo gives back the name of its file');
select is((select count(*) from public.list_moments() where owner_id = '00000000-0000-4000-8000-000000000d01'), 0::bigint, 'and the photo is gone');
select pg_temp.as('00000000-0000-4000-8000-000000000d03');
select is((select count(*) from public.list_moments()), 0::bigint, 'for the friend it was posted for too');
reset role;

-- A list of people, even an empty one, never turns into "every friend".
select pg_temp.upload('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-0000000000f5');
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-000000000d01');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-0000000000f5', 1080, 810, null, '', '{}'::uuid[])$$, 'a photo for an empty list of people is posted');
select is((select audience from public.list_moments() where id = '00000000-0000-4000-8000-0000000000f5'), 'selected', 'it is for chosen people, of whom there are none');
select pg_temp.as('00000000-0000-4000-8000-000000000d03');
select is((select count(*) from public.list_moments()), 0::bigint, 'so no friend sees it');
reset role;

set local role anon;
select throws_ok($$select public.list_moments()$$, '42501', null, 'an anonymous visitor cannot call any of it');
select throws_ok($$select * from public.list_moment_archive_people()$$, '42501', null, 'an anonymous visitor cannot list archive albums');
reset role;
select * from finish();
rollback;
